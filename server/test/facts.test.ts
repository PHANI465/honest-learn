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
const { loadContent, FactSet } = await import("../src/content.ts");
const { createApp, CONSENT_VERSION } = await import("../src/app.ts");
const { MockTutor } = await import("../src/tutor.ts");

const content = loadContent(config.contentDir);

// A small known set for b3 so the tests do not depend on the real facts.
const mk = (n: number, extra: object = {}) => ({
  id: `b3-t${n}`,
  subject: "science",
  text: `Test fact number ${n} is here.`,
  source: { title: `Wikipedia: Test ${n}`, url: `https://en.wikipedia.org/wiki/Test_${n}` },
  ...extra,
});
content.facts.set("b3", { band: "b3", status: "draft", facts: [mk(1), mk(2), mk(3), mk(4, { sensitive: "religion" })] });

async function setup(birthYearOffset = 10) {
  const db = openPglite ? openPglite() : openDb(":memory:");
  const app = createApp({ db, content, tutor: new MockTutor(), mailer: new MemoryMailer() });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  const s = await call("POST", "/auth/signup", { email: `f${Math.random()}@example.com`, password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION });
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: new Date().getFullYear() - birthYearOffset }, par)).json.child.id as string;
  return { call, fam, par, kid };
}

describe("quick facts", () => {
  test("the schema rejects a fact with no source, or a source that is not https", () => {
    const base = { band: "b3", status: "draft" };
    assert.equal(FactSet.safeParse({ ...base, facts: [{ id: "b3-x", subject: "science", text: "A fact with no source at all." }] }).success, false);
    assert.equal(FactSet.safeParse({ ...base, facts: [{ id: "b3-x", subject: "science", text: "A fact with a plain http source.", source: { title: "x", url: "http://example.com" } }] }).success, false);
    assert.equal(FactSet.safeParse({ ...base, facts: [mk(9)] }).success, true);
  });

  test("a child gets facts for their own age group, with only the fields the app needs", async () => {
    const { call, fam, kid } = await setup(10); // age 10 is band b3
    const r = await call("GET", `/children/${kid}/facts?count=2`, undefined, fam);
    assert.equal(r.status, 200);
    assert.equal(r.json.facts.length, 2);
    for (const f of r.json.facts) {
      assert.deepEqual(Object.keys(f).sort(), ["id", "sensitive", "source", "subject", "text"]);
      assert.equal(f.sensitive, null);
      assert.ok(f.id.startsWith("b3-"));
      assert.ok(f.source.url.startsWith("https://"));
    }
  });

  test("count is limited to 1 to 5", async () => {
    const { call, fam, kid } = await setup();
    assert.equal((await call("GET", `/children/${kid}/facts?count=0`, undefined, fam)).status, 400);
    assert.equal((await call("GET", `/children/${kid}/facts?count=6`, undefined, fam)).status, 400);
    assert.equal((await call("GET", `/children/${kid}/facts`, undefined, fam)).json.facts.length, 1);
  });

  test("facts tied to a sensitive topic stay hidden until a parent unlocks it", async () => {
    const { call, fam, par, kid } = await setup();
    const ids = async () => new Set((await call("GET", `/children/${kid}/facts?count=5`, undefined, fam)).json.facts.map((f: any) => f.id));
    for (let i = 0; i < 5; i++) assert.equal((await ids()).has("b3-t4"), false);
    await call("PATCH", `/parent/children/${kid}`, { unlockedTopics: ["religion"] }, par);
    let seenSensitive = false;
    for (let i = 0; i < 10 && !seenSensitive; i++) seenSensitive = (await ids()).has("b3-t4");
    assert.ok(seenSensitive);
  });

  test("a fact behind a parent's unlock says so, so the app never keeps it for offline use", async () => {
    const { call, fam, par, kid } = await setup();
    await call("PATCH", `/parent/children/${kid}`, { unlockedTopics: ["religion"] }, par);
    const all = new Map<string, unknown>();
    for (let i = 0; i < 12; i++) for (const f of (await call("GET", `/children/${kid}/facts?count=5`, undefined, fam)).json.facts) all.set(f.id, f.sensitive);
    assert.equal(all.get("b3-t4"), "religion");
    for (const id of ["b3-t1", "b3-t2", "b3-t3"]) assert.equal(all.get(id), null);
  });

  test("facts already seen are skipped while others remain", async () => {
    const { call, fam, kid } = await setup();
    for (let i = 0; i < 8; i++) {
      const r = await call("GET", `/children/${kid}/facts?count=1&seen=b3-t1,b3-t2`, undefined, fam);
      assert.equal(r.json.facts[0].id, "b3-t3");
    }
  });

  test("when everything was seen, a fact is still returned", async () => {
    const { call, fam, kid } = await setup();
    const r = await call("GET", `/children/${kid}/facts?count=1&seen=b3-t1,b3-t2,b3-t3`, undefined, fam);
    assert.equal(r.json.facts.length, 1);
  });

  test("an age group with no facts gets an empty list, not an error", async () => {
    const { call, fam, kid } = await setup(16); // band b5
    content.facts.delete("b5");
    const r = await call("GET", `/children/${kid}/facts`, undefined, fam);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.facts, []);
  });

  test("facts need a signed-in family and the child must belong to it", async () => {
    const a = await setup();
    const b = await setup();
    assert.equal((await a.call("GET", `/children/${a.kid}/facts`)).status, 401);
    assert.equal((await b.call("GET", `/children/${a.kid}/facts`, undefined, b.fam)).status, 404);
  });
});
