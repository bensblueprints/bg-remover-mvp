// Background-removal worker. Runs in an Electron utilityProcess so the
// UI thread never blocks and inference memory is isolated from the app.
const { removeBackground, compositeOnColor } = require('./remove');
const fs = require('fs');
const path = require('path');
const os = require('os');

const port = process.parentPort;

port.on('message', async (e) => {
  const job = e.data;
  if (!job || !job.id) return;
  try {
    const wantsColor = job.mode === 'color' && job.color;
    const transparentOut = wantsColor
      ? path.join(os.tmpdir(), `bgremover-${job.id}-cutout.png`)
      : job.outputPath;

    await removeBackground(job.inputPath, transparentOut, {
      onProgress: (key, current, total) => {
        const stage = key.startsWith('fetch:') ? 'downloading-model' : 'inference';
        const percent = total ? Math.round((current / total) * 100) : 0;
        port.postMessage({ type: 'progress', id: job.id, stage, percent });
      },
    });

    if (wantsColor) {
      await compositeOnColor(transparentOut, job.outputPath, job.color);
      try { fs.unlinkSync(transparentOut); } catch {}
    }

    port.postMessage({ type: 'done', id: job.id, outputPath: job.outputPath });
  } catch (err) {
    port.postMessage({ type: 'error', id: job.id, error: String((err && err.message) || err) });
  }
});
