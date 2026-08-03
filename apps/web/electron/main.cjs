const { app, BrowserWindow, shell, ipcMain, net, powerMonitor } = require("electron");
const path = require("path");
const fs = require("fs");
const { createLocalServer } = require("./local-server.cjs");
const { startSyncLoop } = require("./sync.cjs");
const localDb = require("./local-db.cjs");

// ── Config ──────────────────────────────────────────────────────────────────

function resolveApiUrl() {
  const configPath = path.join(app.getPath("userData"), "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (cfg.apiUrl) return cfg.apiUrl.replace(/\/$/, "");
    } catch {}
  }
  // Fallback: baked-in build-time env var
  return (process.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

let cloudApiUrl = resolveApiUrl();

// ── Main Window ─────────────────────────────────────────────────────────────

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Restaurant POS",
    backgroundColor: "#0f1117",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Always load from the local proxy server — never directly from cloud
  mainWindow.loadURL("http://127.0.0.1:4001");

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

function registerIpc(syncController) {
  ipcMain.handle("get-api-url", () => cloudApiUrl);
  ipcMain.handle("get-version", () => app.getVersion());
  ipcMain.handle("is-online", () => net.isOnline());
  ipcMain.handle("sync:pending-count", () => localDb.pendingCount());
  ipcMain.handle("sync:trigger", () => {
    syncController.triggerNow();
    return { ok: true };
  });

  // Allow the renderer to persist a new API URL (e.g. from a settings screen)
  ipcMain.handle("set-api-url", (_, newUrl) => {
    cloudApiUrl = newUrl.replace(/\/$/, "");
    const configPath = path.join(app.getPath("userData"), "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ apiUrl: cloudApiUrl }), "utf8");
    return { ok: true };
  });
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // 1. Start local proxy server
  createLocalServer(() => cloudApiUrl);

  // 2. Create browser window
  createWindow();

  // 3. Start background sync loop (flushes offline queue every 30s)
  const syncController = startSyncLoop(
    () => cloudApiUrl,
    mainWindow,
  );

  // 4. Register IPC
  registerIpc(syncController);

  // 5. Trigger immediate sync when network comes back
  powerMonitor.on("unlock-screen", () => {
    if (net.isOnline()) syncController.triggerNow();
  });

  // Poll for online change (Electron doesn't expose a native online event in main)
  let wasOnline = net.isOnline();
  setInterval(() => {
    const isOnline = net.isOnline();
    if (isOnline && !wasOnline) {
      console.log("[main] Network restored — triggering sync");
      syncController.triggerNow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("network:online");
      }
    } else if (!isOnline && wasOnline) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("network:offline");
      }
    }
    wasOnline = isOnline;
  }, 5000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
