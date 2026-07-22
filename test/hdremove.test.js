// HD engine test: runs the BiRefNet-lite pipeline on a real fixture image
// and asserts a valid transparent cutout comes out. The model must already
// be present (ensureModels downloads it on first run, ~224MB, cached after).
// Inference takes ~10-60s on CPU — expected.
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const sharp = require('sharp');
const { ensureModels } = require('../src/models');
const { removeBackgroundHD } = require('../src/hdremove');

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
  console.log('[hd] generating fixture image with sharp...');
  const input = await makeFixture();
  const meta = await sharp(input).metadata();
  assert.strictEqual(meta.width, 512, 'fixture width');
  console.log(`[hd] fixture ok: ${input} (${meta.width}x${meta.height})`);

  console.log('[hd] ensuring BiRefNet-lite model (downloads ~224MB on first run)...');
  await ensureModels(['birefnet_lite_fp32.onnx'], (f, done, total, percent) => {
    process.stdout.write(`\r[hd] ${f}: ${percent}%   `);
  });
  process.stdout.write('\n');

  fs.mkdirSync(OUT, { recursive: true });
  const output = path.join(OUT, 'circle-cutout-hd.png');

  console.log('[hd] running BiRefNet-lite inference (~10-60s on CPU)...');
  await removeBackgroundHD(input, output);

  assert.ok(fs.existsSync(output), 'output PNG exists');
  const outMeta = await sharp(output).metadata();
  assert.strictEqual(outMeta.format, 'png', 'output is a PNG');
  assert.ok(outMeta.hasAlpha, 'output PNG has an alpha channel');
  assert.strictEqual(outMeta.width, 512, 'output keeps full input resolution');
  assert.strictEqual(outMeta.height, 512, 'output keeps full input height');

  // Corners (background) should be transparent, center (subject) opaque.
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  const cornerAlpha = (alphaAt(5, 5) + alphaAt(506, 5) + alphaAt(5, 506) + alphaAt(506, 506)) / 4;
  const centerAlpha = alphaAt(256, 256);
  console.log(`[hd] corner alpha avg: ${cornerAlpha.toFixed(1)}, center alpha: ${centerAlpha}`);
  assert.ok(cornerAlpha < 64, 'background corners are (mostly) transparent');
  assert.ok(centerAlpha > 128, 'subject center is (mostly) opaque');
  // Lock the soft-mask property: a hard binary mask would also pass the
  // corner/center checks, but BiRefNet's sigmoid mask has graded edges.
  let hasIntermediate = false;
  for (let i = 3; i < data.length; i += info.channels) {
    if (data[i] > 0 && data[i] < 255) { hasIntermediate = true; break; }
  }
  assert.ok(hasIntermediate, 'alpha is a soft mask (has intermediate values 1-254)');

  console.log(`[hd] PASS in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`[hd] transparent cutout: ${output}`);
})().catch((err) => {
  console.error('\n[hd] FAIL:', err);
  process.exit(1);
});
