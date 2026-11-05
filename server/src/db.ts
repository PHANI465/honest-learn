import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------- interface
//
// One async interface over two databases:
//   - SQLite (node:sqlite) for local development, tests and single-server hosting;
//   - Postgres (Neon on Vercel; PGlite in tests).
// SQL is written once with `?` placeholders; the Postgres adapter turns them into $1..$n.
// Keep queries portable: no INSERT OR IGNORE (use ON CONFLICT DO NOTHING), no rowid,
// quote camelCase aliases ("lastActive"), and CAST(COUNT/SUM AS INTEGER) so both return numbers.

export type Param = string | number | null;
export type Dialect = "sqlite" | "postgres";

export interface DB {
  readonly dialect: Dialect;
  /** True when data lives only in this server's memory (Vercel without a database): it may reset at any time. */
  readonly demo: boolean;
  get<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T[]>;
  run(sql: string, params?: Param[]): Promise<{ changes: number }>;
  /** One or more statements without parameters (Postgres: run in one transaction). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** What a database adapter provides before the schema is applied. */
interface Adapter {
  dialect: Dialect;
  get(sql: string, params: Param[]): Promise<Record<string, unknown> | undefined>;
  all(sql: string, params: Param[]): Promise<Record<string, unknown>[]>;
  run(sql: string, params: Param[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------- schema
// The v0.1 tables. Plain TEXT/INTEGER columns work the same on SQLite and Postgres.
// Columns added later go in MIGRATIONS, so older databases are upgraded in place.

const TABLES = [
  `CREATE TABLE IF NOT EXISTS parents (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  password_hash      TEXT NOT NULL,
  pin_hash           TEXT NOT NULL,
  consent_version    TEXT NOT NULL,
  consent_at         TEXT NOT NULL,
  pin_failed         INTEGER NOT NULL DEFAULT 0,
  pin_locked_until   TEXT,
  login_failed       INTEGER NOT NULL DEFAULT 0,
  login_locked_until TEXT,
  created_at         TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS children (
  id               TEXT PRIMARY KEY,
  parent_id        TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  nickname         TEXT NOT NULL,
  birth_year       INTEGER NOT NULL,
  avatar           TEXT NOT NULL DEFAULT 'owl',
  band_override    TEXT,
  unlocked_topics  TEXT NOT NULL DEFAULT '[]',
  ai_enabled       INTEGER NOT NULL DEFAULT 1,
  daily_minutes    INTEGER NOT NULL DEFAULT 30,
  created_at       TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS progress (
  child_id     TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  lesson_id    TEXT NOT NULL,
  best_score   INTEGER NOT NULL,
  total        INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT NOT NULL,
  -- spaced repetition: when this lesson should come back for review
  review_due   TEXT NOT NULL,
  PRIMARY KEY (child_id, lesson_id)
)`,
  // quiz questions a child has answered correctly (server-side, so the tutor can't be tricked)
  `CREATE TABLE IF NOT EXISTS quiz_solved (
  child_id    TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  lesson_id   TEXT NOT NULL,
  q_index     INTEGER NOT NULL,
  solved_at   TEXT NOT NULL,
  PRIMARY KEY (child_id, lesson_id, q_index)
)`,
  // the highest hint level a child has opened per question, so answers are only revealed after real hints
  `CREATE TABLE IF NOT EXISTS hints_seen (
  child_id    TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  q_index     INTEGER NOT NULL,
  level       INTEGER NOT NULL,
  PRIMARY KEY (child_id, item_id, q_index)
)`,
  `CREATE TABLE IF NOT EXISTS tutor_messages (
  id          TEXT PRIMARY KEY,
  child_id    TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  lesson_id   TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  flagged     TEXT,
  created_at  TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_tutor_child_lesson ON tutor_messages(child_id, lesson_id, created_at)`,
  // Postgres doesn't index foreign keys by itself; these are looked up on almost every request.
  `CREATE INDEX IF NOT EXISTS idx_children_parent ON children(parent_id)`,
  // one-time codes for email verification and password reset (hashed, short-lived)
  `CREATE TABLE IF NOT EXISTS auth_codes (
  parent_id   TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  sent_at     TEXT NOT NULL,
  PRIMARY KEY (parent_id, purpose)
)`,
  // daily learning minutes per child (the child's local date), so limits work across devices
  `CREATE TABLE IF NOT EXISTS usage (
  child_id    TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  minutes     INTEGER NOT NULL DEFAULT 0,
  bonus       INTEGER NOT NULL DEFAULT 0,
  last_tick   TEXT,
  PRIMARY KEY (child_id, day)
)`,
  `CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  child_id    TEXT REFERENCES children(id) ON DELETE CASCADE,
  lesson_id   TEXT,
  message_id  TEXT,
  reason      TEXT NOT NULL,
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_reports_parent ON reports(parent_id)`,
];

/** Columns added after v0.1.0. Applied on start-up when the column is missing. */
const MIGRATIONS: { table: string; column: string; sqlite: string[]; postgres: string[] }[] = [
  {
    // ISO 3166-1 alpha-2 country, optional: lets Hoot name the right helpline in a safety reply.
    table: "parents",
    column: "country",
    sqlite: ["ALTER TABLE parents ADD COLUMN country TEXT"],
    postgres: ["ALTER TABLE parents ADD COLUMN IF NOT EXISTS country TEXT"],
  },
  {
    table: "parents",
    column: "email_verified_at",
    sqlite: ["ALTER TABLE parents ADD COLUMN email_verified_at TEXT"],
    postgres: ["ALTER TABLE parents ADD COLUMN IF NOT EXISTS email_verified_at TEXT"],
  },
  {
    // Insertion order for Hoot chats (messages written in the same millisecond keep their order).
    table: "tutor_messages",
    column: "seq",
    sqlite: [
      "ALTER TABLE tutor_messages ADD COLUMN seq INTEGER",
      // existing rows keep the order they were written in
      "UPDATE tutor_messages SET seq = rowid WHERE seq IS NULL",
    ],
    postgres: ["ALTER TABLE tutor_messages ADD COLUMN IF NOT EXISTS seq BIGSERIAL"],
  },
  {
    // Session version: raising it signs out every device (password reset, "sign out everywhere").
    table: "parents",
    column: "token_version",
    sqlite: ["ALTER TABLE parents ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"],
    postgres: ["ALTER TABLE parents ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0"],
  },
];

/** SQLite has no sequences outside INTEGER PRIMARY KEY, so a trigger numbers new chat messages. */
const SQLITE_AFTER = `
CREATE INDEX IF NOT EXISTS idx_tutor_seq ON tutor_messages(seq);
CREATE TRIGGER IF NOT EXISTS tutor_messages_seq AFTER INSERT ON tutor_messages WHEN NEW.seq IS NULL
BEGIN
  UPDATE tutor_messages SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM tutor_messages) WHERE id = NEW.id;
END;
`;

/** Serialises schema set-up when several cold starts hit a fresh Postgres database at once. */
const PG_LOCK = "SELECT pg_advisory_xact_lock(4820735)";

async function migrate(a: Adapter): Promise<void> {
  if (a.dialect === "sqlite") {
    await a.exec(TABLES.join(";\n") + ";");
  } else {
    await a.exec([PG_LOCK, ...TABLES].join(";\n") + ";");
  }
  for (const m of MIGRATIONS) {
    const cols =
      a.dialect === "sqlite"
        ? ((await a.all(`PRAGMA table_info(${m.table})`, [])) as { name: string }[])
        : ((await a.all(
            "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?",
            [m.table],
          )) as { name: string }[]);
    if (cols.some((c) => c.name === m.column)) continue;
    const ddl = a.dialect === "sqlite" ? m.sqlite : [PG_LOCK, ...m.postgres];
    await a.exec(ddl.join(";\n") + ";");
  }
  if (a.dialect === "sqlite") await a.exec(SQLITE_AFTER);
}

/** Wraps an adapter so the schema is created once (memoised) before the first query. */
function withSchema(a: Adapter, demo: boolean): DB {
  let ready: Promise<void> | null = null;
  const init = () => {
    ready ??= migrate(a).catch((e) => {
      ready = null; // let the next request try again (e.g. a database that was still waking up)
      throw e;
    });
    return ready;
  };
  return {
    dialect: a.dialect,
    demo,
    async get<T>(sql: string, params: Param[] = []) {
      await init();
      return (await a.get(sql, params)) as T | undefined;
    },
    async all<T>(sql: string, params: Param[] = []) {
      await init();
      return (await a.all(sql, params)) as T[];
    },
    async run(sql: string, params: Param[] = []) {
      await init();
      return a.run(sql, params);
    },
    async exec(sql: string) {
      await init();
      return a.exec(sql);
    },
    close: () => a.close(),
  };
}

// ---------------------------------------------------------------- SQLite

/** SQLite file (or ":memory:"). The schema is applied on first use. */
export function openDb(path: string, opts: { demo?: boolean } = {}): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  const stmts = new Map<string, ReturnType<DatabaseSync["prepare"]>>();
  const prep = (sql: string) => {
    let s = stmts.get(sql);
    if (!s) stmts.set(sql, (s = db.prepare(sql)));
    return s;
  };
  const args = (params: Param[]) => params as SQLInputValue[];
  return withSchema(
    {
      dialect: "sqlite",
      async get(sql, params) {
        return prep(sql).get(...args(params)) as Record<string, unknown> | undefined;
      },
      async all(sql, params) {
        return prep(sql).all(...args(params)) as Record<string, unknown>[];
      },
      async run(sql, params) {
        return { changes: Number(prep(sql).run(...args(params)).changes) };
      },
      async exec(sql) {
        db.exec(sql);
      },
      async close() {
        db.close();
      },
    },
    !!opts.demo,
  );
}

// ---------------------------------------------------------------- Postgres

/** The few things the Postgres adapter needs from a driver (Neon over HTTP in production, PGlite in tests). */
export interface PgDriver {
  query(text: string, params: Param[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  /** Runs the statements in order inside one transaction. */
  batch(statements: string[]): Promise<void>;
  close(): Promise<void>;
}

/** `?` placeholders → `$1..$n`, leaving quoted strings and identifiers alone. */
export function toPgPlaceholders(sql: string): string {
  let out = "";
  let n = 0;
  let quote: string | null = null;
  for (const ch of sql) {
    if (quote) {
      if (ch === quote) quote = null;
      out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === "?") {
      out += `$${++n}`;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Splits our own DDL on statement-ending semicolons (no semicolons inside strings). */
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function openPostgres(driver: PgDriver): DB {
  const converted = new Map<string, string>();
  const pg = (sql: string) => {
    let s = converted.get(sql);
    if (s === undefined) converted.set(sql, (s = toPgPlaceholders(sql)));
    return s;
  };
  return withSchema(
    {
      dialect: "postgres",
      async get(sql, params) {
        return (await driver.query(pg(sql), params)).rows[0];
      },
      async all(sql, params) {
        return (await driver.query(pg(sql), params)).rows;
      },
      async run(sql, params) {
        return { changes: (await driver.query(pg(sql), params)).rowCount };
      },
      async exec(sql) {
        await driver.batch(splitStatements(sql));
      },
      close: () => driver.close(),
    },
    false,
  );
}

// ---------------------------------------------------------------- retention

/**
 * Data retention: deletes Hoot chats older than `chatDays`, resolved reports older than a year,
 * usage rows older than 90 days and expired one-time codes. Returns how many rows were removed.
 */
export async function purgeOld(db: DB, chatDays: number, nowMs = Date.now()): Promise<number> {
  const ago = (days: number) => new Date(nowMs - days * 86_400_000).toISOString();
  let n = 0;
  n += (await db.run("DELETE FROM tutor_messages WHERE created_at < ?", [ago(chatDays)])).changes;
  n += (await db.run("DELETE FROM reports WHERE status != 'open' AND created_at < ?", [ago(365)])).changes;
  n += (await db.run("DELETE FROM usage WHERE day < ?", [ago(90).slice(0, 10)])).changes;
  n += (await db.run("DELETE FROM auth_codes WHERE expires_at < ?", [new Date(nowMs).toISOString()])).changes;
  return n;
}

export const now = () => new Date().toISOString();
