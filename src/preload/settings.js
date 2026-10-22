const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (config) => ipcRenderer.invoke('settings:save', config),
  pickImages: () => ipcRenderer.invoke('settings:pick-images'),
  resolveImage: (path) => ipcRenderer.invoke('settings:resolve-image', path),
  test: (reminder) => ipcRenderer.invoke('settings:test', reminder),
  openFolder: () => ipcRenderer.invoke('settings:open-folder'),
});
