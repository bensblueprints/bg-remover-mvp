// Unit test for the model downloader's readiness check (no network).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MODEL_DIR, MODELS, modelsReady } = require('../src/models');

// A file that exists but has the wrong size must count as NOT ready.
const probe = path.join(MODEL_DIR, 'mobilesam.encoder.onnx');
fs.mkdirSync(MODEL_DIR, { recursive: true });
const existed = fs.existsSync(probe);
const original = existed ? fs.readFileSync(probe) : null;
fs.writeFileSync(probe, Buffer.alloc(128));
try {
  assert.strictEqual(modelsReady(['mobilesam.encoder.onnx']), false,
    'truncated file is not ready');
} finally {
  if (original) fs.writeFileSync(probe, original); else fs.unlinkSync(probe);
}

// A name that is not a known model must throw.
assert.throws(() => modelsReady(['nope.onnx']), /unknown model/i);

// Every known model has an https URL and a positive size.
for (const [name, m] of Object.entries(MODELS)) {
  assert.ok(/^https:\/\//.test(m.url), `${name} url is https`);
  assert.ok(m.size > 1000000, `${name} has expected size`);
}
console.log('[models.test] PASS');
