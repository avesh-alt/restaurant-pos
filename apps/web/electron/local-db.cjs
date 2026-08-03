// Local storage using plain JSON files in app.getPath('userData').
// No native compilation needed — pure Node.js fs module only.

const fs   = require("fs");
const path = require("path");
const { app } = require("electron");

function dataDir() { return app.getPath("userData"); }

function filePath(name) { return path.join(dataDir(), `pos-${name}.json`); }

// Atomic write: write to .tmp then rename so a crash mid-write can't corrupt the file
function writeJson(name, data) {
  const fp  = filePath(name);
  const tmp = fp + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 0), "utf8");
  fs.renameSync(tmp, fp);
}

function readJson(name, fallback) {
  try {
    const fp = filePath(name);
    if (!fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return fallback;
  }
}

// ── Response cache ──────────────────────────────────────────────────────────
// Stored as { [cacheKey]: { data, cachedAt } }

function setCache(key, data) {
  const cache = readJson("cache", {});
  cache[key] = { data, cachedAt: Date.now() };
  writeJson("cache", cache);
}

function getCache(key) {
  const cache = readJson("cache", {});
  return cache[key]?.data ?? null;
}

// ── Pending mutations ────────────────────────────────────────────────────────
// Stored as [{ id, method, path, body, headers, createdAt, attempts }]

function queueMutation(id, method, apiPath, body, headers) {
  const queue = readJson("queue", []);
  queue.push({ id, method, path: apiPath, body, headers, createdAt: Date.now(), attempts: 0 });
  writeJson("queue", queue);
}

function getPendingMutations() {
  return readJson("queue", []);
}

function removeMutation(id) {
  const queue = readJson("queue", []).filter((m) => m.id !== id);
  writeJson("queue", queue);
}

function incrementAttempts(id) {
  const queue = readJson("queue", []).map((m) =>
    m.id === id ? { ...m, attempts: (m.attempts || 0) + 1 } : m,
  );
  writeJson("queue", queue);
}

function pendingCount() {
  return readJson("queue", []).length;
}

// ── Sync metadata ────────────────────────────────────────────────────────────

function getMeta(key) {
  return readJson("meta", {})[key] ?? null;
}

function setMeta(key, value) {
  const meta = readJson("meta", {});
  meta[key] = value;
  writeJson("meta", meta);
}

module.exports = {
  setCache,
  getCache,
  queueMutation,
  getPendingMutations,
  removeMutation,
  incrementAttempts,
  pendingCount,
  getMeta,
  setMeta,
};
