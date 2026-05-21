import { fanvueApiVersion } from "./fanvue-oauth.js";

const DEFAULT_FANVUE_API_BASE_URL = "https://api.fanvue.com";

export function fanvueApiBaseUrl() {
  return process.env.FANVUE_API_BASE_URL || DEFAULT_FANVUE_API_BASE_URL;
}

export async function fanvueApiRequest(accessToken, path, options = {}) {
  const base = fanvueApiBaseUrl().endsWith("/") ? fanvueApiBaseUrl() : `${fanvueApiBaseUrl()}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, base);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "x-fanvue-api-version": fanvueApiVersion(),
      ...(options.body ? { "content-type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text.slice(0, 240) };
    }
  }

  if (!response.ok) {
    const message = formatFanvueApiError(payload, response);
    const error = new Error(`Fanvue API ${response.status}: ${message}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function fanvueApiPaginate(accessToken, path, options = {}) {
  const size = options.limit ?? 50;
  const maxPages = options.maxPages ?? 60;
  if (options.pagination !== "cursor") {
    const pageItems = await paginateByPage(accessToken, path, options, size, maxPages);
    if (pageItems.length) return pageItems;
  }

  return paginateByCursor(accessToken, path, options, size, maxPages);
}

function formatFanvueApiError(payload, response) {
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
  if (typeof payload?.error === "object" && payload.error) {
    return payload.error.message || payload.error.detail || JSON.stringify(payload.error);
  }
  return payload.error_description
    || payload.message
    || payload.detail
    || payload.title
    || (Object.keys(payload).length ? JSON.stringify(payload).slice(0, 240) : "")
    || response.statusText
    || "Request failed";
}

async function paginateByPage(accessToken, path, options, size, maxPages) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await fanvueApiRequest(accessToken, path, {
      query: {
        ...options.query,
        page,
        size
      }
    });
    const chunk = extractList(payload, options.listKeys);
    if (!chunk.length) break;
    items.push(...chunk);

    const totalPages = payload.totalPages ?? payload.pagination?.totalPages;
    const hasMore = payload.hasMore ?? payload.pagination?.hasMore;
    if (totalPages !== undefined && page >= totalPages) break;
    if (hasMore === false) break;
    if (chunk.length < size) break;
  }
  return items;
}

async function paginateByCursor(accessToken, path, options, size, maxPages) {
  const items = [];
  let cursor = "";
  let pages = 0;

  do {
    const payload = await fanvueApiRequest(accessToken, path, {
      query: {
        ...options.query,
        limit: size,
        size: options.query?.size ?? size,
        cursor: cursor || undefined
      }
    });
    const chunk = extractList(payload, options.listKeys);
    items.push(...chunk);
    cursor = payload.nextCursor || payload.next_cursor || payload.pagination?.nextCursor || "";
    pages += 1;
    if (!chunk.length) break;
  } while (cursor && pages < maxPages);

  return items;
}

export async function fanvueApiTryPaths(accessToken, paths, options = {}) {
  let lastError = null;
  for (const path of paths) {
    try {
      const items = await fanvueApiPaginate(accessToken, path, options);
      return { path, items };
    } catch (error) {
      lastError = error;
    }
  }
  const failure = lastError || new Error("Fanvue API request failed.");
  failure.triedPaths = paths;
  throw failure;
}

function extractList(payload, listKeys = []) {
  if (Array.isArray(payload)) return payload;
  const keys = [...listKeys, "content", "data", "items", "results", "folders", "posts", "links", "trackingLinks", "media"];
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  if (payload?.data && typeof payload.data === "object") {
    for (const value of Object.values(payload.data)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

export function creatorUuidFromModel(model) {
  return model?.fanvueOAuth?.profile?.uuid || model?.fanvueCreatorUuid || null;
}

export function isFanvueNotFound(error) {
  return Number(error?.statusCode) === 404 || /404/.test(String(error?.message || ""));
}
