import { JsonStore } from "./store.js";
import { SupabaseStore } from "./supabase-store.js";

export function createStore() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseStore();
  }
  return new JsonStore();
}

export function storageMode() {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local-json";
}
