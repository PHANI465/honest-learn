// Telling a child when Hoot is not the safety-tested helper. The server says which helper answers (never a model name, address or key);
// the chat screen shows the notice written in app/src/lib/hoot-notice.ts (pure, so it is tested here).
import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";
process.env.SHOW_DRAFTS = "true";

const { config } = await import("../src/config.ts");
const { openDb } = await import("../src/db.ts");
const usePg = process.env.TEST_DB === "pglite";
const { openPglite } = usePg ? await import("./pglite.ts") : { openPglite: null };
const { MemoryMailer } = await import("../src/mailer.ts");
const { loadContent } = await import("../src/content.ts");
const { createApp, CONSENT_VERSION } = await import("../src/app.ts");
const { MockTutor } = await import("../src/tutor.ts");
const { helperFor } = await import("../src/ai-settings.ts");
const { helperNotice } = await import("../../app/src/lib/hoot-notice.ts");

const content = loadContent(config.contentDir);
const LESSON = "b3-math-comparing-fractions";
const YEAR = new Date().getFullYear();
const SECRET_MODEL = "secret-model-name-7";
const SECRET_URL = "https://models.internal.example/v1";

function server() {
  const db = (openPglite ? openPglite() : openDb(":memory:")) as ReturnType<typeof openDb>;
  const app = createApp({ db, content, tutor: new MockTutor(), mailer: new MemoryMailer() });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : {}) as any, text };
  };
  async function family() {
    const s = await call("POST", "/auth/signup", { email: `s${Math.random()}@example.com`, password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION });
    const fam = s.json.familyToken as string;
    const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
    const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: YEAR - 9 }, par)).json.child.id as string;
    const parentId = (await db.get<{ parent_id: string }>("SELECT parent_id FROM children WHERE id = ?", [kid]))!.parent_id;
    const helper = async () => (await call("GET", `/children/${kid}/tutor/${LESSON}`, undefined, fam)).json.helper;
    /** The parent connects their own model (a row is enough: the child's screen only needs to know that there is one). */
    const connect = () => db.run("INSERT INTO ai_settings (parent_id, provider, base_url, model, updated_at) VALUES (?,?,?,?,?)", [parentId, "custom", SECRET_URL, SECRET_MODEL, new Date().toISOString()]);
    return { fam, par, kid, helper, connect };
  }
  return { call, family };
}

describe("which helper answers", () => {
  test("the project's own helper is the safety-tested one", async () => {
    const s = server();
    const f = await s.family();
    assert.deepEqual(await f.helper(), { source: "default", safetyTested: true });
    assert.deepEqual(helperFor(false), { source: "default", safetyTested: true });
  });

  test("a model the parent connected is not safety tested, for that family only", async () => {
    const s = server();
    const mine = await s.family();
    const other = await s.family();
    await mine.connect();
    assert.deepEqual(await mine.helper(), { source: "family", safetyTested: false });
    assert.deepEqual(await other.helper(), { source: "default", safetyTested: true }, "another family is not affected");
  });

  test("a model chosen by whoever runs the server is not safety tested either", async () => {
    const s = server();
    const f = await s.family();
    const was = config.tutor.mode;
    config.tutor.mode = "openai";
    try {
      assert.deepEqual(await f.helper(), { source: "server", safetyTested: false });
      await f.connect();
      assert.deepEqual(await f.helper(), { source: "family", safetyTested: false }, "the family's own model comes first");
    } finally {
      config.tutor.mode = was;
    }
  });

  test("a child is never told a model name, an address, a provider or a key", async () => {
    const s = server();
    const f = await s.family();
    await f.connect();
    const r = await s.call("GET", `/children/${f.kid}/tutor/${LESSON}`, undefined, f.fam);
    assert.equal(r.status, 200);
    for (const secret of [SECRET_MODEL, SECRET_URL, "models.internal", "custom"]) assert.ok(!r.text.includes(secret), `"${secret}" is in the child's response`);
    assert.deepEqual(Object.keys(r.json.helper).sort(), ["safetyTested", "source"]);
  });

  test("it still needs a child's sign-in and a lesson the child may open", async () => {
    const s = server();
    const f = await s.family();
    assert.equal((await s.call("GET", `/children/${f.kid}/tutor/${LESSON}`)).status, 401);
    assert.equal((await s.call("GET", `/children/${f.kid}/tutor/no-such-lesson`, undefined, f.fam)).status, 404);
  });
});

describe("what the child is told", () => {
  test("nothing for the safety-tested helper", () => {
    assert.equal(helperNotice({ source: "default", safetyTested: true }), null);
  });
  test("for a family's own model, that a grown-up set it up and Honest Learn has not tested it", () => {
    const n = helperNotice({ source: "family", safetyTested: false })!;
    assert.match(n, /helper your grown-up set up/);
    assert.match(n, /has not tested it/);
    assert.match(n, /tell a grown-up/);
  });
  test("for a server's own model, the same warning without claiming a grown-up chose it", () => {
    const n = helperNotice({ source: "server", safetyTested: false })!;
    assert.match(n, /different helper/);
    assert.match(n, /has not tested it/);
    assert.doesNotMatch(n, /your grown-up set up/);
  });
  test("it is plain: no model names, no jargon, short", () => {
    for (const source of ["family", "server"] as const) {
      const n = helperNotice({ source, safetyTested: false })!;
      assert.ok(n.length < 220, `${n.length} characters`);
      assert.doesNotMatch(n, /\b(AI|LLM|model|API|server|token)\b/i);
    }
  });
  test("when the server says anything unexpected, the child is warned rather than reassured", () => {
    for (const x of [{ source: "family", safetyTested: true }, { source: "default", safetyTested: false }, { source: "other", safetyTested: false }, { safetyTested: false }, { source: "family" }]) {
      assert.ok(helperNotice(x), JSON.stringify(x));
    }
  });
  test("and when it says nothing at all (an older server), nothing is shown", () => {
    for (const x of [null, undefined, "x", 5]) assert.equal(helperNotice(x), null);
  });
});
