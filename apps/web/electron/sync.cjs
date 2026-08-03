// Sync service: flushes pending offline mutations to the cloud API
// when internet connectivity is restored.

const { net } = require("electron");
const localDb = require("./local-db.cjs");

let syncTimer = null;
let isSyncing = false;

async function flushMutations(cloudApiUrl, onProgress) {
  if (isSyncing) return { synced: 0, failed: 0, remaining: localDb.pendingCount() };
  isSyncing = true;

  const mutations = localDb.getPendingMutations();
  if (mutations.length === 0) {
    isSyncing = false;
    return { synced: 0, failed: 0, remaining: 0 };
  }

  console.log(`[sync] Flushing ${mutations.length} pending mutation(s)...`);
  let synced = 0;
  let failed = 0;

  for (const mut of mutations) {
    try {
      const opts = {
        method: mut.method,
        headers: { ...mut.headers, "Content-Type": "application/json" },
      };
      if (mut.body && mut.method !== "GET") {
        opts.body = JSON.stringify(mut.body);
      }

      const res = await net.fetch(`${cloudApiUrl}${mut.path}`, opts);

      // Accept 2xx and 4xx (4xx = bad data, won't retry, remove from queue)
      if (res.status < 500) {
        localDb.removeMutation(mut.id);
        synced++;
      } else {
        localDb.incrementAttempts(mut.id);
        failed++;
      }
    } catch (err) {
      console.error(`[sync] Failed ${mut.id}:`, err.message);
      localDb.incrementAttempts(mut.id);
      failed++;
    }

    if (onProgress) onProgress({ synced, failed, remaining: localDb.pendingCount() });
  }

  console.log(`[sync] Done — synced: ${synced}, failed: ${failed}, remaining: ${localDb.pendingCount()}`);
  isSyncing = false;
  return { synced, failed, remaining: localDb.pendingCount() };
}

// Start background sync loop — runs every 30s when online
function startSyncLoop(getCloudApiUrl, mainWindow) {
  function run() {
    if (net.isOnline() && localDb.pendingCount() > 0) {
      flushMutations(getCloudApiUrl(), (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("sync:progress", progress);
        }
      }).then((result) => {
        if (result.synced > 0 && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("sync:complete", result);
        }
      });
    }
  }

  syncTimer = setInterval(run, 30_000);

  return {
    triggerNow: () => {
      if (net.isOnline()) run();
    },
    stop: () => {
      if (syncTimer) clearInterval(syncTimer);
    },
  };
}

module.exports = { flushMutations, startSyncLoop };
