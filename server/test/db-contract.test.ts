// What every database adapter must do so the same SQL works everywhere (db.ts). Run against: SQLite through openDb,
// Postgres (PGlite), and a hand-written adapter through the public openWithAdapter(), the way the phone app's SQLite adapter
// (task T8b) will plug in. A new adapter is added to ADAPTERS below before anything uses it.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

process.env.DB_PATH = ":memory:";

import type { DB, DbAdapter, Param } from "../src/db.ts";
const { openDb, openWithAdapter } = await import("../src/db.ts");
const { openPglite } = await import("./pglite.ts");

/** The smallest possible adapter over node:sqlite, using only the public interface. */
function handMadeSqliteAdapter(): DbAdapter {
  const db = new DatabaseSync(":memory:");
  // An adapter's own duty: SQLite does not enforce foreign keys unless asked to, and the API relies on ON DELETE CASCADE.
  db.exec("PRAGMA foreign_keys = ON;");
  const args = (p: Param[]) => p as (string | number | null)[];
  return {
    dialect: "sqlite",
    async get(sql, params) {
      return db.prepare(sql).get(...args(params)) as Record<string, unknown> | undefined;
    },
    async all(sql, params) {
      return db.prepare(sql).all(...args(params)) as Record<string, unknown>[];
    },
    async run(sql, params) {
      return { changes: Number(db.prepare(sql).run(...args(params)).changes) };
    },
    async exec(sql) {
      db.exec(sql);
    },
    async close() {
      db.close();
    },
  };
}

const ADAPTERS: [string, () => DB][] = [
  ["SQLite (openDb)", () => openDb(":memory:")],
  ["Postgres (PGlite)", () => openPglite()],
  ["a hand-made adapter through openWithAdapter", () => openWithAdapter(handMadeSqliteAdapter())],
];

/** Rows as plain objects (node:sqlite returns objects with a null prototype). */
const plain = (r: unknown) => (r && typeof r === "object" ? { ...(r as object) } : r);
const plainAll = (rs: unknown[]) => rs.map(plain);

const TABLES = `CREATE TABLE IF NOT EXISTS contract_parent (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS contract_child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES contract_parent(id) ON DELETE CASCADE, n INTEGER, note TEXT);
`;

for (const [name, open] of ADAPTERS) {
  describe(`database contract: ${name}`, () => {
    test("the API's schema is there on first use, and counts come back as numbers", async () => {
      const db = open();
      const row = await db.get<{ n: unknown }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM parents");
      assert.deepEqual(plain(row), { n: 0 });
      assert.equal(typeof db.demo, "boolean");
      assert.ok(db.dialect === "sqlite" || db.dialect === "postgres");
      await db.close();
    });

    test("? placeholders, changes counts, missing rows, NULL and text round trips", async () => {
      const db = open();
      await db.exec(TABLES);
      assert.deepEqual(await db.run("INSERT INTO contract_parent (id, name) VALUES (?, ?)", ["p1", "Ana"]), { changes: 1 });
      await db.run("INSERT INTO contract_parent (id, name) VALUES (?, ?)", ["p2", null]);
      const text = "O'Brien says \"hi\" — ¿qué? 🦉 ?";
      await db.run("INSERT INTO contract_child (id, parent_id, n, note) VALUES (?, ?, ?, ?)", ["c1", "p1", 7, text]);
      await db.run("INSERT INTO contract_child (id, parent_id, n, note) VALUES (?, ?, ?, ?)", ["c2", "p1", 2147483647, null]);
      assert.deepEqual(plain(await db.get("SELECT name FROM contract_parent WHERE id = ?", ["p2"])), { name: null });
      assert.deepEqual(plain(await db.get("SELECT note, n FROM contract_child WHERE id = ?", ["c1"])), { note: text, n: 7 });
      assert.equal((await db.get<{ n: number }>("SELECT n FROM contract_child WHERE id = ?", ["c2"]))!.n, 2147483647);
      assert.equal(await db.get("SELECT * FROM contract_child WHERE id = ?", ["nobody"]), undefined);
      assert.deepEqual(plainAll(await db.all("SELECT * FROM contract_child WHERE parent_id = ?", ["p2"])), []);
      // a question mark inside a quoted string is not a placeholder
      assert.deepEqual(plain(await db.get("SELECT 'a?b' AS s, name FROM contract_parent WHERE id = ?", ["p1"])), { s: "a?b", name: "Ana" });
      // INTEGER is 32-bit on Postgres (it overflows past 2147483647; SQLite would not): the API keeps every INTEGER column
      // below that (counts, minutes, years, scores); timestamps are ISO text. Hence n - 1 here, not n + 1.
      assert.deepEqual(await db.run("UPDATE contract_child SET n = n - 1 WHERE parent_id = ?", ["p1"]), { changes: 2 });
      assert.deepEqual(await db.run("DELETE FROM contract_child WHERE id = ?", ["nobody"]), { changes: 0 });
      const all = await db.all<{ id: string }>("SELECT id FROM contract_child ORDER BY id");
      assert.deepEqual(all.map((r) => r.id), ["c1", "c2"]);
      await db.close();
    });

    test("ON CONFLICT DO NOTHING / DO UPDATE, RETURNING, and CAST(SUM) as a number", async () => {
      const db = open();
      await db.exec(TABLES);
      await db.run("INSERT INTO contract_parent (id, name) VALUES (?, ?)", ["p1", "Ana"]);
      assert.deepEqual(await db.run("INSERT INTO contract_parent (id, name) VALUES (?, ?) ON CONFLICT DO NOTHING", ["p1", "Other"]), { changes: 0 });
      await db.run("INSERT INTO contract_parent (id, name) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name", ["p1", "Bea"]);
      assert.deepEqual(plain(await db.get("SELECT name FROM contract_parent WHERE id = ?", ["p1"])), { name: "Bea" });
      await db.run("INSERT INTO contract_child (id, parent_id, n) VALUES (?, ?, ?)", ["c1", "p1", 3]);
      await db.run("INSERT INTO contract_child (id, parent_id, n) VALUES (?, ?, ?)", ["c2", "p1", 4]);
      assert.deepEqual(plain(await db.get("UPDATE contract_child SET n = n + 10 WHERE id = ? RETURNING n", ["c1"])), { n: 13 });
      const sum = await db.get<{ total: unknown }>("SELECT CAST(SUM(n) AS INTEGER) AS total FROM contract_child");
      assert.deepEqual(plain(sum), { total: 17 });
      await db.close();
    });

    test("foreign keys are enforced and ON DELETE CASCADE removes children", async () => {
      const db = open();
      await db.exec(TABLES);
      await db.run("INSERT INTO contract_parent (id) VALUES (?)", ["p1"]);
      await db.run("INSERT INTO contract_child (id, parent_id) VALUES (?, ?)", ["c1", "p1"]);
      await assert.rejects(db.run("INSERT INTO contract_child (id, parent_id) VALUES (?, ?)", ["c2", "missing"]), "a child of a missing parent is refused");
      await db.run("DELETE FROM contract_parent WHERE id = ?", ["p1"]);
      assert.deepEqual(plainAll(await db.all("SELECT * FROM contract_child")), []);
      await db.close();
    });

    test("the API's own cascade: deleting a parent deletes the children's rows", async () => {
      const db = open();
      await db.run(
        "INSERT INTO parents (id, email, password_hash, pin_hash, consent_version, created_at, consent_at) VALUES (?,?,?,?,?,?,?)",
        ["p1", "a@example.com", "x", "y", "v1", "2026-01-01", "2026-01-01"],
      );
      await db.run("INSERT INTO children (id, parent_id, nickname, birth_year, created_at) VALUES (?,?,?,?,?)", ["c1", "p1", "Sam", 2016, "2026-01-01"]);
      await db.run("DELETE FROM parents WHERE id = ?", ["p1"]);
      assert.deepEqual(plainAll(await db.all("SELECT * FROM children")), []);
      await db.close();
    });
  });
}
