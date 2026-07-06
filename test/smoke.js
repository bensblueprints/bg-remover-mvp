// Smoke test: generates a real test image with sharp, runs the actual
// local AI background-removal pipeline, and asserts the output is a
// valid PNG with an alpha channel. Downloads the ONNX model on first
// run (~80MB, cached afterwards) — this is a real end-to-end check.
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const sharp = require('sharp');
const { removeBackground } = require('../src/remove');

const FIXTURES = path.join(__dirname, 'fixtures');
const OUT = path.join(__dirname, 'out');

async function makeFixture() {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const file = path.join(FIXTURES, 'circle.png');
  // Red circle (subject) on a solid teal background (distinct backdrop).
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#0e8f8f"/>
    <circle cx="256" cy="256" r="140" fill="#e23b3b"/>
    <circle cx="256" cy="256" r="140" fill="none" stroke="#7a1f1f" stroke-width="8"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

(async () => {
  const started = Date.now();
  console.log('[smoke] generating fixture image with sharp...');
  const input = await makeFixture();
  const meta = await sharp(input).metadata();
  assert.strictEqual(meta.width, 512, 'fixture width');
  console.log(`[smoke] fixture ok: ${input} (${meta.width}x${meta.height})`);

  fs.mkdirSync(OUT, { recursive: true });
  const output = path.join(OUT, 'circle-cutout.png');

  console.log('[smoke] running local AI background removal (model downloads on first run, ~80MB)...');
  await removeBackground(input, output, {
    onProgress: (key, current, total) => {
      if (total) {
        process.stdout.write(`\r[smoke] ${key}: ${Math.round((current / total) * 100)}%   `);
      }
    },
  });
  process.stdout.write('\n');

  assert.ok(fs.existsSync(output), 'output PNG exists');
  const outMeta = await sharp(output).metadata();
  assert.strictEqual(outMeta.format, 'png', 'output is a PNG');
  assert.ok(outMeta.hasAlpha, 'output PNG has an alpha channel');
  assert.strictEqual(outMeta.width, 512, 'output keeps full input resolution');

  // Verify the removal actually did something: corners (background) should
  // be transparent, center (subject) should be opaque.
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  const cornerAlpha = (alphaAt(5, 5) + alphaAt(506, 5) + alphaAt(5, 506) + alphaAt(506, 506)) / 4;
  const centerAlpha = alphaAt(256, 256);
  console.log(`[smoke] corner alpha avg: ${cornerAlpha.toFixed(1)}, center alpha: ${centerAlpha}`);
  assert.ok(cornerAlpha < 64, 'background corners are (mostly) transparent');
  assert.ok(centerAlpha > 128, 'subject center is (mostly) opaque');

  // Also exercise the flat-color background compositing path used by the app.
  const flat = path.join(OUT, 'circle-white-bg.png');
  const { compositeOnColor } = require('../src/remove');
  await compositeOnColor(output, flat, '#ffffff');
  const flatMeta = await sharp(flat).metadata();
  assert.strictEqual(flatMeta.format, 'png', 'flat output is a PNG');
  console.log(`[smoke] flat-color composite ok: ${flat}`);

  console.log(`[smoke] PASS in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`[smoke] transparent cutout: ${output}`);
})().catch((err) => {
  console.error('\n[smoke] FAIL:', err);
  process.exit(1);
});
