// Background-removal worker. Runs in an Electron utilityProcess so the
// UI thread never blocks and inference memory is isolated from the app.
const { removeBackground, compositeOnColor } = require('./remove');
const fs = require('fs');
const path = require('path');
const os = require('os');

const port = process.parentPort;

const { handleMagic } = require('./magic/erase');

const post = (m) => port.postMessage(m);

port.on('message', async (e) => {
  const job = e.data;
  if (!job) return;
  if (typeof job.cmd === 'string' && job.cmd.startsWith('magic-')) {
    await handleMagic(job, post);
    return;
  }
  if (!job.id) return;
  try {
    const wantsColor = job.mode === 'color' && job.color;
    const transparentOut = wantsColor
      ? path.join(os.tmpdir(), `bgremover-${job.id}-cutout.png`)
      : job.outputPath;

    if (job.modelsDir) {
      const { setModelDir, modelsReady, MODEL_NAMES } = require('./models');
      setModelDir(job.modelsDir);
      if (!modelsReady(MODEL_NAMES)) setModelDir(null);
    }

    if (job.engine === 'hd') {
      const { ensureModels } = require('./models');
      await ensureModels(['birefnet_lite_fp32.onnx'], (_f, _d, _t, percent) =>
        port.postMessage({ type: 'progress', id: job.id, stage: 'downloading-model', percent }));
      const { removeBackgroundHD } = require('./hdremove');
      port.postMessage({ type: 'progress', id: job.id, stage: 'inference', percent: 0 });
      await removeBackgroundHD(job.inputPath, transparentOut);
    } else {
      await removeBackground(job.inputPath, transparentOut, {
        publicPath: job.publicPath,
        onProgress: (key, current, total) => {
          const stage = key.startsWith('fetch:') ? 'downloading-model' : 'inference';
          const percent = total ? Math.round((current / total) * 100) : 0;
          port.postMessage({ type: 'progress', id: job.id, stage, percent });
        },
      });
    }

    if (wantsColor) {
      await compositeOnColor(transparentOut, job.outputPath, job.color);
      try { fs.unlinkSync(transparentOut); } catch {}
    }

    port.postMessage({ type: 'done', id: job.id, outputPath: job.outputPath });
  } catch (err) {
    port.postMessage({ type: 'error', id: job.id, error: String((err && err.message) || err) });
  }
});
