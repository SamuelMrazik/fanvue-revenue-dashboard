import { decryptSecret, encryptSecret } from "./crypto.js";
import { fetchFanvueMetrics } from "./connector.js";
import { fetchModelAudienceSummary, fetchModelPosts, fetchModelTrackingSummary, fetchModelVault } from "./fanvue-content.js";
import { fanvueApiVersion, getFanvueAccessToken, sanitizeFanvueOAuth } from "./fanvue-oauth.js";
import { periodBounds } from "./periods.js";
import { countOpenRequests, ensureOpsCollections } from "./ops.js";
import { autoSyncIntervalMinutes, normalizeSettings } from "./settings.js";
import { createId, trimDb } from "./store.js";

const DEFAULT_FANVUE_API_BASE_URL = "https://api.fanvue.com";
const DEFAULT_FANVUE_METRICS_ENDPOINT = "/insights/earnings/summary";

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

export function sanitizeModel(model) {
  const { apiTokenEncrypted, ...safeModel } = model;
  return {
    ...safeModel,
    fanvueOAuth: sanitizeFanvueOAuth(model.fanvueOAuth),
    apiTokenConfigured: Boolean(apiTokenEncrypted)
  };
}

export function sanitizeSnapshot(snapshot) {
  const { raw, ...safeSnapshot } = snapshot;
  return safeSnapshot;
}

export async function loadModelContent(store, modelId, kind) {
  const db = await store.read();
  const model = db.models.find((item) => item.id === modelId);
  if (!model) throw notFoundError("Model was not found.");

  const apiToken = await accessTokenForModel(store, model);
  if (kind === "vault") return fetchModelVault(apiToken, model);
  if (kind === "posts") return fetchModelPosts(apiToken, model);
  if (kind === "tracking") return fetchModelTrackingSummary(apiToken, model, periodBounds("last90"));
  throw new ValidationError("Unknown content type.");
}

export async function proxyModelMedia(store, modelId, mediaUrl) {
  const db = await store.read();
  const model = db.models.find((item) => item.id === modelId);
  if (!model) throw notFoundError("Model was not found.");
  if (!mediaUrl) throw new ValidationError("Media URL is required.");

  let target;
  try {
    target = new URL(mediaUrl);
  } catch {
    throw new ValidationError("Media URL is invalid.");
  }

  const host = target.hostname.toLowerCase();
  const allowed = host === "fanvue.com"
    || host.endsWith(".fanvue.com")
    || host.endsWith(".cloudfront.net")
    || host.endsWith(".amazonaws.com");
  if (!allowed) throw new ValidationError("Media host is not allowed.");

  const apiToken = await accessTokenForModel(store, model);
  const upstream = await fetch(target.toString(), {
    headers: {
      authorization: `Bearer ${apiToken}`,
      "x-fanvue-api-version": fanvueApiVersion(),
      accept: "*/*"
    }
  });

  if (!upstream.ok) {
    const error = new Error(`Fanvue media ${upstream.status}`);
    error.statusCode = upstream.status === 404 ? 404 : 502;
    throw error;
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  return {
    contentType: upstream.headers.get("content-type") || "application/octet-stream",
    buffer
  };
}

export function sanitizeSyncLog(log) {
  return {
    ...log,
    metrics: log.metrics ? sanitizeSnapshot(log.metrics) : undefined
  };
}

export function latestSnapshotByModel(snapshots) {
  const latest = new Map();
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.modelId);
    if (!current || new Date(snapshot.capturedAt) > new Date(current.capturedAt)) {
      latest.set(snapshot.modelId, snapshot);
    }
  }
  return latest;
}

export function buildSummary(db) {
  const latest = latestSnapshotByModel(db.snapshots);
  const totals = {
    revenueCents: 0,
    grossRevenueCents: 0,
    fanvueNetCents: 0,
    fanvueFeeCents: 0,
    subscriptionRevenueCents: 0,
    renewalRevenueCents: 0,
    messageRevenueCents: 0,
    postRevenueCents: 0,
    referralRevenueCents: 0,
    otherRevenueCents: 0,
    subscribers: 0,
    messages: 0,
    tipsCents: 0,
    clicks: 0,
    okModels: 0,
    errorModels: 0
  };

  for (const model of db.models) {
    const snapshot = latest.get(model.id);
    if (snapshot) {
      totals.revenueCents += snapshot.revenueCents || 0;
      totals.grossRevenueCents += snapshot.grossRevenueCents ?? snapshot.revenueCents ?? 0;
      totals.fanvueNetCents += snapshot.fanvueNetCents ?? snapshot.revenueCents ?? 0;
      totals.fanvueFeeCents += snapshot.fanvueFeeCents || 0;
      totals.subscriptionRevenueCents += snapshot.subscriptionRevenueCents || 0;
      totals.renewalRevenueCents += snapshot.renewalRevenueCents || 0;
      totals.messageRevenueCents += snapshot.messageRevenueCents || 0;
      totals.postRevenueCents += snapshot.postRevenueCents || 0;
      totals.referralRevenueCents += snapshot.referralRevenueCents || 0;
      totals.otherRevenueCents += snapshot.otherRevenueCents || 0;
      totals.subscribers += snapshot.subscribers || 0;
      totals.messages += snapshot.messages || 0;
      totals.tipsCents += snapshot.tipsCents || 0;
      totals.clicks += snapshot.clicks || 0;
    }

    if (model.lastStatus === "error") totals.errorModels += 1;
    if (model.lastStatus === "ok") totals.okModels += 1;
  }

  ensureOpsCollections(db);
  const settings = normalizeSettings(db);

  return {
    generatedAt: new Date().toISOString(),
    models: db.models.map(sanitizeModel),
    snapshots: db.snapshots.map(sanitizeSnapshot),
    syncLogs: db.syncLogs.map(sanitizeSyncLog),
    contentRequests: db.contentRequests,
    driveLinks: db.driveLinks,
    settings,
    totals: {
      ...totals,
      openVaRequests: countOpenRequests(db)
    }
  };
}

export function modelFromInput(input, existing = {}) {
  const displayName = stringField(input.displayName ?? existing.displayName).trim();
  const apiBaseUrl = stringField(input.apiBaseUrl ?? existing.apiBaseUrl ?? defaultFanvueApiBaseUrl()).trim();
  const endpointPath = normalizeEndpointPath(input.endpointPath ?? existing.endpointPath ?? defaultFanvueMetricsEndpoint());
  const syncIntervalMinutes = Number(input.syncIntervalMinutes ?? existing.syncIntervalMinutes ?? 60);

  if (!displayName) throw new ValidationError("Display name is required.");
  validateApiBaseUrl(apiBaseUrl);
  if (!Number.isFinite(syncIntervalMinutes) || syncIntervalMinutes < 5) {
    throw new ValidationError("Sync interval must be at least 5 minutes.");
  }

  const now = new Date().toISOString();
  const model = {
    ...existing,
    displayName,
    apiBaseUrl,
    endpointPath,
    syncIntervalMinutes: Math.round(syncIntervalMinutes),
    enabled: booleanField(input.enabled, existing.enabled ?? true),
    updatedAt: now
  };

  if (!model.id) {
    model.id = createId("model");
    model.createdAt = now;
    model.lastSyncAt = null;
    model.nextSyncAt = now;
    model.lastStatus = "pending";
    model.lastError = "";
  }

  if (typeof input.chartColor === "string" && input.chartColor.trim()) {
    model.chartColor = input.chartColor.trim();
  } else if (!model.chartColor) {
    model.chartColor = "";
  }

  if (input.clearAvatar) {
    model.avatarUrl = null;
  } else if (typeof input.avatarUrl === "string" && input.avatarUrl.startsWith("data:image/")) {
    if (input.avatarUrl.length > 280_000) {
      throw new ValidationError("Profile image is too large. Use a smaller photo (under 200KB).");
    }
    model.avatarUrl = input.avatarUrl;
  }

  if (typeof input.apiToken === "string" && input.apiToken.trim()) {
    model.apiTokenEncrypted = encryptSecret(input.apiToken.trim());
  } else if (input.clearToken) {
    model.apiTokenEncrypted = null;
  } else if (!("apiTokenEncrypted" in model)) {
    model.apiTokenEncrypted = null;
  }

  return model;
}

export async function syncModel(store, modelId) {
  const db = await store.read();
  const model = db.models.find((item) => item.id === modelId);
  if (!model) throw notFoundError("Model was not found.");

  const startedAt = new Date().toISOString();
  try {
    const apiToken = await accessTokenForModel(store, model);
    const syncPeriod = periodBounds("last90");
    const { metrics, raw } = await fetchFanvueMetrics({ ...model, apiToken }, { period: "last90", timeoutMs: 30000 });
    const capturedAt = metrics.sourceTimestamp ? new Date(metrics.sourceTimestamp).toISOString() : new Date().toISOString();
    const [trackingResult, audienceResult] = await Promise.allSettled([
      fetchModelTrackingSummary(apiToken, model, syncPeriod),
      fetchModelAudienceSummary(apiToken, model, syncPeriod)
    ]);
    const snapshot = {
      id: createId("snap"),
      modelId,
      capturedAt,
      revenueCents: metrics.revenueCents,
      grossRevenueCents: metrics.grossRevenueCents ?? metrics.revenueCents,
      fanvueNetCents: metrics.fanvueNetCents ?? metrics.revenueCents,
      fanvueFeeCents: metrics.fanvueFeeCents ?? Math.max((metrics.grossRevenueCents ?? metrics.revenueCents) - metrics.revenueCents, 0),
      subscriptionRevenueCents: metrics.subscriptionRevenueCents ?? 0,
      renewalRevenueCents: metrics.renewalRevenueCents ?? 0,
      messageRevenueCents: metrics.messageRevenueCents ?? 0,
      postRevenueCents: metrics.postRevenueCents ?? 0,
      referralRevenueCents: metrics.referralRevenueCents ?? 0,
      otherRevenueCents: metrics.otherRevenueCents ?? 0,
      dailyEarnings: metrics.dailyEarnings ?? [],
      subscribers: metrics.subscribers,
      messages: metrics.messages,
      tipsCents: metrics.tipsCents,
      clicks: metrics.clicks,
      currency: metrics.currency,
      trackingSummary: trackingResult.status === "fulfilled" ? trackingResult.value : null,
      audienceSummary: audienceResult.status === "fulfilled" ? audienceResult.value : null,
      syncDetails: {
        dailyEarningsPoints: metrics.dailyEarnings?.length || 0,
        trackingLinks: trackingResult.status === "fulfilled" ? (trackingResult.value.links?.length || 0) : 0,
        audienceDays: audienceResult.status === "fulfilled" ? (audienceResult.value.daily?.length || 0) : 0
      },
      contentErrors: {
        tracking: trackingResult.status === "rejected" ? trackingResult.reason.message : "",
        audience: audienceResult.status === "rejected" ? audienceResult.reason.message : "",
        vault: "",
        posts: ""
      },
      raw
    };

    await store.update((nextDb) => {
      const nextModel = nextDb.models.find((item) => item.id === modelId);
      if (!nextModel) throw new Error("Model was removed before sync completed.");
      const finishedAt = new Date().toISOString();
      nextModel.lastSyncAt = finishedAt;
      const interval = autoSyncIntervalMinutes(nextDb) ?? nextModel.syncIntervalMinutes;
      nextModel.nextSyncAt = nextSyncTime(interval, finishedAt);
      nextModel.lastStatus = "ok";
      nextModel.lastError = "";
      nextModel.updatedAt = finishedAt;
      nextDb.snapshots.push(snapshot);
      nextDb.syncLogs.unshift({
        id: createId("log"),
        modelId,
        startedAt,
        finishedAt,
        status: "ok",
        message: "Revenue, tracking, and audience synced (vault/posts load on their tabs)",
        metrics: snapshot
      });
      trimDb(nextDb);
    });

    return { status: "ok", snapshot };
  } catch (error) {
    await store.update((nextDb) => {
      const nextModel = nextDb.models.find((item) => item.id === modelId);
      if (!nextModel) return;
      const finishedAt = new Date().toISOString();
      nextModel.lastSyncAt = finishedAt;
      const interval = autoSyncIntervalMinutes(nextDb) ?? nextModel.syncIntervalMinutes;
      nextModel.nextSyncAt = nextSyncTime(interval, finishedAt);
      nextModel.lastStatus = "error";
      nextModel.lastError = error.message;
      nextModel.updatedAt = finishedAt;
      nextDb.syncLogs.unshift({
        id: createId("log"),
        modelId,
        startedAt,
        finishedAt,
        status: "error",
        message: error.message
      });
      trimDb(nextDb);
    });
    throw error;
  }
}

export async function testModelConnection(store, modelId) {
  const db = await store.read();
  const model = db.models.find((item) => item.id === modelId);
  if (!model) throw notFoundError("Model was not found.");

  const apiToken = await accessTokenForModel(store, model);
  const { metrics } = await fetchFanvueMetrics({ ...model, apiToken });
  return { status: "ok", metrics };
}

export async function syncDueModels(store) {
  const db = await store.read();
  const intervalMinutes = autoSyncIntervalMinutes(db);
  if (!intervalMinutes) return [];

  const now = Date.now();
  const dueModels = db.models.filter((model) => {
    if (!model.enabled) return false;
    if (!modelHasConnection(model)) return false;
    if (!model.nextSyncAt) return true;
    return new Date(model.nextSyncAt).getTime() <= now;
  });

  const results = [];
  for (const model of dueModels) {
    try {
      results.push(await syncModel(store, model.id));
    } catch (error) {
      results.push({ status: "error", modelId: model.id, message: error.message });
    }
  }
  return results;
}

export function modelHasConnection(model) {
  return Boolean(model?.fanvueOAuth?.accessTokenEncrypted || model?.apiTokenEncrypted);
}

function nextSyncTime(minutes, fromIso) {
  return new Date(new Date(fromIso).getTime() + minutes * 60 * 1000).toISOString();
}

function stringField(value) {
  return typeof value === "string" ? value : "";
}

async function accessTokenForModel(store, model) {
  if (model.fanvueOAuth?.accessTokenEncrypted) {
    return getFanvueAccessToken(store, model);
  }
  if (!model.apiTokenEncrypted) {
    throw new ValidationError("Connect Fanvue before syncing this model.");
  }
  return decryptSecret(model.apiTokenEncrypted);
}

function normalizeEndpointPath(value) {
  const endpointPath = stringField(value).trim() || defaultFanvueMetricsEndpoint();
  if (/^https?:\/\//i.test(endpointPath)) {
    throw new ValidationError("Metrics endpoint must be a path, not a full URL.");
  }
  return endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
}

function defaultFanvueApiBaseUrl() {
  return process.env.FANVUE_API_BASE_URL || DEFAULT_FANVUE_API_BASE_URL;
}

function defaultFanvueMetricsEndpoint() {
  return process.env.FANVUE_METRICS_ENDPOINT || DEFAULT_FANVUE_METRICS_ENDPOINT;
}

function validateApiBaseUrl(value) {
  if (!value) throw new ValidationError("API base URL is required.");

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError("API base URL must be a valid http(s) URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ValidationError("API base URL must use http or https.");
  }
}

function booleanField(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return Boolean(fallback);
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return Boolean(value);
}

function notFoundError(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}
