import { neon } from "@neondatabase/serverless";
import type { PgDriver } from "./db.ts";

/**
 * Neon Postgres over HTTPS (one request per query, no sockets to keep alive), which suits
 * serverless functions such as Vercel's. Works with the pooled or the direct connection string.
 */
export function neonDriver(connectionString: string): PgDriver {
  const sql = neon(connectionString, { fullResults: true });
  return {
    async query(text, params) {
      const r = await sql.query(text, params);
      return { rows: r.rows as Record<string, unknown>[], rowCount: r.rowCount ?? 0 };
    },
    async batch(statements) {
      await sql.transaction(statements.map((s) => sql.query(s)));
    },
    async close() {},
  };
}
