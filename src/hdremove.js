// HD background removal via BiRefNet-lite (onnx-community/BiRefNet_lite-ONNX,
// MIT). Slower than U²-Net (~10-60s/image on CPU) but keeps held objects and
// product edges the fast model drops.
//   input  input_image float32 [1,3,1024,1024] NCHW RGB ImageNet-normalized
//   output output_image float32 [1,1,1024,1024] raw logits -> sigmoid
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { modelPath } = require('./models');

const SIZE = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let _session = null;
async function loadBiRefNet() {
  // enableCpuMemArena: false — under Electron's utilityProcess the CPU arena
  // allocator aborts (SIGTRAP, exit 5) on this model's large allocations.
  if (!_session) _session = await ort.InferenceSession.create(modelPath('birefnet_lite_fp32.onnx'), { enableCpuMemArena: false });
  return _session;
}

async function removeBackgroundHD(inputPath, outputPath, opts = {}) {
  const session = await loadBiRefNet();
  // Bake in EXIF orientation first, then everything downstream uses the
  // oriented pixels. Stretch (not letterbox) to 1024x1024. sharp has no
  // 'bilinear' kernel — 'cubic' is its smooth equivalent.
  const orientedBuf = await sharp(inputPath).rotate().png().toBuffer();
  const meta = await sharp(orientedBuf).metadata();
  const origW = meta.width, origH = meta.height;
  const { data } = await sharp(orientedBuf)
    .resize(SIZE, SIZE, { fit: 'fill', kernel: 'cubic' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const plane = SIZE * SIZE;
  const f32 = new Float32Array(3 * plane);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < plane; i++) {
      f32[c * plane + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  if (opts.onProgress) opts.onProgress('inference', 0, 1);
  const out = await session.run({ input_image: new ort.Tensor('float32', f32, [1, 3, SIZE, SIZE]) });
  const logits = out.output_image.data;
  const mask = Buffer.alloc(plane);
  for (let i = 0; i < plane; i++) mask[i] = Math.round(255 / (1 + Math.exp(-logits[i])));
  // Resize the mask back to the original size, then join it as the alpha
  // channel. Two quirks of sharp 0.32.6 shape this:
  //  - 1-channel raw -> resize expands it to 3 channels (values are not
  //    zeroed), which corrupts downstream raw handling, so the resize
  //    round-trips through PNG and we extract one channel back to raw.
  //  - joinChannel appends every decoded channel, so the mask must be a
  //    1-channel raw buffer with a raw descriptor (the inpaint.js pattern).
  // removeAlpha() must run in its own sharp step: chained with joinChannel
  // it silently wins and the joined mask is dropped. Inputs that already
  // carry alpha (e.g. PNGs) would otherwise keep their original opaque
  // alpha alongside the joined mask.
  const alphaPng = await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .resize(origW, origH, { fit: 'fill', kernel: 'cubic' })
    .png()
    .toBuffer();
  const alpha = await sharp(alphaPng).extractChannel(0).raw().toBuffer();
  const rgb = await sharp(orientedBuf).removeAlpha().png().toBuffer();
  const rgba = await sharp(rgb)
    .joinChannel(alpha, { raw: { width: origW, height: origH, channels: 1 } })
    .png()
    .toBuffer();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rgba);
  if (opts.onProgress) opts.onProgress('inference', 1, 1);
  return outputPath;
}

module.exports = { removeBackgroundHD, loadBiRefNet };
