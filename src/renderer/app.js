/* global api */
const $ = (id) => document.getElementById(id);

const state = {
  items: [], // {id, inputPath, name, status, outputPath, error}
  selectedId: null,
  mode: 'transparent',
  color: '#ffffff',
  outputDir: null,
  running: false,
  batchTotal: 0,
  batchDone: 0,
};

let nextId = 1;
const ACCEPT = /\.(jpe?g|png|webp)$/i;

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
(async () => {
  state.outputDir = await api.defaultOutputDir();
  $('btnFolder').textContent = state.outputDir;
})();

// ---------------------------------------------------------------------------
// adding files
// ---------------------------------------------------------------------------
function addFiles(paths) {
  let added = false;
  for (const p of paths) {
    if (!ACCEPT.test(p)) continue;
    if (state.items.some((i) => i.inputPath === p)) continue;
    state.items.push({
      id: nextId++,
      inputPath: p,
      name: p.split(/[\\/]/).pop(),
      status: 'pending',
      outputPath: null,
      error: null,
    });
    added = true;
  }
  if (added) {
    if (!state.selectedId) state.selectedId = state.items[0].id;
    render();
  }
}

$('btnBrowse').addEventListener('click', async () => addFiles(await api.chooseImages()));
$('btnAdd').addEventListener('click', async () => addFiles(await api.chooseImages()));
$('btnClear').addEventListener('click', () => {
  if (state.running) return;
  state.items = [];
  state.selectedId = null;
  render();
});

// drag & drop anywhere
const dz = $('dropzone');
document.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('hover'); });
document.addEventListener('dragleave', (e) => { if (e.relatedTarget === null) dz.classList.remove('hover'); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dz.classList.remove('hover');
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  addFiles(paths);
});

// ---------------------------------------------------------------------------
// controls
// ---------------------------------------------------------------------------
$('bgSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  state.mode = btn.dataset.mode;
  state.color = btn.dataset.color === 'custom' ? $('customColor').value : btn.dataset.color;
});
$('customColor').addEventListener('input', (e) => {
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
  $('segCustom').classList.add('active');
  state.mode = 'color';
  state.color = e.target.value;
});

$('btnFolder').addEventListener('click', async () => {
  const dir = await api.chooseOutputDir();
  if (dir) {
    state.outputDir = dir;
    $('btnFolder').textContent = dir;
  }
});

$('btnProcess').addEventListener('click', async () => {
  const todo = state.items.filter((i) => i.status === 'pending' || i.status === 'error');
  if (!todo.length || state.running) return;
  state.running = true;
  state.batchTotal = todo.length;
  state.batchDone = 0;
  todo.forEach((i) => { i.status = 'queued'; i.error = null; });
  render();

  const cached = await api.isModelCached();
  if (!cached) showModelBanner(0);

  await api.processImages(
    todo.map((i) => ({ id: i.id, inputPath: i.inputPath })),
    { outputDir: state.outputDir, mode: state.mode, color: state.color }
  );
});

$('btnCancel').addEventListener('click', async () => {
  await api.cancelQueue();
  state.items.forEach((i) => { if (i.status === 'queued') i.status = 'pending'; });
});

// ---------------------------------------------------------------------------
// job events
// ---------------------------------------------------------------------------
api.onJobUpdate((u) => {
  const item = state.items.find((i) => i.id === u.id);
  if (!item) return;

  if (u.status === 'processing') {
    item.status = 'processing';
    if (u.stage === 'downloading-model') {
      showModelBanner(u.percent);
    } else if (u.stage === 'inference') {
      hideModelBanner(true);
    }
  } else if (u.status === 'done') {
    item.status = 'done';
    item.outputPath = u.outputPath;
    state.batchDone++;
    hideModelBanner(true);
    if (state.selectedId === item.id) renderPreview();
  } else if (u.status === 'error') {
    item.status = 'error';
    item.error = u.error;
    state.batchDone++;
    hideModelBanner(false);
  }
  render();
});

api.onQueueIdle(() => {
  state.running = false;
  render();
});

// ---------------------------------------------------------------------------
// model banner
// ---------------------------------------------------------------------------
function showModelBanner(percent) {
  $('modelBanner').hidden = false;
  $('modelProgressFill').style.width = `${percent || 0}%`;
  $('modelBannerText').textContent =
    `Downloading AI model (~80 MB, one time)… ${percent || 0}% — every image after this is instant & offline`;
}
function hideModelBanner(success) {
  if (!$('modelBanner').hidden && success) api.markModelCached();
  $('modelBanner').hidden = true;
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------
function fileUrl(p) {
  return 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23');
}

function render() {
  const has = state.items.length > 0;
  $('queuePanel').hidden = !has;
  $('controls').hidden = !has;
  $('dropzone').style.display = has ? 'none' : 'grid';
  $('preview').hidden = !has;
  $('btnClear').hidden = !has || state.running;
  $('queueCount').textContent = state.items.length;

  // queue list
  const ul = $('queueList');
  ul.innerHTML = '';
  for (const item of state.items) {
    const li = document.createElement('li');
    li.className = item.id === state.selectedId ? 'selected' : '';
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = fileUrl(item.inputPath);
    const meta = document.createElement('div');
    meta.className = 'q-meta';
    const name = document.createElement('div');
    name.className = 'q-name';
    name.textContent = item.name;
    const status = document.createElement('div');
    status.className = `q-status ${item.status}`;
    status.textContent =
      item.status === 'pending' ? 'Ready' :
      item.status === 'queued' ? 'Queued' :
      item.status === 'processing' ? 'Processing…' :
      item.status === 'done' ? 'Done ✓' :
      `Error: ${item.error || 'failed'}`;
    meta.append(name, status);
    li.append(img, meta);
    li.addEventListener('click', () => { state.selectedId = item.id; render(); });
    if (item.status === 'done') {
      li.addEventListener('dblclick', () => api.revealInFolder(item.outputPath));
      li.title = 'Double-click to reveal exported PNG';
    }
    ul.appendChild(li);
  }

  // process button / batch progress
  const pending = state.items.filter((i) => i.status === 'pending' || i.status === 'error').length;
  $('btnProcess').disabled = state.running || pending === 0;
  $('btnProcess').textContent = state.running
    ? 'Processing…'
    : pending > 1 ? `Remove backgrounds (${pending})` : 'Remove background';
  $('batchProgress').hidden = !state.running;
  if (state.running && state.batchTotal) {
    $('batchFill').style.width = `${Math.round((state.batchDone / state.batchTotal) * 100)}%`;
    $('batchLabel').textContent = `${state.batchDone} / ${state.batchTotal}`;
  }

  renderPreview();
}

function renderPreview() {
  const item = state.items.find((i) => i.id === state.selectedId);
  if (!item) return;
  $('imgBefore').src = fileUrl(item.inputPath);
  if (item.status === 'done' && item.outputPath) {
    $('imgAfter').src = fileUrl(item.outputPath) + `?t=${Date.now()}`;
    $('imgAfter').style.display = '';
    $('afterEmpty').hidden = true;
  } else {
    $('imgAfter').style.display = 'none';
    $('afterEmpty').hidden = false;
    $('afterEmpty').textContent =
      item.status === 'processing' ? 'Processing…' :
      item.status === 'error' ? `Failed: ${item.error || 'unknown error'}` :
      'Not processed yet';
  }
}
