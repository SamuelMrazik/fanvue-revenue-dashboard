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
    const [modelsResult, snapshotsResult, logsResult] = await Promise.all([
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
        .limit(SYNC_LOG_LIMIT)
    ]);

    for (const result of [modelsResult, snapshotsResult, logsResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    return normalizeDb({
      version: 1,
      models: modelsResult.data.map((row) => row.data),
      snapshots: snapshotsResult.data.map((row) => row.data).reverse(),
      syncLogs: logsResult.data.map((row) => row.data).reverse()
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
  }

  async replaceChildRows(table, rows, mapper) {
    const deleteAll = await this.client.from(table).delete().neq("id", "");
    if (deleteAll.error) throw new Error(deleteAll.error.message);

    if (!rows.length) return;

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
