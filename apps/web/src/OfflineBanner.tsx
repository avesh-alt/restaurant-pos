import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => {
    const ea = window.electronAPI;

    // Refresh pending count
    async function refreshPending() {
      if (ea?.getPendingCount) {
        const n = await ea.getPendingCount();
        setPendingCount(n);
      }
    }

    // Browser online/offline events (also work in Electron renderer)
    function handleOffline() { setOffline(true); setSyncMsg(""); }
    function handleOnline() {
      setOffline(false);
      setSyncMsg("Back online — syncing…");
      refreshPending();
      // Trigger immediate sync
      if (ea?.triggerSync) void ea.triggerSync();
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Electron IPC events (fired from main process connectivity polling)
    if (ea) {
      ea.onNetworkOffline(() => setOffline(true));
      ea.onNetworkOnline(() => {
        setOffline(false);
        setSyncMsg("Back online — syncing…");
        refreshPending();
      });
      ea.onSyncComplete(({ synced, remaining }) => {
        setPendingCount(remaining);
        if (synced > 0) {
          setSyncMsg(`✓ Synced ${synced} order${synced !== 1 ? "s" : ""}`);
          setTimeout(() => setSyncMsg(""), 4000);
        }
      });
    }

    refreshPending();
    const interval = setInterval(refreshPending, 15_000);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearInterval(interval);
      if (ea) {
        ea.removeAllListeners("network:online");
        ea.removeAllListeners("network:offline");
        ea.removeAllListeners("sync:complete");
      }
    };
  }, []);

  if (!offline && !syncMsg && pendingCount === 0) return null;

  if (offline) {
    return (
      <div className="offline-banner offline-banner--offline">
        ⚠ No internet — working offline
        {pendingCount > 0 && <span className="offline-banner__pending">{pendingCount} pending</span>}
      </div>
    );
  }

  return (
    <div className="offline-banner offline-banner--online">
      {syncMsg || (pendingCount > 0 ? `Syncing ${pendingCount} item${pendingCount !== 1 ? "s" : ""}…` : "✓ Online")}
    </div>
  );
}
