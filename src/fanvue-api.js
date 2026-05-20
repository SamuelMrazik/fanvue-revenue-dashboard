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
    const message = payload.error_description || payload.error || payload.message || response.statusText;
    const error = new Error(`Fanvue API ${response.status}: ${message}`);
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

export async function fanvueApiPaginate(accessToken, path, options = {}) {
  const items = [];
  let cursor = options.cursor || "";
  let pages = 0;
  const maxPages = options.maxPages ?? 8;

  do {
    const payload = await fanvueApiRequest(accessToken, path, {
      query: {
        ...options.query,
        limit: options.limit ?? 50,
        cursor: cursor || undefined
      }
    });
    const pageItems = extractList(payload, options.listKeys);
    items.push(...pageItems);
    cursor = payload.nextCursor || payload.next_cursor || payload.pagination?.nextCursor || "";
    pages += 1;
  } while (cursor && pages < maxPages);

  return items;
}

function extractList(payload, listKeys = []) {
  if (Array.isArray(payload)) return payload;
  const keys = [...listKeys, "data", "items", "results", "folders", "posts", "links", "media"];
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return [];
}

export function creatorUuidFromModel(model) {
  return model?.fanvueOAuth?.profile?.uuid || model?.fanvueCreatorUuid || null;
}
