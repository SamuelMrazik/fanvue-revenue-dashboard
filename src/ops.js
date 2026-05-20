import { createId } from "./store.js";
import { ValidationError } from "./sync.js";

const REQUEST_STATUSES = new Set(["open", "finished", "denied"]);

export function ensureOpsCollections(db) {
  if (!Array.isArray(db.contentRequests)) db.contentRequests = [];
  if (!Array.isArray(db.driveLinks)) db.driveLinks = [];
}

export function listContentRequests(db, filters = {}) {
  ensureOpsCollections(db);
  let rows = [...db.contentRequests];
  if (filters.modelId) rows = rows.filter((row) => row.modelId === filters.modelId);
  if (filters.status) rows = rows.filter((row) => row.status === filters.status);
  return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function countOpenRequests(db, modelId = null) {
  return listContentRequests(db, { status: "open", modelId: modelId || undefined }).length;
}

export function createContentRequest(db, input) {
  ensureOpsCollections(db);
  const modelId = stringField(input.modelId);
  if (!modelId) throw new ValidationError("Model is required.");
  if (!db.models.some((model) => model.id === modelId)) {
    throw new ValidationError("Model was not found.");
  }

  const request = {
    id: createId("req"),
    modelId,
    status: "open",
    urgency: normalizeUrgency(input.urgency),
    type: stringField(input.type) || "content",
    description: stringField(input.description),
    exampleImageUrl: stringField(input.exampleImageUrl) || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.contentRequests.unshift(request);
  return request;
}

export function updateContentRequest(db, requestId, input) {
  ensureOpsCollections(db);
  const index = db.contentRequests.findIndex((row) => row.id === requestId);
  if (index === -1) throw new ValidationError("Request was not found.");

  const current = db.contentRequests[index];
  const nextStatus = input.status ? stringField(input.status) : current.status;
  if (!REQUEST_STATUSES.has(nextStatus)) {
    throw new ValidationError("Invalid request status.");
  }

  const updated = {
    ...current,
    urgency: input.urgency !== undefined ? normalizeUrgency(input.urgency) : current.urgency,
    type: input.type !== undefined ? stringField(input.type) || current.type : current.type,
    description: input.description !== undefined ? stringField(input.description) : current.description,
    exampleImageUrl: input.exampleImageUrl !== undefined
      ? stringField(input.exampleImageUrl)
      : current.exampleImageUrl,
    status: nextStatus,
    updatedAt: new Date().toISOString()
  };

  db.contentRequests[index] = updated;
  return updated;
}

export function listDriveLinks(db, filters = {}) {
  ensureOpsCollections(db);
  let rows = [...db.driveLinks];
  if (filters.modelId) rows = rows.filter((row) => row.modelId === filters.modelId);
  return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function createDriveLink(db, input) {
  ensureOpsCollections(db);
  const modelId = stringField(input.modelId);
  const name = stringField(input.name).trim();
  const url = stringField(input.url).trim();
  if (!modelId) throw new ValidationError("Model is required.");
  if (!name) throw new ValidationError("Link name is required.");
  if (!url) throw new ValidationError("Drive URL is required.");
  if (!db.models.some((model) => model.id === modelId)) {
    throw new ValidationError("Model was not found.");
  }

  const link = {
    id: createId("drv"),
    modelId,
    name,
    url,
    description: stringField(input.description),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.driveLinks.unshift(link);
  return link;
}

export function updateDriveLink(db, linkId, input) {
  ensureOpsCollections(db);
  const index = db.driveLinks.findIndex((row) => row.id === linkId);
  if (index === -1) throw new ValidationError("Drive link was not found.");

  const current = db.driveLinks[index];
  const updated = {
    ...current,
    name: input.name !== undefined ? stringField(input.name).trim() || current.name : current.name,
    url: input.url !== undefined ? stringField(input.url).trim() || current.url : current.url,
    description: input.description !== undefined ? stringField(input.description) : current.description,
    updatedAt: new Date().toISOString()
  };

  db.driveLinks[index] = updated;
  return updated;
}

export function deleteDriveLink(db, linkId) {
  ensureOpsCollections(db);
  const before = db.driveLinks.length;
  db.driveLinks = db.driveLinks.filter((row) => row.id !== linkId);
  if (db.driveLinks.length === before) throw new ValidationError("Drive link was not found.");
  return { ok: true };
}

function stringField(value) {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeUrgency(value) {
  const urgency = stringField(value).toLowerCase();
  if (urgency === "high" || urgency === "medium" || urgency === "low") return urgency;
  return "medium";
}
