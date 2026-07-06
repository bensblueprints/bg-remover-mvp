// Verifies the native pipeline (onnxruntime-node + sharp) also works inside
// Electron's runtime, exactly as the app's utilityProcess worker uses it.
// Run with: npx electron test/smoke-electron.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { removeBackground } = require('../src/remove');

app.whenReady().then(async () => {
  try {
    const input = path.join(__dirname, 'fixtures', 'circle.png');
    if (!fs.existsSync(input)) {
      console.error('[smoke-electron] run `npm test` first to generate fixtures');
      app.exit(2);
      return;
    }
    const output = path.join(__dirname, 'out', 'circle-cutout-electron.png');
    await removeBackground(input, output);
    const meta = await sharp(output).metadata();
    if (meta.format !== 'png' || !meta.hasAlpha) throw new Error('bad output');
    console.log('[smoke-electron] PASS — pipeline works inside Electron runtime');
    app.exit(0);
  } catch (err) {
    console.error('[smoke-electron] FAIL:', err);
    app.exit(1);
  }
});
