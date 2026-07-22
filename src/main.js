const { app, BrowserWindow, ipcMain, dialog, utilityProcess, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let win = null;
let worker = null;

// Packaged apps ship every AI model inside the installer — point the
// libraries at the bundled copies so nothing ever downloads at runtime.
function packagedImglyPublicPath() {
  if (!app.isPackaged) return null;
  const dir = path.join(process.resourcesPath, 'app.asar.unpacked',
    'node_modules', '@imgly', 'background-removal-node', 'dist') + path.sep;
  return require('url').pathToFileURL(dir).href;
}
function bundledModelsDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'models') : null;
}

// ---------------------------------------------------------------------------
// Sequential job queue (one image at a time — memory safety)
// ---------------------------------------------------------------------------
const queue = [];
let activeJob = null;
let cancelled = false;

function ensureWorker() {
  if (worker) return worker;
  worker = utilityProcess.fork(path.join(__dirname, 'worker.js'), [], {
    serviceName: 'bg-removal-worker',
  });
  worker.on('message', (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type && msg.type.startsWith('magic-')) {
      send('magic-update', msg);
      return;
    }
    if (msg.type === 'progress') {
      send('job-update', { id: msg.id, status: 'processing', stage: msg.stage, percent: msg.percent });
    } else if (msg.type === 'done') {
      send('job-update', { id: msg.id, status: 'done', outputPath: msg.outputPath });
      activeJob = null;
      pump();
    } else if (msg.type === 'error') {
      send('job-update', { id: msg.id, status: 'error', error: msg.error });
      activeJob = null;
      pump();
    }
  });
  worker.on('exit', (code) => {
    worker = null;
    if (activeJob) {
      send('job-update', { id: activeJob.id, status: 'error', error: `Worker exited unexpectedly (code ${code})` });
      activeJob = null;
      pump();
    }
    // A crash mid-magic-op has no activeJob — tell the renderer so the
    // overlay spinner resolves instead of spinning forever.
    send('magic-update', {
      type: 'magic-error',
      imageId: null,
      error: 'AI worker restarted — please reopen Magic erase',
    });
  });
  return worker;
}

function pump() {
  if (activeJob || cancelled) {
    if (cancelled && !activeJob) {
      queue.length = 0;
      send('queue-idle', {});
    }
    return;
  }
  const job = queue.shift();
  if (!job) {
    send('queue-idle', {});
    return;
  }
  activeJob = job;
  send('job-update', { id: job.id, status: 'processing', stage: 'starting', percent: 0 });
  ensureWorker().postMessage(job);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('choose-images', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose images',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('choose-output-dir', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose export folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('default-output-dir', () => {
  const dir = path.join(app.getPath('pictures'), 'BG Remover');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
});

// jobs: [{id, inputPath}], options: {outputDir, mode: 'transparent'|'color', color}
ipcMain.handle('process-images', (_e, jobs, options) => {
  cancelled = false;
  fs.mkdirSync(options.outputDir, { recursive: true });
  for (const j of jobs) {
    const base = path.parse(j.inputPath).name;
    queue.push({
      id: j.id,
      inputPath: j.inputPath,
      outputPath: uniquePath(options.outputDir, `${base}-nobg.png`),
      mode: options.mode,
      color: options.color,
      publicPath: packagedImglyPublicPath(),
    });
  }
  pump();
  return true;
});

ipcMain.handle('cancel-queue', () => {
  cancelled = true;
  queue.length = 0;
  return true;
});

// Magic erase: interactive ops forwarded to the worker (stateful per imageId).
ipcMain.handle('magic-prepare', (_e, imageId, inputPath) => {
  ensureWorker().postMessage({ cmd: 'magic-prepare', imageId, inputPath, modelsDir: bundledModelsDir() });
});
ipcMain.handle('magic-click', (_e, imageId, click) => {
  ensureWorker().postMessage({ cmd: 'magic-click', imageId, click });
});
ipcMain.handle('magic-undo', (_e, imageId) => {
  ensureWorker().postMessage({ cmd: 'magic-undo', imageId });
});
ipcMain.handle('magic-close', (_e, imageId) => {
  ensureWorker().postMessage({ cmd: 'magic-close', imageId });
});
ipcMain.handle('magic-save', (_e, currentPath, outputDir, baseName) => {
  if (!currentPath || !fs.existsSync(currentPath)) return null;
  fs.mkdirSync(outputDir, { recursive: true });
  const dest = uniquePath(outputDir, `${baseName}-erased.png`);
  fs.copyFileSync(currentPath, dest);
  return dest;
});

ipcMain.handle('reveal-in-folder', (_e, p) => {
  if (p && fs.existsSync(p)) shell.showItemInFolder(p);
});

ipcMain.handle('is-model-cached', () => {
  // @imgly caches resources under the U2Net onnx bundle inside node_modules
  // on first fetch; treat "we've successfully processed once" flag as cache.
  return fs.existsSync(path.join(app.getPath('userData'), '.model-ready'));
});

ipcMain.handle('mark-model-cached', () => {
  try { fs.writeFileSync(path.join(app.getPath('userData'), '.model-ready'), '1'); } catch {}
});

function uniquePath(dir, name) {
  let p = path.join(dir, name);
  if (!fs.existsSync(p)) return p;
  const { name: n, ext } = path.parse(name);
  let i = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${n} (${i++})${ext}`);
  return p;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    title: 'BG Remover',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (worker) { try { worker.kill(); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});
