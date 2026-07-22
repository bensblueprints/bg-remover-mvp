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
  // --- Fallback path: non-square 1200x800 image, mask bbox taller than
  // 448px forces the resize fallback. With sharp's default fit:'cover' the
  // squash/stretch crops instead of squeezing, so the pasted-back fill is
  // shifted: content of orig x~350 lands at output x=225 (the reviewer's
  // gradient repro). A horizontal gradient makes the shift readable: the
  // red channel encodes x, so misaligned paste-back shows the wrong value.
  const WIDE = path.join(__dirname, 'fixtures', 'magic-wide.png');
  const WIDE_MASK = path.join(__dirname, 'fixtures', 'magic-wide-mask.png');
  const WW = 1200, WH = 800;
  const grad = Buffer.alloc(WW * WH * 3);
  for (let y = 0; y < WH; y++) {
    for (let x = 0; x < WW; x++) {
      const i = (y * WW + x) * 3;
      grad[i] = Math.min(255, Math.round((x * 255) / 600)); // r encodes x (saturates at 600)
      grad[i + 1] = Math.round((y * 255) / (WH - 1));
      grad[i + 2] = 128;
    }
  }
  // Red object inside the masked band, so there is something to erase.
  for (let y = 350; y < 450; y++) {
    for (let x = 190; x < 260; x++) {
      const i = (y * WW + x) * 3;
      grad[i] = 226; grad[i + 1] = 59; grad[i + 2] = 59;
    }
  }
  await sharp(grad, { raw: { width: WW, height: WH, channels: 3 } }).png().toFile(WIDE);
  // Full-height vertical band mask: bbox h=800 > 448 -> fallback path.
  const wideMaskSvg = `<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="800" fill="#000"/>
    <rect x="170" y="0" width="110" height="800" fill="#fff"/>
  </svg>`;
  await sharp(Buffer.from(wideMaskSvg)).png().toFile(WIDE_MASK);

  const wideOut = await inpaint(session, WIDE, fs.readFileSync(WIDE_MASK));
  const wideMeta = await sharp(wideOut).metadata();
  assert.strictEqual(wideMeta.width, 1200, 'fallback output width == input width');
  assert.strictEqual(wideMeta.height, 800, 'fallback output height == input height');
  const wideRaw = await sharp(wideOut).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const wpx = (x, y) => [(y * wideRaw.info.width + x) * 3, (y * wideRaw.info.width + x) * 3 + 1,
    (y * wideRaw.info.width + x) * 3 + 2].map((i) => wideRaw.data[i]);
  // (b) pixels well outside the mask are unchanged
  const corners = [[5, 5], [1194, 5], [5, 794], [1194, 794]];
  for (const [x, y] of corners) {
    const [r, g, b] = wpx(x, y);
    const er = Math.min(255, Math.round((x * 255) / 600));
    const eg = Math.round((y * 255) / (WH - 1));
    assert.ok(Math.abs(r - er) <= 12 && Math.abs(g - eg) <= 12 && Math.abs(b - 128) <= 12,
      `outside-mask pixel (${x},${y}) unchanged (got r=${r} g=${g} b=${b}, want ~${er},${eg},128)`);
  }
  // (c) the masked region actually changed (red object erased)
  const [or_, og, ob] = wpx(225, 400);
  assert.ok(!(or_ > 180 && og < 100 && ob < 100),
    `masked object pixel (225,400) is no longer red (got r=${or_} g=${og} b=${ob})`);
  // Alignment: inside the mask (away from the object) the fill must continue
  // the gradient AT THAT x, not content shifted from elsewhere. True r at
  // x=225 is 96; the cover-crop misalignment pastes r~149 (from x~350).
  for (const y of [100, 600]) {
    const [r, g, b] = wpx(225, y);
    assert.ok(Math.abs(r - 96) <= 25,
      `masked pixel (225,${y}) continues the local gradient (got r=${r}, want ~96; ` +
      'r~149 indicates cover-crop paste-back misalignment)');
  }
  console.log('[inpaint.test] PASS');
})().catch((e) => { console.error('[inpaint.test] FAIL:', e); process.exit(1); });
