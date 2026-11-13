// Escalating lockouts and the shared (database-backed) per-IP rate limit.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";
process.env.SHOW_DRAFTS = "true";

const { config } = await import("../src/config.ts");
const { openDb, purgeOld } = await import("../src/db.ts");
const usePg = process.env.TEST_DB === "pglite";
const { openPglite } = usePg ? await import("./pglite.ts") : { openPglite: null };
const { MemoryMailer } = await import("../src/mailer.ts");
const { loadContent } = await import("../src/content.ts");
const { createApp, CONSENT_VERSION } = await import("../src/app.ts");
const { MockTutor } = await import("../src/tutor.ts");
const { WikiClient } = await import("../src/wiki.ts");

// The lockout tests make many sign-in attempts from one address; the per-IP limit has its own tests below.
config.security.authRateLimit = 100_000;

const content = loadContent(config.contentDir);
type DbT = ReturnType<typeof openDb>;

function appOver(db: DbT) {
  const app = createApp({ db, content, tutor: new MockTutor(), wiki: new WikiClient(async () => new Response("{}", { status: 404 })), mailer: new MemoryMailer() });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any, headers: res.headers };
  };
  return { app, call };
}

function makeApp() {
  const db = openPglite ? openPglite() : openDb(":memory:");
  return { db, ...appOver(db) };
}

const signup = { email: "parent@example.com", password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION };
const MIN = 60_000;

/** Lets the current lock run out without waiting. */
const expireLock = (db: DbT, col: "pin_locked_until" | "login_locked_until") =>
  db.run(`UPDATE parents SET ${col} = ?`, [new Date(Date.now() - 1000).toISOString()]);

/** Minutes until the lock end the API reported. */
const lockMinutes = (retryAt: string) => Math.round((Date.parse(retryAt) - Date.now()) / MIN);

describe("escalating lockouts", () => {
  test("wrong PINs lock for 15 min, then 1 h, 6 h, 24 h and stay at 24 h", async () => {
    const { db, call } = makeApp();
    const fam = (await call("POST", "/auth/signup", signup)).json.familyToken;
    const expected = [15, 60, 360, 1440, 1440];
    for (const minutes of expected) {
      let last: any;
      for (let i = 0; i < config.security.pinMaxAttempts; i++) last = await call("POST", "/auth/parent-unlock", { pin: "0000" }, fam);
      assert.equal(last.status, 401);
      assert.equal(last.json.attemptsLeft, 0);
      assert.equal(lockMinutes(last.json.retryAt), minutes);
      // the right PIN is refused while locked
      assert.equal((await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).status, 429);
      await expireLock(db, "pin_locked_until");
    }
  });

  test("wrong passwords lock for 15 min, then 1 h, 6 h, 24 h", async () => {
    const { db, call } = makeApp();
    await call("POST", "/auth/signup", signup);
    for (const minutes of [15, 60, 360, 1440]) {
      let last: any;
      for (let i = 0; i < config.security.loginMaxAttempts; i++) {
        last = await call("POST", "/auth/login", { email: signup.email, password: "nope" });
      }
      assert.equal(last.status, 401, "the last allowed try is still just a wrong password");
      const locked = await call("POST", "/auth/login", { email: signup.email, password: "nope" });
      assert.equal(locked.status, 429);
      assert.equal(lockMinutes(locked.json.retryAt), minutes);
      assert.equal((await call("POST", "/auth/login", { email: signup.email, password: signup.password })).status, 429, "right password refused while locked");
      await expireLock(db, "login_locked_until");
    }
  });

  test("a correct PIN resets the escalation back to 15 minutes", async () => {
    const { db, call } = makeApp();
    const fam = (await call("POST", "/auth/signup", signup)).json.familyToken;
    const lockOut = async () => {
      let last: any;
      for (let i = 0; i < config.security.pinMaxAttempts; i++) last = await call("POST", "/auth/parent-unlock", { pin: "0000" }, fam);
      return lockMinutes(last.json.retryAt);
    };
    assert.equal(await lockOut(), 15);
    await expireLock(db, "pin_locked_until");
    assert.equal(await lockOut(), 60);
    await expireLock(db, "pin_locked_until");
    assert.equal((await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).status, 200);
    const row = await db.get<{ pin_lock_level: number }>("SELECT pin_lock_level FROM parents");
    assert.equal(Number(row!.pin_lock_level), 0);
    assert.equal(await lockOut(), 15, "back to the first step");
  });

  test("a correct password resets the escalation; PIN and password levels are independent", async () => {
    const { db, call } = makeApp();
    const fam = (await call("POST", "/auth/signup", signup)).json.familyToken;
    const badLogins = async () => {
      let last: any;
      for (let i = 0; i <= config.security.loginMaxAttempts; i++) last = await call("POST", "/auth/login", { email: signup.email, password: "nope" });
      return lockMinutes(last.json.retryAt);
    };
    assert.equal(await badLogins(), 15);
    await expireLock(db, "login_locked_until");
    assert.equal(await badLogins(), 60);
    // the PIN side has not escalated
    let pin: any;
    for (let i = 0; i < config.security.pinMaxAttempts; i++) pin = await call("POST", "/auth/parent-unlock", { pin: "0000" }, fam);
    assert.equal(lockMinutes(pin.json.retryAt), 15);
    await expireLock(db, "login_locked_until");
    assert.equal((await call("POST", "/auth/login", { email: signup.email, password: signup.password })).status, 200);
    assert.equal(await badLogins(), 15, "a successful sign-in reset the password escalation");
  });

  test("resetting the PIN with the password also clears the PIN escalation", async () => {
    const { db, call } = makeApp();
    const fam = (await call("POST", "/auth/signup", signup)).json.familyToken;
    for (let i = 0; i < config.security.pinMaxAttempts; i++) await call("POST", "/auth/parent-unlock", { pin: "0000" }, fam);
    assert.equal((await call("POST", "/auth/reset-pin", { password: signup.password, newPin: "1357" }, fam)).status, 200);
    const row = await db.get<{ pin_lock_level: number; pin_locked_until: string | null }>("SELECT pin_lock_level, pin_locked_until FROM parents");
    assert.equal(Number(row!.pin_lock_level), 0);
    assert.equal(row!.pin_locked_until, null);
    assert.equal((await call("POST", "/auth/parent-unlock", { pin: "1357" }, fam)).status, 200);
  });

  test("existing databases are upgraded: the new columns are added to an old parents table", async () => {
    if (usePg) return; // the Postgres path uses the same MIGRATIONS list with IF NOT EXISTS
    const { DatabaseSync } = await import("node:sqlite");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "hl-mig-"));
    const path = join(dir, "old.db");
    try {
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE parents (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, pin_hash TEXT NOT NULL,
        consent_version TEXT NOT NULL, consent_at TEXT NOT NULL, pin_failed INTEGER NOT NULL DEFAULT 0, pin_locked_until TEXT,
        login_failed INTEGER NOT NULL DEFAULT 0, login_locked_until TEXT, created_at TEXT NOT NULL)`);
      old.exec("INSERT INTO parents (id,email,password_hash,pin_hash,consent_version,consent_at,created_at) VALUES ('p','a@b.c','h','h','v','t','t')");
      old.close();
      const db = openDb(path);
      const row = await db.get<{ pin_lock_level: number; login_lock_level: number }>("SELECT pin_lock_level, login_lock_level FROM parents");
      assert.deepEqual([Number(row!.pin_lock_level), Number(row!.login_lock_level)], [0, 0]);
      assert.equal(await db.get("SELECT * FROM rate_limits"), undefined, "the rate_limits table exists (empty)");
      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("shared per-IP rate limit", () => {
  test("two app instances over the same database share one count", async () => {
    const before = config.security.authRateLimit;
    config.security.authRateLimit = 4;
    // (restored in finally)
    try {
      const db = openPglite ? openPglite() : openDb(":memory:");
      const a = appOver(db);
      const b = appOver(db);
      const bad = { email: "x@example.com", password: "x" };
      assert.equal((await a.call("POST", "/auth/login", bad)).status, 401);
      assert.equal((await b.call("POST", "/auth/login", bad)).status, 401);
      assert.equal((await a.call("POST", "/auth/login", bad)).status, 401);
      assert.equal((await b.call("POST", "/auth/login", bad)).status, 401);
      // 4 requests used up the limit between the two instances
      const ra = await a.call("POST", "/auth/login", bad);
      assert.equal(ra.status, 429);
      assert.equal(ra.json.error, "too_many_attempts");
      assert.ok(Number(ra.headers.get("retry-after")) > 0);
      assert.equal((await b.call("POST", "/auth/login", bad)).status, 429);
    } finally {
      config.security.authRateLimit = before;
    }
  });

  test("the limit is per IP and the window resets after authRateWindowMinutes", async () => {
    const before = config.security.authRateLimit;
    config.security.authRateLimit = 2;
    try {
      const { db, call } = makeApp();
      const bad = { email: "x@example.com", password: "x" };
      for (let i = 0; i < 2; i++) assert.equal((await call("POST", "/auth/login", bad)).status, 401);
      assert.equal((await call("POST", "/auth/login", bad)).status, 429);
      // another address has its own counter
      await db.run("INSERT INTO rate_limits (key, window_start, count) VALUES (?,?,?)", ["auth:203.0.113.9", new Date().toISOString(), 1]);
      const rows = await db.all<{ key: string; count: number }>("SELECT key, count FROM rate_limits ORDER BY key");
      assert.equal(rows.length, 2);
      // age the window: the next request starts a new one
      const old = new Date(Date.now() - (config.security.authRateWindowMinutes * MIN + 1000)).toISOString();
      await db.run("UPDATE rate_limits SET window_start = ? WHERE key = 'auth:unknown'", [old]);
      assert.equal((await call("POST", "/auth/login", bad)).status, 401, "new window");
      const row = await db.get<{ count: number }>("SELECT count FROM rate_limits WHERE key = 'auth:unknown'");
      assert.equal(Number(row!.count), 1);
    } finally {
      config.security.authRateLimit = before;
    }
  });

  test("parallel requests cannot exceed the limit", async () => {
    const before = config.security.authRateLimit;
    config.security.authRateLimit = 5;
    try {
      const { call } = makeApp();
      const results = await Promise.all(
        Array.from({ length: 12 }, () => call("POST", "/auth/login", { email: "x@example.com", password: "x" })),
      );
      assert.equal(results.filter((r) => r.status === 401).length, 5);
      assert.equal(results.filter((r) => r.status === 429).length, 7);
    } finally {
      config.security.authRateLimit = before;
    }
  });

  test("purgeOld removes expired rate-limit rows and keeps current ones", async () => {
    const { db } = makeApp();
    await db.run("INSERT INTO rate_limits (key, window_start, count) VALUES (?,?,?)", ["auth:old", new Date(Date.now() - 2 * 86_400_000).toISOString(), 3]);
    await db.run("INSERT INTO rate_limits (key, window_start, count) VALUES (?,?,?)", ["auth:new", new Date().toISOString(), 3]);
    assert.equal(await purgeOld(db, 365), 1);
    const rows = await db.all<{ key: string }>("SELECT key FROM rate_limits");
    assert.deepEqual(rows.map((r) => r.key), ["auth:new"]);
  });
});
