const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  getApiUrl: () => ipcRenderer.invoke("get-api-url"),
  getVersion: () => ipcRenderer.invoke("get-version"),
});
