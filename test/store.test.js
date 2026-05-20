import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonStore } from "../src/store.js";

test("JsonStore update queue recovers after a failed write operation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fanvue-tracker-store-"));
  const store = new JsonStore(path.join(dir, "store.json"));

  await assert.rejects(
    () => store.update(() => {
      throw new Error("bad request");
    }),
    /bad request/
  );

  const result = await store.update((db) => {
    db.models.push({ id: "model_recovered", displayName: "Recovered" });
    return db.models.length;
  });

  assert.equal(result, 1);
});
