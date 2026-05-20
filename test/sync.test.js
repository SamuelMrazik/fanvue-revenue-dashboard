import assert from "node:assert/strict";
import test from "node:test";
import { buildSummary, modelFromInput, sanitizeModel } from "../src/sync.js";

test("modelFromInput validates connection fields before saving", () => {
  assert.throws(
    () => modelFromInput({ displayName: "A", apiBaseUrl: "ftp://example.com" }),
    /http or https/
  );

  const fanvueModel = modelFromInput({ displayName: "Fanvue model" });
  assert.equal(fanvueModel.apiBaseUrl, "https://api.fanvue.com");
  assert.equal(fanvueModel.endpointPath, "/insights/earnings/summary");

  const model = modelFromInput({
    displayName: "A",
    apiBaseUrl: "https://api.example.com",
    endpointPath: "analytics",
    syncIntervalMinutes: 15,
    enabled: false
  });

  assert.equal(model.endpointPath, "/analytics");
  assert.equal(model.enabled, false);
});

test("buildSummary does not expose raw API payloads to the browser", () => {
  const summary = buildSummary({
    models: [{ id: "model_1", displayName: "A", lastStatus: "ok" }],
    snapshots: [{
      id: "snap_1",
      modelId: "model_1",
      capturedAt: new Date().toISOString(),
      revenueCents: 1000,
      raw: { tokenLike: "secret" }
    }],
    syncLogs: [{
      id: "log_1",
      modelId: "model_1",
      status: "ok",
      metrics: {
        id: "snap_1",
        modelId: "model_1",
        capturedAt: new Date().toISOString(),
        revenueCents: 1000,
        raw: { tokenLike: "secret" }
      }
    }]
  });

  assert.equal("raw" in summary.snapshots[0], false);
  assert.equal("raw" in summary.syncLogs[0].metrics, false);
});

test("sanitizeModel exposes OAuth status without encrypted tokens", () => {
  const safeModel = sanitizeModel({
    id: "model_1",
    displayName: "A",
    apiTokenEncrypted: "encrypted-manual-token",
    fanvueOAuth: {
      accessTokenEncrypted: "encrypted-access-token",
      refreshTokenEncrypted: "encrypted-refresh-token",
      connectedAt: "2026-05-20T00:00:00.000Z",
      expiresAt: "2026-05-20T01:00:00.000Z",
      scope: "openid read:self",
      profile: { handle: "creator" }
    }
  });

  assert.equal("apiTokenEncrypted" in safeModel, false);
  assert.equal("accessTokenEncrypted" in safeModel.fanvueOAuth, false);
  assert.equal("refreshTokenEncrypted" in safeModel.fanvueOAuth, false);
  assert.equal(safeModel.apiTokenConfigured, true);
  assert.equal(safeModel.fanvueOAuth.connected, true);
  assert.equal(safeModel.fanvueOAuth.profile.handle, "creator");
});
