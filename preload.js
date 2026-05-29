const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onStatsUpdate: (cb) => ipcRenderer.on('stats-update', (_e, payload) => cb(payload)),
  requestRefresh: () => ipcRenderer.send('refresh-request'),
});
