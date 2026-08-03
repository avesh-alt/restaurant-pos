const { contextBridge, ipcRenderer } = require("electron");

// ── Expose safe APIs to the renderer ────────────────────────────────────────

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,

  // Config
  getVersion: () => ipcRenderer.invoke("get-version"),
  getApiUrl:  () => ipcRenderer.invoke("get-api-url"),
  setApiUrl:  (url) => ipcRenderer.invoke("set-api-url", url),

  // Network / sync
  isOnline:         () => ipcRenderer.invoke("is-online"),
  getPendingCount:  () => ipcRenderer.invoke("sync:pending-count"),
  triggerSync:      () => ipcRenderer.invoke("sync:trigger"),

  // Events from main process
  onNetworkOnline:  (cb) => ipcRenderer.on("network:online",  () => cb()),
  onNetworkOffline: (cb) => ipcRenderer.on("network:offline", () => cb()),
  onSyncProgress:   (cb) => ipcRenderer.on("sync:progress",   (_, d) => cb(d)),
  onSyncComplete:   (cb) => ipcRenderer.on("sync:complete",   (_, d) => cb(d)),

  // Cleanup helpers
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
