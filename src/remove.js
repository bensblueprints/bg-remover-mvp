// Core background-removal pipeline. Runs 100% locally via
// @imgly/background-removal-node (ONNX). Shared by the Electron main
// process and the smoke test.
const path = require('path');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');

let _removeBackgroundFn = null;

/** Lazy ESM import (the @imgly package is ESM-only). */
async function loadImgly() {
  if (!_removeBackgroundFn) {
    const mod = await import('@imgly/background-removal-node');
    _removeBackgroundFn = mod.removeBackground;
  }
  return _removeBackgroundFn;
}

/** Where the ONNX model gets cached after first download. */
function modelCacheHint() {
  // @imgly caches fetched resources internally; this is informational only.
  return path.join(os.homedir(), '.cache');
}

/**
 * Remove the background from an image file and write a transparent PNG.
 * @param {string} inputPath  JPG/PNG/WebP input
 * @param {string} outputPath PNG output (transparent)
 * @param {{onProgress?: (key:string,current:number,total:number)=>void}} [opts]
 */
async function removeBackground(inputPath, outputPath, opts = {}) {
  const removeBg = await loadImgly();
  const blob = await removeBg(pathToFileURL(inputPath), {
    output: { format: 'image/png', quality: 1.0 },
    progress: opts.onProgress,
  });
  const buf = Buffer.from(await blob.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  return outputPath;
}

/** Composite a transparent PNG onto a flat background color. */
async function compositeOnColor(inputPath, outputPath, hexColor) {
  const { width, height } = await sharp(inputPath).metadata();
  const bg = hexToRgb(hexColor);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp({
    create: { width, height, channels: 4, background: { ...bg, alpha: 1 } },
  })
    .composite([{ input: inputPath }])
    .png()
    .toFile(outputPath);
  return outputPath;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function pathToFileURL(p) {
  return require('url').pathToFileURL(p).href;
}

module.exports = { removeBackground, compositeOnColor, modelCacheHint };
