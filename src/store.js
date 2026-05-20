import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_STORE_PATH = path.join(process.cwd(), "data", "store.json");

export class JsonStore {
  constructor(filePath = DEFAULT_STORE_PATH) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const text = await fs.readFile(this.filePath, "utf8");
      return normalizeDb(JSON.parse(text));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const seeded = createSeedDb();
      await this.write(seeded);
      return seeded;
    }
  }

  async write(db) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const normalized = normalizeDb(db);
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await fs.rename(tmpPath, this.filePath);
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

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function normalizeDb(db) {
  return {
    version: 1,
    models: Array.isArray(db.models) ? db.models : [],
    snapshots: Array.isArray(db.snapshots) ? db.snapshots : [],
    syncLogs: Array.isArray(db.syncLogs) ? db.syncLogs : []
  };
}

export function trimDb(db) {
  db.snapshots = db.snapshots.slice(-5000);
  db.syncLogs = db.syncLogs.slice(0, 500);
}

function createSeedDb() {
  return {
    version: 1,
    models: [],
    snapshots: [],
    syncLogs: []
  };
}
