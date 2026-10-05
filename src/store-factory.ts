import type { OAuthConfig } from "./config.js";
import { PgStore } from "./oauth/pg-store.js";
import { MemoryStore, type Store } from "./oauth/store.js";

/** Postgres when DATABASE_URL is set; otherwise a JSON file (BRIDGE_DATA_FILE) or memory. */
export function createStore(oauth: OAuthConfig): Store {
  if (oauth.database) return new PgStore(oauth.database);
  return new MemoryStore(oauth.dataFile);
}
