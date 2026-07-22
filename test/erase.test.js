// Integration test for the magic-erase orchestrator (no Electron needed —
// handleMagic takes an explicit `post` callback).
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { handleMagic } = require('../src/magic/erase');

const FIXTURE = path.join(__dirname, 'fixtures', 'magic-circle.png');

async function makeFixture() {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#0e8f8f"/>
    <circle cx="256" cy="256" r="140" fill="#e23b3b"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(FIXTURE);
}

function waitFor(events, pred) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for worker event')), 120000);
    events.push((msg) => { if (pred(msg)) { clearTimeout(t); resolve(msg); } });
  });
}

(async () => {
  await makeFixture();
  const watchers = [];
  const post = (msg) => watchers.forEach((w) => w(msg));

  // Register the watcher BEFORE invoking handleMagic: magic-ready is posted
  // during the awaited call, so waiting afterwards would miss the event.
  const readyP = waitFor(watchers, (m) => m.type === 'magic-ready' && m.imageId === 1);
  await handleMagic({ cmd: 'magic-prepare', imageId: 1, inputPath: FIXTURE }, post);
  const ready = await readyP;
  assert.ok(ready, 'magic-ready received');

  handleMagic({ cmd: 'magic-click', imageId: 1, click: { x: 256, y: 256 } }, post);
  const res = await waitFor(watchers, (m) => m.type === 'magic-result' && m.imageId === 1);
  assert.ok(fs.existsSync(res.outputPath), 'result file exists');
  assert.strictEqual(res.canUndo, true);
  const meta = await sharp(res.outputPath).metadata();
  assert.strictEqual(meta.width, 512);
  const { data, info } = await sharp(res.outputPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = data[(256 * info.width + 256) * 3];
  assert.ok(r < 120, `erased center is no longer red (r=${r})`);

  // Same race here: the undo branch posts synchronously (no awaits inside),
  // so the watcher must be registered before handleMagic runs.
  const undoP = waitFor(watchers, (m) => m.type === 'magic-result' && m.imageId === 1 && m.canUndo === false);
  handleMagic({ cmd: 'magic-undo', imageId: 1 }, post);
  const undo = await undoP;
  assert.ok(undo, 'undo returns to original with canUndo=false');

  await handleMagic({ cmd: 'magic-close', imageId: 1 }, post);
  console.log('[erase.test] PASS');
})().catch((e) => { console.error('[erase.test] FAIL:', e); process.exit(1); });
