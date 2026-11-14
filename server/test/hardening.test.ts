// Second security review (docs/FIX_PLAN.md, S1 to S9): password checks before destructive actions,
// report limits, sign-up races, proxy headers, website headers and "read more" link checks.
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
const { WikiClient } = await import("../src/wiki.ts");
const { REPORTS_PER_DAY } = await import("../src/routes/tutor.ts");
const { WEB_SECURITY_HEADERS } = await import("../src/web-headers.ts");

config.security.authRateLimit = 100_000;
const content = loadContent(config.contentDir);

function makeApp() {
  const db = openPglite ? openPglite() : openDb(":memory:");
  const app = createApp({ db, content, tutor: new MockTutor(), wiki: new WikiClient(async () => new Response("{}", { status: 404 })), mailer: new MemoryMailer() });
  const call = async (method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { db, call };
}

const signup = { email: "parent@example.com", password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION };
async function family(call: ReturnType<typeof makeApp>["call"]) {
  const fam = (await call("POST", "/auth/signup", signup)).json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  return { fam, par };
}

describe("password before destructive account actions", () => {
  test("changing the password needs the current one and signs out other devices", async () => {
    const { call } = makeApp();
    const { fam, par } = await family(call);
    assert.equal((await call("PATCH", "/parent/password", { currentPassword: "wrong", newPassword: "a new long password" }, par)).status, 401);
    assert.equal((await call("PATCH", "/parent/password", { currentPassword: signup.password, newPassword: "short" }, par)).status, 400);
    const ok = await call("PATCH", "/parent/password", { currentPassword: signup.password, newPassword: "a new long password" }, par);
    assert.equal(ok.status, 200);
    assert.equal((await call("GET", "/family", undefined, fam)).status, 401, "the old sign-in stops working");
    assert.equal((await call("GET", "/family", undefined, ok.json.familyToken)).status, 200);
    assert.equal((await call("GET", "/parent/overview", undefined, ok.json.parentToken)).status, 200);
    assert.equal((await call("POST", "/auth/login", { email: signup.email, password: signup.password })).status, 401);
    assert.equal((await call("POST", "/auth/login", { email: signup.email, password: "a new long password" })).status, 200);
  });

  test("wrong passwords on account deletion count towards the sign-in lock", async () => {
    const { call } = makeApp();
    const { par } = await family(call);
    let last = 0;
    for (let i = 0; i < config.security.loginMaxAttempts + 1; i++) last = (await call("DELETE", "/parent/account", { password: "nope" }, par)).status;
    assert.equal(last, 429);
    assert.equal((await call("DELETE", "/parent/account", { password: signup.password }, par)).status, 429, "locked even with the right password");
    assert.equal((await call("GET", "/parent/overview", undefined, par)).status, 200, "the account still exists");
  });
});

describe("report limit", () => {
  test(`a family can send ${REPORTS_PER_DAY} reports a day, then gets 429`, async () => {
    const { call } = makeApp();
    const { fam } = await family(call);
    for (let i = 0; i < REPORTS_PER_DAY; i++) assert.equal((await call("POST", "/reports", { reason: "bug" }, fam)).status, 201);
    const over = await call("POST", "/reports", { reason: "bug" }, fam);
    assert.equal(over.status, 429);
    assert.equal(over.json.error, "too_many_reports");
  });
});

describe("sign-up race", () => {
  test("two sign-ups with one email at the same moment: one account, one 409, no server error", async () => {
    const { call, db } = makeApp();
    const results = await Promise.all([call("POST", "/auth/signup", signup), call("POST", "/auth/signup", signup)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM parents"))!.n, 1);
  });
});

describe("client address behind a proxy", () => {
  test("a caller cannot dodge the per-address limit by sending its own X-Forwarded-For", async () => {
    const beforeLimit = config.security.authRateLimit;
    const beforeTrust = config.trustProxy;
    config.security.authRateLimit = 3;
    config.trustProxy = true;
    try {
      const { call } = makeApp();
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        // the caller invents a new first address each time; the proxy appends the real one (203.0.113.9)
        const r = await call("POST", "/auth/login", { email: "x@example.com", password: "x" }, undefined, { "x-forwarded-for": `10.0.0.${i}, 203.0.113.9` });
        statuses.push(r.status);
      }
      assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
    } finally {
      config.security.authRateLimit = beforeLimit;
      config.trustProxy = beforeTrust;
    }
  });
});

describe("website headers and outside links", () => {
  test("the website sends HSTS", () => {
    assert.match(WEB_SECURITY_HEADERS["Strict-Transport-Security"] ?? "", /max-age=\d{7,}/);
  });

  test("a read-more address that is not on wikipedia.org is replaced by the real article address", async () => {
    const page = (url: string) =>
      new WikiClient(async () => new Response(JSON.stringify({ type: "standard", title: "Fraction", extract: "A part of a whole.", content_urls: { desktop: { page: url } } })));
    assert.equal((await page("https://evil.example/wiki/Fraction").summary("b4", "Fraction"))?.url, "https://en.wikipedia.org/wiki/Fraction");
    assert.equal((await page("javascript:alert(1)").summary("b4", "Fraction"))?.url, "https://en.wikipedia.org/wiki/Fraction");
    assert.equal((await page("https://en.wikipedia.org/wiki/Fraction_(mathematics)").summary("b4", "Fraction"))?.url, "https://en.wikipedia.org/wiki/Fraction_(mathematics)");
  });

  test("the fixed test secret is only used under test settings", () => {
    assert.equal(config.tokenSecret, "test-only-secret-never-used-on-a-real-host");
    assert.equal(process.env.DB_PATH, ":memory:");
  });
});
