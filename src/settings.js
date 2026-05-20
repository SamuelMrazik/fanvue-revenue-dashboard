import { ValidationError } from "./sync.js";

export function defaultSettings() {
  return {
    autoSyncEnabled: true,
    autoSyncIntervalMinutes: 60
  };
}

export function normalizeSettings(db) {
  const incoming = db.settings && typeof db.settings === "object" ? db.settings : {};
  const settings = {
    ...defaultSettings(),
    ...incoming
  };
  settings.autoSyncEnabled = Boolean(settings.autoSyncEnabled);
  settings.autoSyncIntervalMinutes = Math.round(Number(settings.autoSyncIntervalMinutes) || 60);
  if (settings.autoSyncIntervalMinutes < 5) {
    settings.autoSyncIntervalMinutes = 5;
  }
  db.settings = settings;
  return settings;
}

export function updateSettings(db, input) {
  const current = normalizeSettings(db);
  const next = {
    autoSyncEnabled: input.autoSyncEnabled !== undefined
      ? Boolean(input.autoSyncEnabled)
      : current.autoSyncEnabled,
    autoSyncIntervalMinutes: input.autoSyncIntervalMinutes !== undefined
      ? Number(input.autoSyncIntervalMinutes)
      : current.autoSyncIntervalMinutes
  };

  if (!Number.isFinite(next.autoSyncIntervalMinutes) || next.autoSyncIntervalMinutes < 5) {
    throw new ValidationError("Automatic sync interval must be at least 5 minutes.");
  }

  db.settings = {
    autoSyncEnabled: next.autoSyncEnabled,
    autoSyncIntervalMinutes: Math.round(next.autoSyncIntervalMinutes)
  };
  return db.settings;
}

export function autoSyncIntervalMinutes(db) {
  const settings = normalizeSettings(db);
  return settings.autoSyncEnabled ? settings.autoSyncIntervalMinutes : null;
}
