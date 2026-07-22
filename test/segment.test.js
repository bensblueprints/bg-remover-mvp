// Integration test: real MobileSAM encode + one foreground click on a
// generated fixture (red circle on teal). Downloads ~45MB on first run.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { ensureModels } = require('../src/models');
const { loadSessions, encodeImage, decodeMask } = require('../src/magic/segment');

const FIXTURE = path.join(__dirname, 'fixtures', 'magic-circle.png');

async function makeFixture() {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#0e8f8f"/>
    <circle cx="256" cy="256" r="140" fill="#e23b3b"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(FIXTURE);
}

(async () => {
  await makeFixture();
  await ensureModels(['mobilesam.encoder.onnx', 'mobilesam.decoder.onnx']);
  const { encoder, decoder } = await loadSessions();
  const enc = await encodeImage(encoder, FIXTURE);
  assert.strictEqual(enc.origW, 512);
  assert.ok(enc.resizedW <= 1024 && enc.resizedH <= 1024);

  const mask = await decodeMask(decoder, enc, { x: 256, y: 256 });
  const { data, info } = await sharp(mask).greyscale().raw().toBuffer({ resolveWithObject: true });
  assert.strictEqual(info.width, 512);
  const at = (x, y) => data[y * info.width + x];
  assert.ok(at(256, 256) > 128, 'click point is inside the mask');
  assert.ok(at(5, 5) < 128, 'background corner is outside the mask');
  assert.ok(at(507, 507) < 128, 'opposite corner is outside the mask');
  console.log('[segment.test] PASS');
})().catch((e) => { console.error('[segment.test] FAIL:', e); process.exit(1); });
