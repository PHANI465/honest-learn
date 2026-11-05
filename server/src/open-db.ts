import { config } from "./config.ts";
import { openDb, openPostgres, type DB } from "./db.ts";
import { neonDriver } from "./db-neon.ts";

/**
 * Picks the database from the environment:
 *   DATABASE_URL / POSTGRES_URL set  → Postgres (Neon over HTTPS)
 *   on Vercel without a database     → in-memory SQLite "demo mode" (data may reset at any time)
 *   otherwise                        → SQLite file at DB_PATH (local development, single server)
 */
export function openConfiguredDb(): DB {
  if (config.databaseUrl) return openPostgres(neonDriver(config.databaseUrl));
  if (config.isVercel) {
    console.warn("No DATABASE_URL: running in demo mode with an in-memory database. Accounts and progress may reset.");
    return openDb(":memory:", { demo: true });
  }
  return openDb(config.dbPath);
}
