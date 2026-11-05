// Test-only Postgres: PGlite runs a real Postgres in-process (WASM), so the API suite can
// run against the Postgres dialect without a database server. Selected with TEST_DB=pglite.
import { PGlite } from "@electric-sql/pglite";
import { openPostgres, type DB, type PgDriver } from "../src/db.ts";

export function pgliteDriver(pg: PGlite): PgDriver {
  return {
    async query(text, params) {
      const r = await pg.query<Record<string, unknown>>(text, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? 0 };
    },
    async batch(statements) {
      await pg.transaction(async (tx) => {
        for (const s of statements) await tx.query(s);
      });
    },
    async close() {
      await pg.close();
    },
  };
}

/** A fresh, empty Postgres database (the schema is applied on first use, as in production). */
export function openPglite(): DB {
  return openPostgres(pgliteDriver(new PGlite()));
}
