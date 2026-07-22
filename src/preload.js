const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  chooseImages: () => ipcRenderer.invoke('choose-images'),
  chooseOutputDir: () => ipcRenderer.invoke('choose-output-dir'),
  defaultOutputDir: () => ipcRenderer.invoke('default-output-dir'),
  processImages: (jobs, options) => ipcRenderer.invoke('process-images', jobs, options),
  cancelQueue: () => ipcRenderer.invoke('cancel-queue'),
  revealInFolder: (p) => ipcRenderer.invoke('reveal-in-folder', p),
  isModelCached: () => ipcRenderer.invoke('is-model-cached'),
  markModelCached: () => ipcRenderer.invoke('mark-model-cached'),
  magicPrepare: (imageId, inputPath) => ipcRenderer.invoke('magic-prepare', imageId, inputPath),
  magicClick: (imageId, click) => ipcRenderer.invoke('magic-click', imageId, click),
  magicUndo: (imageId) => ipcRenderer.invoke('magic-undo', imageId),
  magicClose: (imageId) => ipcRenderer.invoke('magic-close', imageId),
  magicSave: (currentPath, outputDir, baseName) =>
    ipcRenderer.invoke('magic-save', currentPath, outputDir, baseName),
  onMagicUpdate: (cb) => ipcRenderer.on('magic-update', (_e, data) => cb(data)),
  // Electron 32+ removed File.path — resolve dropped files via webUtils.
  pathForFile: (file) => webUtils.getPathForFile(file),
  onJobUpdate: (cb) => ipcRenderer.on('job-update', (_e, data) => cb(data)),
  onQueueIdle: (cb) => ipcRenderer.on('queue-idle', () => cb()),
});
