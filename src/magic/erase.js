// Magic-erase orchestrator. Holds per-image state (embeddings, current
// image, undo history) and processes one command at a time. Designed for
// the Electron utilityProcess worker but testable standalone: `post` is
// injected.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ensureModels, modelsReady, setModelDir, MODEL_NAMES } = require('../models');
const { loadSessions, encodeImage, decodeMask } = require('./segment');
const { loadLama, inpaint } = require('./inpaint');

// imageId -> { inputPath, enc, dir, current, history: string[] }
const images = new Map();
let lamaSession = null;

async function handleMagic(msg, post) {
  const { cmd, imageId } = msg;
  try {
    if (cmd === 'magic-prepare') {
      if (msg.modelsDir) {
        setModelDir(msg.modelsDir);
        if (!modelsReady(MODEL_NAMES)) setModelDir(null); // fall back to ~/.bg-remover/models
      }
      post({ type: 'magic-progress', imageId, stage: 'downloading-model', percent: 0 });
      await ensureModels(MODEL_NAMES, (_f, _d, _t, percent) =>
        post({ type: 'magic-progress', imageId, stage: 'downloading-model', percent }));
      post({ type: 'magic-progress', imageId, stage: 'encoding', percent: 100 });
      const { encoder } = await loadSessions();
      if (!lamaSession) lamaSession = await loadLama();
      const enc = await encodeImage(encoder, msg.inputPath);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bgremover-magic-'));
      const current = path.join(dir, 'current.png');
      fs.copyFileSync(msg.inputPath, current);
      images.set(imageId, { inputPath: msg.inputPath, enc, dir, current, history: [] });
      post({ type: 'magic-ready', imageId });
    } else if (cmd === 'magic-click') {
      const st = images.get(imageId);
      if (!st) throw new Error('image not prepared');
      const { decoder } = await loadSessions();
      const mask = await decodeMask(decoder, st.enc, msg.click);
      const out = await inpaint(lamaSession, st.current, mask);
      st.history.push(st.current);
      st.current = path.join(st.dir, `edit-${st.history.length}.png`);
      fs.writeFileSync(st.current, out);
      post({ type: 'magic-result', imageId, outputPath: st.current, canUndo: true });
    } else if (cmd === 'magic-undo') {
      const st = images.get(imageId);
      if (!st || !st.history.length) throw new Error('nothing to undo');
      st.current = st.history.pop();
      post({ type: 'magic-result', imageId, outputPath: st.current, canUndo: st.history.length > 0 });
    } else if (cmd === 'magic-close') {
      const st = images.get(imageId);
      if (st) {
        images.delete(imageId);
        fs.rmSync(st.dir, { recursive: true, force: true });
      }
    }
  } catch (err) {
    post({ type: 'magic-error', imageId, error: String((err && err.message) || err) });
  }
}

module.exports = { handleMagic };
