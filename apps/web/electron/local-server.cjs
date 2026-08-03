// Local HTTP server (port 4001).
//
// Serves two things on the same port:
//   - Static files: the built Vite app from ../dist/
//   - API proxy:    /api/v1/* forwarded to the cloud, served from SQLite when offline
//
// React app always talks to http://127.0.0.1:4001 — no code changes needed.

const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { net } = require("electron");
const localDb = require("./local-db.cjs");

const LOCAL_PORT = 4001;

// ── MIME types ───────────────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
  ".svg":  "image/svg+xml",
  ".woff2":"font/woff2",
  ".woff": "font/woff",
  ".ttf":  "font/ttf",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-Restaurant-Id,X-Branch-Id,X-Branch-Name",
};

function jsonReply(res, status, data) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : null); }
      catch { resolve(null); }
    });
  });
}

// Proxy a request to the cloud API using Node's built-in https/http module
function proxyToCloud(cloudApiUrl, apiPath, method, headers, body) {
  return new Promise((resolve, reject) => {
    const base = new URL(cloudApiUrl);
    const isHttps = base.protocol === "https:";
    const mod = isHttps ? https : http;
    const port = base.port || (isHttps ? 443 : 80);

    const bodyStr = body && method !== "GET" ? JSON.stringify(body) : null;

    const fwdHeaders = { ...headers };
    delete fwdHeaders.host;
    delete fwdHeaders["content-length"];
    fwdHeaders["content-type"] = "application/json";
    if (bodyStr) fwdHeaders["content-length"] = Buffer.byteLength(bodyStr);

    const req = mod.request(
      {
        hostname: base.hostname,
        port,
        path: apiPath,
        method,
        headers: fwdHeaders,
        timeout: 15_000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch { parsed = { message: data }; }
          resolve({ status: res.statusCode, data: parsed, ok: res.statusCode < 400 });
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Optimistic offline order so the UI can render it immediately
function makeOfflineOrder(body, tempId) {
  const now = new Date().toISOString();
  const items = (body?.items ?? []).map((item, i) => ({
    id: `tmp-item-${i}`,
    menuItemId: item.menuItemId,
    quantity: item.quantity ?? 1,
    unitPrice: String(item.unitPrice ?? 0),
    totalPrice: String((item.unitPrice ?? 0) * (item.quantity ?? 1)),
    notes: item.notes ?? null,
    status: "PENDING",
    menuItem: item.menuItem ?? { id: item.menuItemId, name: "Item", type: "VEG" },
  }));
  const subtotal = items.reduce((s, i) => s + Number(i.totalPrice), 0);
  return {
    id: tempId,
    orderNumber: `OFFLINE-${Date.now()}`,
    status: "DRAFT",
    tableId: body?.tableId ?? null,
    branchId: body?.branchId ?? null,
    notes: body?.notes ?? null,
    subtotalAmount: String(subtotal),
    taxAmount: "0",
    discountAmount: "0",
    totalAmount: String(subtotal),
    items,
    createdAt: now,
    updatedAt: now,
    _offline: true,
  };
}

// ── Static file handler ───────────────────────────────────────────────────────

function serveStatic(req, res, distDir) {
  let filePath = path.join(distDir, req.url === "/" ? "index.html" : req.url);

  // Strip query strings
  const qIdx = filePath.indexOf("?");
  if (qIdx !== -1) filePath = filePath.slice(0, qIdx);

  const ext = path.extname(filePath);
  const mime = MIME[ext] || "application/octet-stream";

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback — serve index.html for any unknown route
    const index = path.join(distDir, "index.html");
    res.writeHead(200, { "Content-Type": "text/html" });
    fs.createReadStream(index).pipe(res);
  }
}

// ── Server factory ───────────────────────────────────────────────────────────

function createLocalServer(getCloudApiUrl) {
  // Resolve dist directory (works both in dev and packaged)
  const distDir = path.join(__dirname, "..", "dist");

  const server = http.createServer(async (req, res) => {
    const apiPath = req.url;
    const method = req.method.toUpperCase();

    // ── Static assets (non-API) ──────────────────────────────────────────────
    if (!apiPath.startsWith("/api/")) {
      if (method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
      return serveStatic(req, res, distDir);
    }

    // ── API ──────────────────────────────────────────────────────────────────

    if (method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    const body = await readBody(req);

    // Build forward headers
    const fwdHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k !== "host" && k !== "content-length") fwdHeaders[k] = v;
    }

    const cloudApiUrl = getCloudApiUrl();
    const online = net.isOnline();

    try {
      // ── Auth: always requires network ──────────────────────────────────────
      if (apiPath.startsWith("/api/v1/auth/")) {
        if (!online) {
          return jsonReply(res, 503, {
            message: "Login requires an internet connection.",
            code: "OFFLINE_AUTH",
          });
        }
        const r = await proxyToCloud(cloudApiUrl, apiPath, method, fwdHeaders, body);
        return jsonReply(res, r.status, r.data);
      }

      // ── GET: proxy online, cache locally; serve cache when offline ─────────
      if (method === "GET") {
        if (online) {
          try {
            const r = await proxyToCloud(cloudApiUrl, apiPath, method, fwdHeaders, body);
            if (r.ok) localDb.setCache(apiPath, r.data);
            return jsonReply(res, r.status, r.data);
          } catch {
            // Cloud unreachable — fall through to cache
          }
        }
        const cached = localDb.getCache(apiPath);
        if (cached) return jsonReply(res, 200, cached);
        return jsonReply(res, 503, {
          message: "No cached data. Connect to the internet and reload to fetch data.",
          code: "NO_CACHE",
          _offline: true,
        });
      }

      // ── Online mutation: forward directly ──────────────────────────────────
      if (online) {
        const r = await proxyToCloud(cloudApiUrl, apiPath, method, fwdHeaders, body);
        return jsonReply(res, r.status, r.data);
      }

      // ── Offline mutations: queue + optimistic response ─────────────────────

      if (method === "POST" && /^\/api\/v1\/orders$/.test(apiPath)) {
        const tempId = `offline-${randomUUID()}`;
        localDb.queueMutation(tempId, method, apiPath, body, fwdHeaders);
        return jsonReply(res, 201, { data: makeOfflineOrder(body, tempId) });
      }

      if ((method === "PATCH" || method === "PUT") && apiPath.includes("/orders/")) {
        localDb.queueMutation(randomUUID(), method, apiPath, body, fwdHeaders);
        return jsonReply(res, 202, { message: "Queued for sync.", _offline: true });
      }

      localDb.queueMutation(randomUUID(), method, apiPath, body, fwdHeaders);
      return jsonReply(res, 202, {
        message: "Action queued. Will sync when internet is restored.",
        _offline: true,
      });

    } catch (err) {
      if (method === "GET") {
        const cached = localDb.getCache(apiPath);
        if (cached) return jsonReply(res, 200, cached);
      }
      return jsonReply(res, 502, { message: `Proxy error: ${err.message}`, _offline: true });
    }
  });

  server.listen(LOCAL_PORT, "127.0.0.1", () => {
    console.log(`[pos-local] Server on http://127.0.0.1:${LOCAL_PORT}`);
  });

  return server;
}

module.exports = { createLocalServer, LOCAL_PORT };
