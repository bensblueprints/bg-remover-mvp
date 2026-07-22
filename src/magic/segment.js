// MobileSAM click→mask. Encoder runs once per image (the expensive part),
// decoder runs per click (~real-time). I/O contract (verified against the
// actual ONNX files):
//   encoder input  input_image float32 [H,W,3] HWC RGB 0-255 unnormalized,
//                  longest side resized to exactly 1024, aspect preserved
//                  (this export assumes 1024-longest-side geometry; feeding a
//                  smaller image without upscaling garbles the decoder output)
//   encoder output image_embeddings [1,256,64,64]
//   decoder inputs image_embeddings, point_coords [1,N,2], point_labels [1,N],
//                  mask_input [1,1,256,256] zeros, has_mask_input [1] = 0,
//                  orig_im_size [2] = resized H,W
//   decoder output masks [1,1,rH,rW] logits, threshold > 0 (single candidate)
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const { modelPath } = require('../models');

let _sessions = null;

/** Lazy-load both ONNX sessions (once per process). */
async function loadSessions() {
  if (!_sessions) {
    const [encoder, decoder] = await Promise.all([
      ort.InferenceSession.create(modelPath('mobilesam.encoder.onnx')),
      ort.InferenceSession.create(modelPath('mobilesam.decoder.onnx')),
    ]);
    _sessions = { encoder, decoder };
  }
  return _sessions;
}

/** Encode an image file; returns embeddings + the geometry the decoder needs. */
async function encodeImage(encoder, inputPath) {
  const meta = await sharp(inputPath).metadata();
  const origW = meta.width;
  const origH = meta.height;
  const scale = 1024 / Math.max(origW, origH);
  const resizedW = Math.max(1, Math.round(origW * scale));
  const resizedH = Math.max(1, Math.round(origH * scale));
  const { data } = await sharp(inputPath)
    .resize(resizedW, resizedH)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const input = new ort.Tensor('float32', Float32Array.from(data), [resizedH, resizedW, 3]);
  const out = await encoder.run({ input_image: input });
  return { embeddings: out.image_embeddings, resizedW, resizedH, origW, origH };
}

/**
 * Turn one foreground click (original-image pixel coords) into a binary
 * PNG mask at the original image size (255 = object, 0 = rest).
 */
async function decodeMask(decoder, enc, click) {
  const sx = enc.resizedW / enc.origW;
  const sy = enc.resizedH / enc.origH;
  const feeds = {
    image_embeddings: enc.embeddings,
    // click + padding point; labels: 1 = foreground, -1 = padding
    point_coords: new ort.Tensor('float32',
      new Float32Array([click.x * sx, click.y * sy, 0, 0]), [1, 2, 2]),
    point_labels: new ort.Tensor('float32', new Float32Array([1, -1]), [1, 2]),
    mask_input: new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
    orig_im_size: new ort.Tensor('float32',
      new Float32Array([enc.resizedH, enc.resizedW]), [2]),
  };
  const out = await decoder.run(feeds);
  const logits = out.masks.data; // [1,1,resizedH,resizedW]
  const bin = Buffer.alloc(enc.resizedW * enc.resizedH);
  for (let i = 0; i < bin.length; i++) bin[i] = logits[i] > 0 ? 255 : 0;
  return sharp(bin, { raw: { width: enc.resizedW, height: enc.resizedH, channels: 1 } })
    .resize(enc.origW, enc.origH, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

module.exports = { loadSessions, encodeImage, decodeMask };
