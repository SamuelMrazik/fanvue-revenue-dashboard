import { createClient } from "@supabase/supabase-js";
import { normalizeDb, trimDb } from "./store.js";

const SNAPSHOT_LIMIT = 5000;
const SYNC_LOG_LIMIT = 500;

export function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase storage.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export class SupabaseStore {
  constructor(client = createSupabaseClient()) {
    this.client = client;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    const [modelsResult, snapshotsResult, logsResult, metaResult] = await Promise.all([
      this.client.from("tracker_models").select("data"),
      this.client
        .from("tracker_snapshots")
        .select("data")
        .order("captured_at", { ascending: false })
        .limit(SNAPSHOT_LIMIT),
      this.client
        .from("tracker_sync_logs")
        .select("data")
        .order("created_at", { ascending: false })
        .limit(SYNC_LOG_LIMIT),
      this.client.from("tracker_meta").select("data").eq("id", "ops").maybeSingle()
    ]);

    for (const result of [modelsResult, snapshotsResult, logsResult]) {
      if (result.error) throw new Error(result.error.message);
    }
    const meta = readMetaPayload(metaResult);

    return normalizeDb({
      version: 1,
      models: modelsResult.data.map((row) => row.data),
      snapshots: snapshotsResult.data.map((row) => row.data).reverse(),
      syncLogs: logsResult.data.map((row) => row.data).reverse(),
      contentRequests: meta.contentRequests,
      driveLinks: meta.driveLinks,
      settings: meta.settings
    });
  }

  async write(db) {
    const normalized = normalizeDb(db);
    trimDb(normalized);

    const existingModels = await this.client.from("tracker_models").select("id");
    if (existingModels.error) throw new Error(existingModels.error.message);

    const nextModelIds = new Set(normalized.models.map((model) => model.id));
    const deleteModelIds = (existingModels.data || [])
      .map((row) => row.id)
      .filter((id) => !nextModelIds.has(id));

    if (deleteModelIds.length) {
      const deleteModels = await this.client.from("tracker_models").delete().in("id", deleteModelIds);
      if (deleteModels.error) throw new Error(deleteModels.error.message);
    }

    if (normalized.models.length) {
      const upsertModels = await this.client.from("tracker_models").upsert(
        normalized.models.map((model) => ({
          id: model.id,
          data: model,
          updated_at: model.updatedAt || new Date().toISOString()
        })),
        { onConflict: "id" }
      );
      if (upsertModels.error) throw new Error(upsertModels.error.message);
    }

    await this.replaceChildRows("tracker_snapshots", normalized.snapshots, (snapshot) => ({
      id: snapshot.id,
      model_id: snapshot.modelId,
      captured_at: snapshot.capturedAt,
      data: snapshot
    }));

    await this.replaceChildRows("tracker_sync_logs", normalized.syncLogs, (log) => ({
      id: log.id,
      model_id: log.modelId,
      created_at: log.finishedAt || log.startedAt || new Date().toISOString(),
      data: log
    }));

    await writeMetaPayload(this.client, normalized);
  }

  async replaceChildRows(table, rows, mapper) {
    if (!rows.length) return;

    const deleteAll = await this.client.from(table).delete().neq("id", "");
    if (deleteAll.error) throw new Error(deleteAll.error.message);

    const payload = rows.map(mapper);
    const chunkSize = 500;
    for (let index = 0; index < payload.length; index += chunkSize) {
      const chunk = payload.slice(index, index + chunkSize);
      const insert = await this.client.from(table).insert(chunk);
      if (insert.error) throw new Error(insert.error.message);
    }
  }

  async update(mutator) {
    const runUpdate = async () => {
      const db = await this.read();
      const result = await mutator(db);
      await this.write(db);
      return result ?? db;
    };

    const result = this.writeQueue.then(runUpdate, runUpdate);
    this.writeQueue = result.catch(() => {});
    return result;
  }
}

function readMetaPayload(metaResult) {
  if (!metaResult?.error) return metaResult?.data?.data || {};
  if (isMissingMetaTable(metaResult.error)) return {};
  console.warn("tracker_meta read skipped:", metaResult.error.message);
  return {};
}

async function writeMetaPayload(client, normalized) {
  const upsertMeta = await client.from("tracker_meta").upsert({
    id: "ops",
    data: {
      contentRequests: normalized.contentRequests,
      driveLinks: normalized.driveLinks,
      settings: normalized.settings
    },
    updated_at: new Date().toISOString()
  }, { onConflict: "id" });

  if (!upsertMeta.error) return;
  if (isMissingMetaTable(upsertMeta.error)) {
    console.warn("tracker_meta write skipped:", upsertMeta.error.message);
    return;
  }
  throw new Error(upsertMeta.error.message);
}

function isMissingMetaTable(error) {
  const code = String(error?.code || "");
  const hint = String(error?.hint || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  const combined = `${message} ${details} ${hint}`;
  return code === "PGRST116"
    || code === "PGRST205"
    || code === "42P01"
    || combined.includes("tracker_meta")
    || combined.includes("tracker meta")
    || combined.includes("schema cache")
    || combined.includes("could not find")
    || combined.includes("does not exist");
}
