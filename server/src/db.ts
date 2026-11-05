import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = DatabaseSync;

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS parents (
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
);

CREATE TABLE IF NOT EXISTS children (
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
);

CREATE TABLE IF NOT EXISTS progress (
  child_id     TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  lesson_id    TEXT NOT NULL,
  best_score   INTEGER NOT NULL,
  total        INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT NOT NULL,
  -- spaced repetition: when this lesson should come back for review
  review_due   TEXT NOT NULL,
  PRIMARY KEY (child_id, lesson_id)
);

-- quiz questions a child has answered correctly (server-side, so the tutor can't be tricked)
CREATE TABLE IF NOT EXISTS quiz_solved (
  child_id    TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  lesson_id   TEXT NOT NULL,
  q_index     INTEGER NOT NULL,
  solved_at   TEXT NOT NULL,
  PRIMARY KEY (child_id, lesson_id, q_index)
);

CREATE TABLE IF NOT EXISTS tutor_messages (
  id          TEXT PRIMARY KEY,
  child_id    TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  lesson_id   TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  flagged     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tutor_child_lesson ON tutor_messages(child_id, lesson_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  child_id    TEXT REFERENCES children(id) ON DELETE CASCADE,
  lesson_id   TEXT,
  message_id  TEXT,
  reason      TEXT NOT NULL,
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL
);
`;

export function openDb(path: string): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export const now = () => new Date().toISOString();
