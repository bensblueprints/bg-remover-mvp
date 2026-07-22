// Model downloader/cache for the magic-erase pipeline. Models live in
// ~/.bg-remover/models (NOT Electron's userData — the worker is a plain
// Node utilityProcess without access to `app`). Downloads are atomic
// (tmp file + rename) and verified by exact byte size.
const fs = require('fs');
const path = require('path');
const os = require('os');

const MODEL_DIR = path.join(os.homedir(), '.bg-remover', 'models');

const MODELS = {
  'mobilesam.encoder.onnx': {
    url: 'https://huggingface.co/spaces/Akbartus/projects/resolve/main/mobilesam.encoder.onnx',
    size: 28195125,
  },
  'mobilesam.decoder.onnx': {
    url: 'https://raw.githubusercontent.com/akbartus/MobileSAM-in-the-Browser/main/models/mobilesam.decoder.onnx',
    size: 16514086,
  },
  'lama_fp32.onnx': {
    url: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
    size: 208044816,
  },
};

const MODEL_NAMES = Object.keys(MODELS);

function modelPath(name) {
  const m = MODELS[name];
  if (!m) throw new Error(`unknown model: ${name}`);
  return path.join(MODEL_DIR, name);
}

/** True when every requested model file exists with its exact byte size. */
function modelsReady(names = MODEL_NAMES) {
  return names.every((n) => {
    const p = modelPath(n);
    return fs.existsSync(p) && fs.statSync(p).size === MODELS[n].size;
  });
}

async function downloadOne(name, onProgress) {
  const { url, size } = MODELS[name];
  const dest = modelPath(name);
  const tmp = dest + '.part';
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`download failed for ${name}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || size;
  const out = fs.createWriteStream(tmp);
  let done = 0;
  try {
    for await (const chunk of res.body) {
      out.write(chunk);
      done += chunk.length;
      if (onProgress) onProgress(name, done, total, Math.min(99, Math.round((done / total) * 100)));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  if (done !== size) {
    fs.unlinkSync(tmp);
    throw new Error(`download incomplete for ${name}: got ${done} bytes, expected ${size}`);
  }
  fs.renameSync(tmp, dest);
  if (onProgress) onProgress(name, done, total, 100);
}

/**
 * Download every missing/incomplete model in `names`.
 * onProgress(file, bytesDone, bytesTotal, percent) — per-file progress.
 */
async function ensureModels(names, onProgress) {
  for (const name of names) {
    if (modelsReady([name])) continue;
    await downloadOne(name, onProgress);
  }
}

module.exports = { MODEL_DIR, MODELS, MODEL_NAMES, modelPath, modelsReady, ensureModels };
