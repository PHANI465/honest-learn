// The phone's database for standalone mode (task T8b): expo-sqlite behind the API's DbAdapter interface (server/src/db.ts).
//
// It takes anything shaped like expo-sqlite's SQLiteDatabase rather than importing expo-sqlite, so the server's contract test
// (server/test/db-contract.test.ts) can run this exact code in Node against a stand-in built on node:sqlite. device.ts passes
// the real database.
//
// expo-sqlite differences the adapter hides:
//  - getFirstAsync() gives null for "no row"; the API expects undefined.
//  - Foreign keys are off unless switched on per connection. The API relies on ON DELETE CASCADE (deleting a child or the account
//    must delete everything about them), so the adapter switches them on and refuses to start if that did not work.
//  - withExclusiveTransactionAsync() opens a second connection where the foreign key setting does not apply: never use it here.
import type { DbAdapter, Param } from "../../../server/src/db.ts";

/** The parts of expo-sqlite's SQLiteDatabase this adapter uses. */
export interface ExpoSqliteLike {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string, params: Param[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: Param[]): Promise<T[]>;
  runAsync(source: string, params: Param[]): Promise<{ changes: number }>;
  closeAsync(): Promise<void>;
}

export async function expoSqliteAdapter(db: ExpoSqliteLike): Promise<DbAdapter> {
  await db.execAsync("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  const fk = await db.getFirstAsync<{ foreign_keys: number }>("PRAGMA foreign_keys", []);
  if (Number(fk?.foreign_keys) !== 1) throw new Error("SQLite foreign keys could not be switched on; refusing to open the database");
  return {
    dialect: "sqlite",
    get: async (sql, params) => (await db.getFirstAsync<Record<string, unknown>>(sql, params)) ?? undefined,
    all: (sql, params) => db.getAllAsync<Record<string, unknown>>(sql, params),
    run: async (sql, params) => ({ changes: Number((await db.runAsync(sql, params)).changes) }),
    exec: (sql) => db.execAsync(sql),
    close: () => db.closeAsync(),
  };
}
