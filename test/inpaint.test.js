// Integration test: erase the red circle from the generated fixture and
// assert the erased area moves toward the teal background color.
// Downloads ~198MB on first run.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { ensureModels } = require('../src/models');
const { loadLama, inpaint } = require('../src/magic/inpaint');

const FIXTURE = path.join(__dirname, 'fixtures', 'magic-circle.png');
const MASK = path.join(__dirname, 'fixtures', 'magic-circle-mask.png');

async function makeFixtures() {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#0e8f8f"/>
    <circle cx="256" cy="256" r="140" fill="#e23b3b"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(FIXTURE);
  const maskSvg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#000"/>
    <circle cx="256" cy="256" r="150" fill="#fff"/>
  </svg>`;
  await sharp(Buffer.from(maskSvg)).png().toFile(MASK);
}

(async () => {
  await makeFixtures();
  await ensureModels(['lama_fp32.onnx']);
  const session = await loadLama();
  const out = await inpaint(session, FIXTURE, fs.readFileSync(MASK));
  const meta = await sharp(out).metadata();
  assert.strictEqual(meta.width, 512);
  assert.strictEqual(meta.height, 512);
  const { data, info } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => [(y * info.width + x) * 3, (y * info.width + x) * 3 + 1, (y * info.width + x) * 3 + 2]
    .map((i) => data[i]);
  const [r, g, b] = px(256, 256); // was red circle center
  assert.ok(r < 120 && g > 80 && b > 80,
    `center is no longer red (got r=${r} g=${g} b=${b})`);
  const [r2, g2, b2] = px(5, 5); // background corner must be untouched
  assert.ok(Math.abs(r2 - 14) < 12 && Math.abs(g2 - 143) < 12 && Math.abs(b2 - 143) < 12,
    `corner unchanged (got r=${r2} g=${g2} b=${b2})`);
  console.log('[inpaint.test] PASS');
})().catch((e) => { console.error('[inpaint.test] FAIL:', e); process.exit(1); });
