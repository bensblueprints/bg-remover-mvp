// Downloads the magic-erase models into build/models/ so electron-builder
// can ship them in the installer via extraResources. Idempotent.
const path = require('path');
const { ensureModels, setModelDir, MODEL_NAMES } = require('../src/models');

(async () => {
  setModelDir(path.join(__dirname, '..', 'build', 'models'));
  await ensureModels(MODEL_NAMES, (file, done, total, percent) => {
    process.stdout.write(`\r[fetch-models] ${file}: ${percent}%   `);
  });
  process.stdout.write('\n[fetch-models] all models ready in build/models\n');
})().catch((e) => { console.error('[fetch-models] FAIL:', e); process.exit(1); });
