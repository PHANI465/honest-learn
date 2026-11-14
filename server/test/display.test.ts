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

const content = loadContent(config.contentDir);

async function setup() {
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
  const s = await call("POST", "/auth/signup", { email: "a11y@example.com", password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION });
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: new Date().getFullYear() - 9 }, par)).json.child.id as string;
  return { call, fam, par, kid };
}

describe("reading and display settings", () => {
  test("default to standard text, no dyslexia font, no high contrast, no auto read-aloud", async () => {
    const { call, par } = await setup();
    const c = (await call("POST", "/parent/children", { nickname: "Fresh", birthYear: new Date().getFullYear() - 9 }, par)).json.child;
    assert.equal(c.textScale, 1);
    assert.equal(c.dyslexiaFont, false);
    assert.equal(c.highContrast, false);
    assert.equal(c.readAloudAuto, false);
  });

  test("a parent can change them, and they are kept", async () => {
    const { call, par, kid } = await setup();
    const r = await call("PATCH", `/parent/children/${kid}`, { textScale: 1.3, dyslexiaFont: true, highContrast: true, readAloudAuto: true }, par);
    assert.equal(r.status, 200);
    assert.equal(r.json.child.textScale, 1.3);
    assert.equal(r.json.child.dyslexiaFont, true);
    assert.equal(r.json.child.highContrast, true);
    assert.equal(r.json.child.readAloudAuto, true);
    // changing something else leaves them alone
    const r2 = await call("PATCH", `/parent/children/${kid}`, { nickname: "Sammy" }, par);
    assert.equal(r2.json.child.textScale, 1.3);
    assert.equal(r2.json.child.dyslexiaFont, true);
    // and they can be switched back off
    const r3 = await call("PATCH", `/parent/children/${kid}`, { textScale: 1, dyslexiaFont: false }, par);
    assert.equal(r3.json.child.textScale, 1);
    assert.equal(r3.json.child.dyslexiaFont, false);
    assert.equal(r3.json.child.highContrast, true);
  });

  test("only the three text sizes are accepted", async () => {
    const { call, par, kid } = await setup();
    assert.equal((await call("PATCH", `/parent/children/${kid}`, { textScale: 5 }, par)).status, 400);
    assert.equal((await call("PATCH", `/parent/children/${kid}`, { textScale: 1.15 }, par)).status, 200);
  });

  test("changing them needs the parent PIN", async () => {
    const { call, fam, kid } = await setup();
    assert.equal((await call("PATCH", `/parent/children/${kid}`, { highContrast: true }, fam)).status, 403);
  });
});
