// LaMa inpainting (Carve/LaMa-ONNX, lama_fp32.onnx). Fixed 512x512 input:
//   image float32 [1,3,512,512] NCHW RGB 0..1
//   mask  float32 [1,1,512,512] (1.0 = inpaint)
//   output [1,3,512,512] (range auto-detected: max <= 2 -> x255)
// Strategy: crop a 512x512 box around the mask when it fits (best quality,
// constant latency); otherwise resize the whole image to 512 (fallback).
// Only the feathered masked region is pasted back — the rest of the model
// output is hallucinated filler.
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const { modelPath } = require('../models');

let _session = null;

async function loadLama() {
  if (!_session) _session = await ort.InferenceSession.create(modelPath('lama_fp32.onnx'));
  return _session;
}

const BOX = 512;

/** Bounding box + centroid of mask pixels > 128. */
async function maskStats(maskRaw, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1, sumX = 0, sumY = 0, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (maskRaw[y * width + x] > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x; sumY += y; n++;
      }
    }
  }
  if (!n) throw new Error('mask is empty — nothing to erase');
  return {
    minX, minY, maxX, maxY,
    cx: Math.round(sumX / n), cy: Math.round(sumY / n),
    w: maxX - minX + 1, h: maxY - minY + 1,
  };
}

function chw(raw, width, height, channels, scale) {
  const out = new Float32Array(channels * width * height);
  const plane = width * height;
  for (let c = 0; c < channels; c++) {
    for (let i = 0; i < plane; i++) out[c * plane + i] = (raw[i * channels + c] / 255) * scale;
  }
  return out;
}

async function runLama(session, imgRaw512, maskRaw512) {
  const feeds = {
    image: new ort.Tensor('float32', chw(imgRaw512, BOX, BOX, 3, 1), [1, 3, BOX, BOX]),
    mask: new ort.Tensor('float32',
      Float32Array.from(maskRaw512, (v) => (v > 128 ? 1 : 0)), [1, 1, BOX, BOX]),
  };
  const out = await session.run(feeds);
  const d = out.output.data; // [1,3,512,512]
  let max = 0;
  for (let i = 0; i < d.length; i += 997) if (d[i] > max) max = d[i];
  const scale = max <= 2 ? 255 : 1;
  const plane = BOX * BOX;
  const raw = Buffer.alloc(plane * 3);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      const v = Math.round(Math.min(Math.max(d[c * plane + i] * scale, 0), 255));
      raw[i * 3 + c] = v;
    }
  }
  return raw; // interleaved RGB 512x512
}

/**
 * 7x7 max-filter dilation on a raw 1-channel greyscale buffer, separable
 * two-pass. (sharp 0.32.6 has no .dilate() — added in sharp 0.34.)
 */
function dilateRaw(raw, width, height, size) {
  const half = (size - 1) / 2;
  const tmp = Buffer.alloc(raw.length);
  const out = Buffer.alloc(raw.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 0;
      for (let dx = -half; dx <= half; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < width && raw[y * width + xx] > m) m = raw[y * width + xx];
      }
      tmp[y * width + x] = m;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 0;
      for (let dy = -half; dy <= half; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < height && tmp[yy * width + x] > m) m = tmp[yy * width + x];
      }
      out[y * width + x] = m;
    }
  }
  return out;
}

/**
 * Inpaint the masked region of inputPath. Returns a full-size PNG buffer
 * identical to the input outside the (feathered) mask.
 */
async function inpaint(session, inputPath, maskPng) {
  const meta = await sharp(inputPath).metadata();
  const W = meta.width, H = meta.height;
  // Dilate a little so LaMa also rewrites the object's edge pixels.
  // (sharp 0.32.6 has no .dilate(); and its raw output expands greyscale to
  // 3-channel sRGB unless .greyscale() is applied, so the factory below
  // pins the pipeline to 1 channel.)
  const { data: grey, info: greyInfo } = await sharp(maskPng).greyscale().raw()
    .toBuffer({ resolveWithObject: true });
  const maskDims = { width: greyInfo.width, height: greyInfo.height, channels: 1 };
  const dilatedRaw = dilateRaw(grey, greyInfo.width, greyInfo.height, 7);
  const dilated = () => sharp(dilatedRaw, { raw: maskDims }).greyscale();
  const { data: maskRaw } = await dilated().raw().toBuffer({ resolveWithObject: true });
  const stats = await maskStats(maskRaw, W, H);

  let inpaintedFull; // Buffer of raw RGB at original size
  let region = null; // {left, top} when using the crop path
  if (stats.w <= BOX - 64 && stats.h <= BOX - 64 && W >= BOX && H >= BOX) {
    const left = Math.min(Math.max(0, stats.cx - BOX / 2), W - BOX);
    const top = Math.min(Math.max(0, stats.cy - BOX / 2), H - BOX);
    const imgCrop = await sharp(inputPath).removeAlpha()
      .extract({ left: Math.round(left), top: Math.round(top), width: BOX, height: BOX })
      .raw().toBuffer();
    const maskCrop = await dilated()
      .extract({ left: Math.round(left), top: Math.round(top), width: BOX, height: BOX })
      .raw().toBuffer();
    const outRaw = await runLama(session, imgCrop, maskCrop);
    inpaintedFull = await sharp(outRaw, { raw: { width: BOX, height: BOX, channels: 3 } })
      .png().toBuffer();
    region = { left: Math.round(left), top: Math.round(top) };
  } else {
    // fit:'fill' squashes to 512 and stretches back, so the round-trip
    // mapping is identity. (Default fit:'cover' CROPS to aspect, which
    // shifts the paste-back relative to the feather mask on non-square
    // images.) Aspect distortion inside the model input beats misalignment.
    const imgSmall = await sharp(inputPath).removeAlpha()
      .resize(BOX, BOX, { fit: 'fill' }).raw().toBuffer();
    const maskSmall = await dilated().resize(BOX, BOX, { fit: 'fill' }).raw().toBuffer();
    const outRaw = await runLama(session, imgSmall, maskSmall);
    inpaintedFull = await sharp(outRaw, { raw: { width: BOX, height: BOX, channels: 3 } })
      .resize(W, H, { fit: 'fill' }).png().toBuffer();
  }

  // Feather the mask and use it as the alpha of an overlay, so only the
  // erased region is composited back over the original. (Raw 1-channel:
  // joinChannel appends every channel of a PNG-decoded image.)
  const feather = region
    ? await dilated()
        .extract({ left: region.left, top: region.top, width: BOX, height: BOX })
        .blur(2).raw().toBuffer()
    : await dilated().blur(2).raw().toBuffer();
  const overlay = await sharp(inpaintedFull)
    .joinChannel(feather, {
      raw: { width: region ? BOX : W, height: region ? BOX : H, channels: 1 },
    })
    .png().toBuffer();
  return sharp(inputPath)
    .composite([{ input: overlay, left: region ? region.left : 0, top: region ? region.top : 0 }])
    .png()
    .toBuffer();
}

module.exports = { loadLama, inpaint };
