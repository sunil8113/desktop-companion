const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onShow: (callback) => ipcRenderer.on('overlay:show', (_event, payload) => callback(payload)),
  setInteractive: (on) => ipcRenderer.send('overlay:set-interactive', Boolean(on)),
  done: () => ipcRenderer.send('overlay:done'),
  snooze: () => ipcRenderer.send('overlay:snooze'),
});
