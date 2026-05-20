import { createSupabaseClient } from "./supabase-store.js";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const memoryStates = new Map();

export async function saveOAuthState({ state, modelId, codeVerifier, redirectUri }) {
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();

  if (useSupabaseOAuthState()) {
    const client = createSupabaseClient();
    const result = await client.from("tracker_oauth_states").upsert({
      state,
      model_id: modelId,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      expires_at: expiresAt
    });
    if (result.error) throw new Error(result.error.message);
    return;
  }

  memoryStates.set(state, {
    modelId,
    codeVerifier,
    redirectUri,
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS
  });
}

export async function consumeOAuthState(state) {
  if (useSupabaseOAuthState()) {
    const client = createSupabaseClient();
    const result = await client
      .from("tracker_oauth_states")
      .select("model_id, code_verifier, redirect_uri, expires_at")
      .eq("state", state)
      .maybeSingle();

    if (result.error) throw new Error(result.error.message);
    if (!result.data) return null;

    await client.from("tracker_oauth_states").delete().eq("state", state);

    const expiresAt = new Date(result.data.expires_at).getTime();
    if (expiresAt < Date.now()) return null;

    return {
      modelId: result.data.model_id,
      codeVerifier: result.data.code_verifier,
      redirectUri: result.data.redirect_uri,
      expiresAt
    };
  }

  const pending = memoryStates.get(state);
  memoryStates.delete(state);
  if (!pending) return null;
  if (pending.expiresAt < Date.now()) return null;
  return pending;
}

function useSupabaseOAuthState() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
