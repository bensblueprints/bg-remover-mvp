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
  // Electron 32+ removed File.path — resolve dropped files via webUtils.
  pathForFile: (file) => webUtils.getPathForFile(file),
  onJobUpdate: (cb) => ipcRenderer.on('job-update', (_e, data) => cb(data)),
  onQueueIdle: (cb) => ipcRenderer.on('queue-idle', () => cb()),
});
