// The scheduled retention job (GET /api/cron/retention) is protected by CRON_SECRET and really purges old data.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";

const { openDb } = await import("../src/db.ts");
const { createCronRoutes } = await import("../src/cron.ts");
const { Hono } = await import("hono");

const SECRET = "test-cron-secret-0123456789";
const day = 86_400_000;

async function setup(opts: { secret?: string; requireSecret?: boolean } = {}) {
  const db = openDb(":memory:");
  const nowIso = new Date().toISOString();
  await db.run("INSERT INTO parents (id, email, password_hash, pin_hash, consent_version, consent_at, created_at) VALUES (?,?,?,?,?,?,?)", [
    "p1", "p@example.com", "x", "x", "v1", nowIso, nowIso,
  ]);
  await db.run("INSERT INTO children (id, parent_id, nickname, birth_year, created_at) VALUES (?,?,?,?,?)", ["c1", "p1", "Ada", 2016, nowIso]);
  const msg = (id: string, createdAt: string) =>
    db.run("INSERT INTO tutor_messages (id, child_id, lesson_id, role, content, created_at) VALUES (?,?,?,?,?,?)", [id, "c1", "l1", "user", "hi", createdAt]);
  await msg("old", new Date(Date.now() - 400 * day).toISOString());
  await msg("new", nowIso);
  // mounted under /api like in src/vercel.ts
  const app = new Hono().basePath("/api");
  app.route("/", createCronRoutes(db, { chatRetentionDays: 365, ...opts }));
  const call = async (headers: Record<string, string> = {}) => {
    const res = await app.request("/api/cron/retention", { headers });
    return { status: res.status, json: (await res.json()) as any };
  };
  const chatIds = async () => (await db.all<{ id: string }>("SELECT id FROM tutor_messages ORDER BY id")).map((r) => r.id);
  return { call, chatIds };
}

describe("GET /api/cron/retention", () => {
  test("rejects a missing or wrong secret and deletes nothing", async () => {
    const { call, chatIds } = await setup({ secret: SECRET, requireSecret: true });
    assert.equal((await call()).status, 401);
    assert.equal((await call({ authorization: "Bearer wrong-secret" })).status, 401);
    assert.equal((await call({ authorization: SECRET })).status, 401, "needs the Bearer prefix");
    assert.equal((await call({ authorization: "Bearer " })).status, 401);
    assert.deepEqual(await chatIds(), ["new", "old"]);
  });

  test("with the right secret it removes old chats and reports how many rows", async () => {
    const { call, chatIds } = await setup({ secret: SECRET, requireSecret: true });
    const res = await call({ authorization: `Bearer ${SECRET}` });
    assert.equal(res.status, 200);
    assert.equal(res.json.removed, 1);
    assert.deepEqual(await chatIds(), ["new"], "only the chat older than the retention period is gone");
    assert.equal((await call({ authorization: `Bearer ${SECRET}` })).json.removed, 0, "running again is harmless");
  });

  test("without CRON_SECRET it refuses on Vercel but runs in local development", async () => {
    const prod = await setup({ secret: "", requireSecret: true });
    assert.equal((await prod.call()).status, 401);
    assert.equal((await prod.call({ authorization: "Bearer " })).status, 401);
    assert.deepEqual(await prod.chatIds(), ["new", "old"]);

    const local = await setup({ secret: "", requireSecret: false });
    const res = await local.call();
    assert.equal(res.status, 200);
    assert.equal(res.json.removed, 1);
  });
});
