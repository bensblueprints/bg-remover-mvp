// Repro/regression for the worker segfault the desktop app hits in practice:
// the utilityProcess worker loads top-level onnxruntime-node (magic pipeline)
// AND @imgly/background-removal-node's nested onnxruntime-node ~1.17 (batch
// pipeline). Under Electron's runtime, finalizing an InferenceSession with
// two native ORT libs present segfaults (OrtApis::ReleaseIoBinding).
//
// Drives the REAL src/worker.js with the app's exact message sequence:
// magic-prepare → magic-click → batch job → batch job → magic-click → batch
// job → HD batch job.
// Exit 0 = worker survived everything; exit 1 = worker crashed (bug present).
//
// Run with: npx electron test/dual-ort-electron.js
const { app, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const FIXTURE = path.join(__dirname, 'fixtures', 'magic-circle.png');
const OUT = path.join(__dirname, 'out');

async function ensureFixture() {
  if (fs.existsSync(FIXTURE)) return;
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#0e8f8f"/>
    <circle cx="256" cy="256" r="140" fill="#e23b3b"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(FIXTURE);
}

app.whenReady().then(async () => {
  await ensureFixture();
  fs.mkdirSync(OUT, { recursive: true });

  const worker = utilityProcess.fork(path.join(__dirname, '..', 'src', 'worker.js'), [], {
    serviceName: 'dual-ort-repro',
  });

  let crashed = false;
  let finished = false;
  const fail = (why) => {
    finished = true;
    console.error(`[dual-ort-electron] FAIL: ${why}`);
    try { worker.kill(); } catch {}
    app.exit(1);
  };
  const timeout = setTimeout(() => fail('timeout (300s)'), 300000);

  worker.on('exit', (code) => {
    if (finished) return; // our own deliberate kill after success/failure
    crashed = true;
    clearTimeout(timeout);
    console.error(`[dual-ort-electron] WORKER EXITED UNEXPECTEDLY code=${code} — crash reproduced`);
    app.exit(1);
  });

  // Script the same interleaving a real user produces. Each step waits for
  // the worker's response before sending the next message.
  const steps = [
    { send: { cmd: 'magic-prepare', imageId: 1, inputPath: FIXTURE }, wait: (m) => m.type === 'magic-ready', label: 'magic-prepare' },
    { send: { cmd: 'magic-click', imageId: 1, click: { x: 256, y: 256 } }, wait: (m) => m.type === 'magic-result', label: 'magic-click #1' },
    { send: { id: 1, inputPath: FIXTURE, outputPath: path.join(OUT, 'dual-ort-batch1.png'), mode: 'transparent' }, wait: (m) => m.type === 'done' && m.id === 1, label: 'batch job #1 (imgly loads here)' },
    { send: { id: 2, inputPath: FIXTURE, outputPath: path.join(OUT, 'dual-ort-batch2.png'), mode: 'transparent' }, wait: (m) => m.type === 'done' && m.id === 2, label: 'batch job #2' },
    { send: { cmd: 'magic-click', imageId: 1, click: { x: 100, y: 100 } }, wait: (m) => m.type === 'magic-result' || m.type === 'magic-error', label: 'magic-click #2 after batch' },
    { send: { id: 3, inputPath: FIXTURE, outputPath: path.join(OUT, 'dual-ort-batch3.png'), mode: 'transparent' }, wait: (m) => m.type === 'done' && m.id === 3, label: 'batch job #3' },
    // modelsDir: null exercises the worker's source-build fallback
    // (job.modelsDir is falsy, so the default ~/.bg-remover/models dir is used).
    { send: { id: 4, inputPath: FIXTURE, outputPath: path.join(OUT, 'dual-ort-batch4-hd.png'), mode: 'transparent', engine: 'hd', modelsDir: null }, wait: (m) => m.type === 'done' && m.id === 4, label: 'batch job #4 (HD engine)' },
  ];

  let idx = 0;
  worker.on('message', (m) => {
    if (crashed || idx >= steps.length) return;
    const step = steps[idx];
    if (!step.wait(m)) return;
    console.log(`[dual-ort-electron] ok: ${step.label}`);
    idx++;
    if (idx >= steps.length) {
      finished = true;
      clearTimeout(timeout);
      console.log('[dual-ort-electron] SURVIVED — full interleaved sequence completed');
      try { worker.kill(); } catch {}
      app.exit(0);
      return;
    }
    worker.postMessage(steps[idx].send);
  });

  console.log(`[dual-ort-electron] starting: ${steps[0].label}`);
  worker.postMessage(steps[0].send);
});
