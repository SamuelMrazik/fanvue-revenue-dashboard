import crypto from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { consumeOAuthState, saveOAuthState } from "./oauth-state.js";

const AUTHORIZATION_URL = "https://auth.fanvue.com/oauth2/auth";
const TOKEN_URL = "https://auth.fanvue.com/oauth2/token";
const DEFAULT_FANVUE_API_BASE_URL = "https://api.fanvue.com";
const DEFAULT_FANVUE_METRICS_ENDPOINT = "/insights/earnings/summary";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

let refreshPromiseByModelId = new Map();

export function getFanvueOAuthStatus() {
  const configured = Boolean(
    process.env.FANVUE_CLIENT_ID &&
    process.env.FANVUE_CLIENT_SECRET &&
    process.env.FANVUE_REDIRECT_URI
  );

  return {
    configured,
    redirectUri: process.env.FANVUE_REDIRECT_URI || "",
    scopes: fanvueScopes(),
    apiVersion: fanvueApiVersion()
  };
}

export function requireFanvueOAuthConfig() {
  const status = getFanvueOAuthStatus();
  if (!status.configured) {
    const missing = [
      ["FANVUE_CLIENT_ID", process.env.FANVUE_CLIENT_ID],
      ["FANVUE_CLIENT_SECRET", process.env.FANVUE_CLIENT_SECRET],
      ["FANVUE_REDIRECT_URI", process.env.FANVUE_REDIRECT_URI]
    ].filter(([, value]) => !value).map(([key]) => key);
    throw httpError(400, `Fanvue OAuth is not configured. Missing ${missing.join(", ")} in .env.`);
  }
  return status;
}

export async function createFanvueAuthorizationUrl(modelId) {
  const status = requireFanvueOAuthConfig();
  const codeVerifier = base64Url(crypto.randomBytes(32));
  const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  const state = base64Url(crypto.randomBytes(32));

  await saveOAuthState({
    state,
    modelId,
    codeVerifier,
    redirectUri: status.redirectUri
  });

  const authUrl = new URL(AUTHORIZATION_URL);
  authUrl.searchParams.set("client_id", process.env.FANVUE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", status.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", status.scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return authUrl.toString();
}

export async function completeFanvueOAuth(store, callbackUrl) {
  const url = callbackUrl instanceof URL ? callbackUrl : new URL(callbackUrl);
  const error = url.searchParams.get("error");
  if (error) {
    const description = url.searchParams.get("error_description") || error;
    throw httpError(400, `Fanvue authorization failed: ${description}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) throw httpError(400, "Fanvue callback is missing code or state.");

  const pending = await consumeOAuthState(state);
  if (!pending) throw httpError(400, "Fanvue OAuth state was not found or expired. Start the connection again.");

  const tokens = await exchangeToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.codeVerifier
  });

  let profile = null;
  try {
    profile = await fetchFanvueCurrentUser(tokens.access_token);
  } catch {
    profile = null;
  }

  const updated = await store.update((db) => {
    const model = db.models.find((item) => item.id === pending.modelId);
    if (!model) throw httpError(404, "Model was not found.");

    model.fanvueOAuth = tokenStateFromResponse(tokens, profile);
    model.apiBaseUrl = fanvueApiBaseUrl();
    model.endpointPath = fanvueMetricsEndpoint();
    model.updatedAt = new Date().toISOString();
    return model;
  });

  return {
    modelId: updated.id,
    displayName: updated.displayName,
    fanvueProfile: updated.fanvueOAuth?.profile || null
  };
}

export async function disconnectFanvueOAuth(store, modelId) {
  await store.update((db) => {
    const model = db.models.find((item) => item.id === modelId);
    if (!model) throw httpError(404, "Model was not found.");
    model.fanvueOAuth = null;
    model.updatedAt = new Date().toISOString();
  });
}

export async function getFanvueAccessToken(store, model) {
  if (!model?.fanvueOAuth?.accessTokenEncrypted) return "";

  if (!isTokenExpiring(model.fanvueOAuth)) {
    return decryptSecret(model.fanvueOAuth.accessTokenEncrypted);
  }

  const existingRefresh = refreshPromiseByModelId.get(model.id);
  if (existingRefresh) return existingRefresh;

  const refreshPromise = refreshFanvueToken(store, model.id).finally(() => {
    refreshPromiseByModelId.delete(model.id);
  });
  refreshPromiseByModelId.set(model.id, refreshPromise);
  return refreshPromise;
}

export function sanitizeFanvueOAuth(oauth) {
  if (!oauth) return null;
  return {
    connected: Boolean(oauth.accessTokenEncrypted && oauth.refreshTokenEncrypted),
    connectedAt: oauth.connectedAt || null,
    expiresAt: oauth.expiresAt || null,
    scope: oauth.scope || "",
    tokenType: oauth.tokenType || "Bearer",
    profile: oauth.profile || null
  };
}

async function refreshFanvueToken(store, modelId) {
  const db = await store.read();
  const model = db.models.find((item) => item.id === modelId);
  if (!model) throw httpError(404, "Model was not found.");
  if (!model.fanvueOAuth?.refreshTokenEncrypted) {
    throw httpError(400, "Model is not connected to Fanvue OAuth.");
  }

  const refreshToken = decryptSecret(model.fanvueOAuth.refreshTokenEncrypted);
  const tokens = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  let accessToken = tokens.access_token;
  await store.update((nextDb) => {
    const nextModel = nextDb.models.find((item) => item.id === modelId);
    if (!nextModel) throw httpError(404, "Model was not found.");
    nextModel.fanvueOAuth = tokenStateFromResponse(tokens, nextModel.fanvueOAuth?.profile || null);
    nextModel.updatedAt = new Date().toISOString();
  });

  return accessToken;
}

async function exchangeToken(parameters) {
  requireFanvueOAuthConfig();
  const body = new URLSearchParams({
    ...parameters,
    client_id: process.env.FANVUE_CLIENT_ID
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: basicClientAuthorization(),
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw httpError(response.status, `Fanvue token request failed: ${payload.error_description || payload.error || response.statusText}`);
  }

  if (!payload.access_token) throw httpError(502, "Fanvue token response did not include an access token.");
  return payload;
}

function basicClientAuthorization() {
  const credentials = Buffer.from(`${process.env.FANVUE_CLIENT_ID}:${process.env.FANVUE_CLIENT_SECRET}`).toString("base64");
  return `Basic ${credentials}`;
}

async function fetchFanvueCurrentUser(accessToken) {
  const response = await fetch(`${fanvueApiBaseUrl()}/users/me`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "x-fanvue-api-version": fanvueApiVersion()
    }
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw httpError(response.status, `Fanvue user lookup failed: ${payload.error || response.statusText}`);
  }

  return {
    uuid: payload.uuid || null,
    email: payload.email || null,
    handle: payload.handle || null,
    displayName: payload.displayName || null,
    isCreator: Boolean(payload.isCreator)
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 240) };
  }
}

function tokenStateFromResponse(tokens, profile) {
  const now = Date.now();
  return {
    accessTokenEncrypted: encryptSecret(tokens.access_token),
    refreshTokenEncrypted: encryptSecret(tokens.refresh_token || ""),
    expiresAt: new Date(now + Number(tokens.expires_in || 3600) * 1000).toISOString(),
    scope: tokens.scope || fanvueScopes(),
    tokenType: tokens.token_type || "Bearer",
    connectedAt: new Date().toISOString(),
    profile: profile || null
  };
}

function isTokenExpiring(oauth) {
  if (!oauth.expiresAt) return true;
  return new Date(oauth.expiresAt).getTime() - Date.now() <= TOKEN_REFRESH_BUFFER_MS;
}

function fanvueApiBaseUrl() {
  return process.env.FANVUE_API_BASE_URL || DEFAULT_FANVUE_API_BASE_URL;
}

function fanvueMetricsEndpoint() {
  return process.env.FANVUE_METRICS_ENDPOINT || DEFAULT_FANVUE_METRICS_ENDPOINT;
}

function fanvueScopes() {
  return process.env.FANVUE_SCOPES || [
    "openid",
    "offline_access",
    "offline",
    "read:self",
    "read:insights",
    "read:creator",
    "read:media",
    "read:post",
    "read:fan",
    "read:tracking_links",
    "read:agency"
  ].join(" ");
}

export function fanvueApiVersion() {
  return process.env.FANVUE_API_VERSION || "2025-06-26";
}

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
