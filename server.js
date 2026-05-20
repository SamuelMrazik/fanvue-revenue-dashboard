import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSecretConfiguration } from "./src/crypto.js";
import { loadDotEnv } from "./src/env.js";
import {
  completeFanvueOAuth,
  createFanvueAuthorizationUrl,
  disconnectFanvueOAuth,
  getFanvueOAuthStatus
} from "./src/fanvue-oauth.js";
import { createStore, storageMode } from "./src/create-store.js";
import { buildSummary, modelFromInput, modelHasConnection, sanitizeModel, syncDueModels, syncModel, testModelConnection } from "./src/sync.js";

loadDotEnv();
assertSecretConfiguration();
assertAccessConfiguration();

const MAX_JSON_BODY_BYTES = 64 * 1024;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const store = createStore();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const dashboardUser = process.env.DASHBOARD_USER || "owner";
const dashboardPassword = process.env.DASHBOARD_PASSWORD || "";

const requestHandler = async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (!isAuthorized(request)) {
      requestAuthorization(response);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, error.statusCode || 500, { error: error.message || "Unexpected server error" });
  }
};

const server = http.createServer(requestHandler);
server.listen(port, host, () => {
  const publicHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Fanvue API Tracker running at http://${publicHost}:${port} (storage: ${storageMode()})`);
});

startHttpsServer().catch((error) => {
  console.error("HTTPS server failed to start:", error.message);
});

if (process.env.AUTO_SYNC !== "false") {
  setInterval(() => {
    syncDueModels(store).catch((error) => {
      console.error("Scheduled sync failed:", error);
    });
  }, 60_000).unref();
}

async function startHttpsServer() {
  const httpsPort = Number(process.env.HTTPS_PORT || 0);
  const keyPath = process.env.HTTPS_KEY_PATH;
  const certPath = process.env.HTTPS_CERT_PATH;
  if (!httpsPort || !keyPath || !certPath) return;

  const [key, cert] = await Promise.all([
    fs.readFile(path.resolve(keyPath)),
    fs.readFile(path.resolve(certPath))
  ]);

  https.createServer({ key, cert }, requestHandler).listen(httpsPort, host, () => {
    console.log(`Fanvue API Tracker running at https://${host}:${httpsPort}`);
  });
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      now: new Date().toISOString(),
      storage: storageMode(),
      fanvueOAuthConfigured: getFanvueOAuthStatus().configured
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/fanvue/oauth/status") {
    sendJson(response, 200, getFanvueOAuthStatus());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/fanvue/callback") {
    try {
      const result = await completeFanvueOAuth(store, url);
      redirect(response, `/?fanvue=connected&modelId=${encodeURIComponent(result.modelId)}`);
    } catch (error) {
      redirect(response, `/?fanvue=error&message=${encodeURIComponent(error.message || "Fanvue connection failed")}`);
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/summary") {
    const db = await store.read();
    sendJson(response, 200, buildSummary(db));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/models") {
    const db = await store.read();
    sendJson(response, 200, db.models.map(sanitizeModel));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/models") {
    const body = await readJson(request);
    const model = modelFromInput(body);
    const created = await store.update((db) => {
      assertUniqueModelName(db, model.displayName);
      db.models.push(model);
      return sanitizeModel(model);
    });
    sendJson(response, 201, created);
    return;
  }

  const modelRoute = url.pathname.match(/^\/api\/models\/([^/]+)$/);
  if (modelRoute && request.method === "PATCH") {
    const modelId = modelRoute[1];
    const body = await readJson(request);
    const updated = await store.update((db) => {
      const index = db.models.findIndex((model) => model.id === modelId);
      if (index === -1) throw httpError(404, "Model was not found.");
      const nextModel = modelFromInput(body, db.models[index]);
      assertUniqueModelName(db, nextModel.displayName, modelId);
      db.models[index] = nextModel;
      return sanitizeModel(db.models[index]);
    });
    sendJson(response, 200, updated);
    return;
  }

  if (modelRoute && request.method === "DELETE") {
    const modelId = modelRoute[1];
    await store.update((db) => {
      const exists = db.models.some((model) => model.id === modelId);
      if (!exists) throw httpError(404, "Model was not found.");
      db.models = db.models.filter((model) => model.id !== modelId);
      db.snapshots = db.snapshots.filter((snapshot) => snapshot.modelId !== modelId);
      db.syncLogs = db.syncLogs.filter((log) => log.modelId !== modelId);
    });
    sendJson(response, 200, { ok: true });
    return;
  }

  const syncRoute = url.pathname.match(/^\/api\/models\/([^/]+)\/sync$/);
  if (syncRoute && request.method === "POST") {
    const result = await syncModel(store, syncRoute[1]);
    sendJson(response, 200, result);
    return;
  }

  const connectFanvueRoute = url.pathname.match(/^\/api\/models\/([^/]+)\/fanvue\/connect$/);
  if (connectFanvueRoute && request.method === "POST") {
    const modelId = connectFanvueRoute[1];
    const db = await store.read();
    const model = db.models.find((item) => item.id === modelId);
    if (!model) throw httpError(404, "Model was not found.");

    const authorizationUrl = await createFanvueAuthorizationUrl(modelId);
    sendJson(response, 200, { authorizationUrl });
    return;
  }

  const disconnectFanvueRoute = url.pathname.match(/^\/api\/models\/([^/]+)\/fanvue\/disconnect$/);
  if (disconnectFanvueRoute && request.method === "POST") {
    await disconnectFanvueOAuth(store, disconnectFanvueRoute[1]);
    sendJson(response, 200, { ok: true });
    return;
  }

  const testRoute = url.pathname.match(/^\/api\/models\/([^/]+)\/test$/);
  if (testRoute && request.method === "POST") {
    const result = await testModelConnection(store, testRoute[1]);
    sendJson(response, 200, { ok: true, result });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sync-all") {
    const db = await store.read();
    const results = [];
    for (const model of db.models.filter((item) => item.enabled && modelHasConnection(item))) {
      try {
        results.push({ modelId: model.id, ...(await syncModel(store, model.id)) });
      } catch (error) {
        results.push({ modelId: model.id, status: "error", message: error.message });
      }
    }
    sendJson(response, 200, { results });
    return;
  }

  throw httpError(404, "API route was not found.");
}

async function readJson(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw httpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

async function serveStatic(response, requestPath) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(publicDir, normalizedPath));
  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${path.sep}`)) {
    throw httpError(403, "Invalid static asset path.");
  }

  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, { "content-type": contentType(filePath) });
    response.end(body);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const body = await fs.readFile(path.join(publicDir, "index.html"));
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function redirect(response, location) {
  response.writeHead(302, { location });
  response.end();
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assertAccessConfiguration() {
  if (process.env.NODE_ENV === "production" && !process.env.DASHBOARD_PASSWORD) {
    throw new Error("DASHBOARD_PASSWORD is required in production so the dashboard is not public.");
  }
}

function isAuthorized(request) {
  if (!dashboardPassword) return true;

  const header = request.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return secureEquals(username, dashboardUser) && secureEquals(password, dashboardPassword);
}

function requestAuthorization(response) {
  response.writeHead(401, {
    "www-authenticate": 'Basic realm="Revenue Dashboard", charset="UTF-8"',
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end("Authentication required.");
}

function secureEquals(left, right) {
  const leftHash = crypto.createHash("sha256").update(left).digest();
  const rightHash = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function assertUniqueModelName(db, displayName, currentModelId = null) {
  const normalizedName = displayName.trim().toLowerCase();
  const duplicate = db.models.find((model) => (
    model.id !== currentModelId && model.displayName.trim().toLowerCase() === normalizedName
  ));

  if (duplicate) {
    throw httpError(409, "A model with that display name already exists.");
  }
}
