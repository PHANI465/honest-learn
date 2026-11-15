// A family's own AI model and key (T6). The key is a secret: these tests look for it in every response, the export, the database
// value and the logs. A fake OpenAI-compatible model server on 127.0.0.1 stands in for the real one, so no AI and no internet.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";

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
const ai = await import("../src/ai-settings.ts");
const { AI_TESTS_PER_HOUR } = await import("../src/routes/parent-ai.ts");

const content = loadContent(config.contentDir);
const KEY = "sk-test-THIS-IS-THE-SECRET-KEY-9f3a";
const PASSWORD = "correct horse";
const year = new Date().getFullYear();
const LESSON = "b3-math-comparing-fractions";

// ---------------------------------------------------------------- the fake model server
interface Seen {
  path: string;
  auth: string | null;
  model: string;
}
let seen: Seen[] = [];
let mode: "ok" | "unauthorized" | "redirect" = "ok";
let fake: Server;
let base = "";
before(async () => {
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};
      seen.push({ path: req.url ?? "", auth: req.headers.authorization ?? null, model: parsed.model });
      if (mode === "unauthorized") {
        res.statusCode = 401;
        res.end("SECRET-BODY-FROM-MODEL-SERVER: invalid key " + (req.headers.authorization ?? ""));
        return;
      }
      if (mode === "redirect") {
        res.statusCode = 302;
        res.setHeader("location", "http://169.254.169.254/latest/meta-data/");
        res.end();
        return;
      }
      const text = parsed.model === "judge-model" ? '{"safe_for_age": true, "reveals_answer": false, "reason": "fine"}' : "What do you notice about the bottom numbers?";
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
    });
  });
  await new Promise<void>((ok) => fake.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(fake.address() as { port: number }).port}/v1`;
});
after(() => fake.close());

// ---------------------------------------------------------------- capture every log line
const logged: string[] = [];
const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
before(() => {
  for (const k of ["log", "error", "warn", "info"] as const) console[k] = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
});
after(() => Object.assign(console, original));

async function setup(age = 9) {
  const db = openPglite ? openPglite() : openDb(":memory:");
  const app = createApp({ db, content, tutor: new MockTutor(), mailer: new MemoryMailer() });
  const raw: string[] = [];
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    raw.push(text);
    return { status: res.status, json: (text ? JSON.parse(text) : {}) as any };
  };
  const s = await call("POST", "/auth/signup", { email: `k${Math.random()}@example.com`, password: PASSWORD, pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION });
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: year - age }, par)).json.child.id as string;
  return { db, call, fam, par, kid, raw };
}
const settings = (extra: object = {}) => ({ password: PASSWORD, provider: "custom", baseUrl: base, model: "tiny-model", safetyModel: "judge-model", apiKey: KEY, ...extra });

// ================================================================ unit: encryption
describe("the key is encrypted at rest", () => {
  test("it opens again for the same parent, and the stored value does not contain it", () => {
    const sealed = ai.sealKey(KEY, "parent-1");
    assert.equal(ai.openKey(sealed, "parent-1"), KEY);
    assert.ok(!sealed.includes(KEY) && !sealed.includes("SECRET"));
    assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    assert.notEqual(ai.sealKey(KEY, "parent-1"), sealed, "a fresh random IV every time");
  });
  test("it does not open for another parent, after tampering, or with another server secret", () => {
    const sealed = ai.sealKey(KEY, "parent-1");
    assert.equal(ai.openKey(sealed, "parent-2"), null);
    const parts = sealed.split(".");
    const flipped = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("AA") ? "BB" : "AA");
    assert.equal(ai.openKey([parts[0], parts[1], parts[2], flipped].join("."), "parent-1"), null);
    assert.equal(ai.openKey("v2.a.b.c", "parent-1"), null);
    const before = config.aiKeySecret;
    config.aiKeySecret = "another-secret-entirely";
    try {
      assert.equal(ai.openKey(sealed, "parent-1"), null);
    } finally {
      config.aiKeySecret = before;
    }
  });
  test("only the last four characters of a long key are kept in plain text", () => {
    assert.equal(ai.lastFour(KEY), "9f3a");
    assert.equal(ai.lastFour("short-key"), null);
  });
});

// ================================================================ unit: address guard
describe("the model address guard (server-side request forgery)", () => {
  test("IP addresses are sorted into public, private and forbidden", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700::1111"]) assert.equal(ai.classifyIp(ip), "public", ip);
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.20", "100.64.0.1", "::1", "fd12::1", "::ffff:192.168.0.1"]) assert.equal(ai.classifyIp(ip), "private", ip);
    for (const ip of ["169.254.169.254", "169.254.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "fe80::1", "::", "ff02::1", "fd00:ec2::254", "::ffff:169.254.169.254", "not-an-ip"]) {
      assert.equal(ai.classifyIp(ip), "forbidden", ip);
    }
  });
  test("written addresses: https anywhere, http only to this machine or the local network, never metadata or credentials", () => {
    assert.deepEqual(ai.checkBaseUrl("https://openrouter.ai/api/v1/", true), { ok: true, url: "https://openrouter.ai/api/v1", host: "openrouter.ai" });
    assert.equal(ai.checkBaseUrl("http://localhost:11434/v1", true).ok, true);
    assert.equal(ai.checkBaseUrl("http://192.168.1.20:1234/v1", true).ok, true);
    assert.equal(ai.checkBaseUrl("http://localhost:11434/v1", false).ok, false, "local models off");
    assert.equal(ai.checkBaseUrl("https://10.0.0.5/v1", false).ok, false, "private network off");
    assert.equal(ai.checkBaseUrl("http://example.org/v1", true).ok, false, "plain http to the internet");
    assert.equal(ai.checkBaseUrl("http://169.254.169.254/latest", true).ok, false);
    assert.equal(ai.checkBaseUrl("https://[fe80::1]/v1", true).ok, false);
    assert.equal(ai.checkBaseUrl("https://user:pw@example.org/v1", true).ok, false);
    assert.equal(ai.checkBaseUrl("https://example.org/v1?x=1", true).ok, false);
    assert.equal(ai.checkBaseUrl("file:///etc/passwd", true).ok, false);
    assert.equal(ai.checkBaseUrl("javascript:alert(1)", true).ok, false);
    assert.equal(ai.checkBaseUrl("not a url", true).ok, false);
  });
  test("names are resolved: a name that points at a metadata or private address is refused", async () => {
    const to = (...addresses: string[]) => async () => addresses.map((address) => ({ address }));
    assert.deepEqual(await ai.checkResolvedHost("evil.example", true, to("169.254.169.254")), { ok: false, error: "blocked_address" });
    assert.deepEqual(await ai.checkResolvedHost("intranet.example", false, to("10.0.0.5")), { ok: false, error: "blocked_address" });
    assert.deepEqual(await ai.checkResolvedHost("mixed.example", false, to("8.8.8.8", "192.168.0.1")), { ok: false, error: "blocked_address" }, "every address must pass");
    assert.deepEqual(await ai.checkResolvedHost("intranet.example", true, to("10.0.0.5")), { ok: true });
    assert.deepEqual(await ai.checkResolvedHost("public.example", false, to("8.8.8.8")), { ok: true });
    assert.deepEqual(await ai.checkResolvedHost("nowhere.example", true, async () => { throw new Error("ENOTFOUND"); }), { ok: false, error: "unreachable" });
  });
  test("the guarded fetch checks before every request and never follows redirects", async () => {
    const calls: { url: string; redirect?: RequestRedirect }[] = [];
    const inner = (async (url: string, init?: RequestInit) => (calls.push({ url, redirect: init?.redirect }), new Response("{}"))) as typeof fetch;
    const evil = ai.guardedFetch(true, async () => [{ address: "169.254.169.254" }], inner);
    await assert.rejects(evil("https://evil.example/v1/chat/completions", { method: "POST" }), /blocked_address/);
    assert.equal(calls.length, 0, "nothing is sent to a blocked address");
    const fine = ai.guardedFetch(true, async () => [{ address: "8.8.8.8" }], inner);
    await fine("https://good.example/v1/chat/completions", { method: "POST", redirect: "follow" });
    assert.deepEqual(calls, [{ url: "https://good.example/v1/chat/completions", redirect: "error" }]);
  });
  test("errors become short categories, never the server's own words", () => {
    assert.equal(ai.errorCategory(new Error("model server answered 401")), "key_refused");
    assert.equal(ai.errorCategory(new Error("model server answered 404")), "model_not_found");
    assert.equal(ai.errorCategory(new Error("model server answered 503")), "server_error");
    assert.equal(ai.errorCategory(new Error("blocked_address")), "blocked_address");
    assert.equal(ai.errorCategory(Object.assign(new Error("x"), { name: "TimeoutError" })), "timeout");
    assert.equal(ai.errorCategory(new Error("anything else, even with secrets")), "unreachable");
  });
});

// ================================================================ routes
describe("the parent area: own model settings", () => {
  test("needs the parent PIN token; saving also needs the account password", async () => {
    const { call, fam, par, db } = await setup();
    assert.equal((await call("GET", "/parent/ai", undefined, fam)).status, 403);
    assert.equal((await call("PUT", "/parent/ai", settings(), fam)).status, 403);
    assert.equal((await call("PUT", "/parent/ai", settings({ password: "wrong password" }), par)).status, 401);
    assert.equal((await call("PUT", "/parent/ai", { ...settings(), password: undefined }, par)).status, 400);
    assert.equal((await db.all("SELECT * FROM ai_settings")).length, 0, "nothing saved without the password");
    assert.deepEqual((await call("GET", "/parent/ai", undefined, par)).json.settings, { configured: false, allowLocal: config.allowLocalLlm });
  });

  test("saving stores the key encrypted, returns only its last four characters, and turns Hoot off for every child", async () => {
    const { call, par, kid, db, raw } = await setup();
    await call("PATCH", `/parent/children/${kid}`, { aiEnabled: true }, par);
    const r = await call("PUT", "/parent/ai", settings(), par);
    assert.equal(r.status, 200);
    assert.equal(r.json.settings.keyLast4, "9f3a");
    assert.equal(r.json.settings.hasKey, true);
    assert.equal(r.json.settings.tested, false);
    assert.equal(r.json.hootTurnedOff, 1);
    const row = (await db.get("SELECT * FROM ai_settings")) as { key_cipher: string; base_url: string };
    assert.ok(row.key_cipher && !row.key_cipher.includes(KEY));
    assert.equal(row.base_url, base);
    assert.equal(((await db.get("SELECT ai_enabled FROM children WHERE id = ?", [kid])) as { ai_enabled: number }).ai_enabled, 0);
    const got = await call("GET", "/parent/ai", undefined, par);
    assert.deepEqual(Object.keys(got.json.settings).sort(), ["allowLocal", "baseUrl", "configured", "hasKey", "keyLast4", "keyUnreadable", "model", "provider", "safetyModel", "tested", "updatedAt"]);
    assert.ok(raw.every((t) => !t.includes(KEY) && !t.includes(row.key_cipher)), "no response ever contains the key or its ciphertext");
  });

  test("the data export lists the settings but never the key or its ciphertext", async () => {
    const { call, par, db } = await setup();
    await call("PUT", "/parent/ai", settings(), par);
    const exp = await call("GET", "/parent/export", undefined, par);
    const text = JSON.stringify(exp.json);
    const cipher = ((await db.get("SELECT key_cipher FROM ai_settings")) as { key_cipher: string }).key_cipher;
    assert.ok(!text.includes(KEY) && !text.includes(cipher) && !text.includes("key_cipher"));
    assert.equal(exp.json.ownAiModel.model, "tiny-model");
    assert.equal(exp.json.ownAiModel.key_last4, "9f3a");
  });

  test("Hoot then uses the family's model, with the key, once the parent turns Hoot on again", async () => {
    const { call, fam, par, kid } = await setup();
    await call("PUT", "/parent/ai", settings(), par);
    assert.equal((await call("POST", `/children/${kid}/tutor/${LESSON}`, { message: "help me" }, fam)).status, 403, "Hoot is off after connecting a new model");
    await call("PATCH", `/parent/children/${kid}`, { aiEnabled: true }, par);
    seen = [];
    const r = await call("POST", `/children/${kid}/tutor/${LESSON}`, { message: "can you help me compare these?" }, fam);
    assert.equal(r.status, 200);
    assert.equal(r.json.reply, "What do you notice about the bottom numbers?");
    assert.ok(!JSON.stringify(r.json).includes(KEY));
    assert.deepEqual(seen.map((s) => s.model), ["tiny-model", "judge-model"]);
    assert.ok(seen.every((s) => s.auth === `Bearer ${KEY}` && s.path === "/v1/chat/completions"));
  });

  test("a new host never receives the old key: it is cleared unless typed again", async () => {
    const { call, par, db } = await setup();
    await call("PUT", "/parent/ai", settings(), par);
    const otherHost = base.replace("127.0.0.1", "localhost");
    const r = await call("PUT", "/parent/ai", { ...settings({ baseUrl: otherHost }), apiKey: undefined }, par);
    assert.equal(r.status, 200);
    assert.equal(r.json.keyCleared, true);
    assert.equal(r.json.settings.hasKey, false);
    assert.equal(((await db.get("SELECT key_cipher FROM ai_settings")) as { key_cipher: string | null }).key_cipher, null);
    // another port on the same machine is another server too
    await call("PUT", "/parent/ai", settings(), par);
    const otherPort = base.replace(/:(\d+)\//, (_, p) => `:${Number(p) + 1}/`);
    assert.equal((await call("PUT", "/parent/ai", { ...settings({ baseUrl: otherPort }), apiKey: undefined }, par)).json.keyCleared, true);
    // the same server keeps the key when it is left out
    await call("PUT", "/parent/ai", settings(), par);
    const same = await call("PUT", "/parent/ai", { ...settings({ model: "other-model" }), apiKey: undefined }, par);
    assert.equal(same.json.settings.hasKey, true);
    // and an empty key removes it on purpose
    const removed = await call("PUT", "/parent/ai", settings({ apiKey: "" }), par);
    assert.equal(removed.json.settings.hasKey, false);
  });

  test("dangerous or malformed addresses are refused when saving", async () => {
    const { call, par } = await setup();
    for (const baseUrl of ["http://169.254.169.254/latest/meta-data", "http://example.org/v1", "https://user:pw@example.org/v1", "ftp://example.org", "https://[fe80::1]/v1", "https://0.0.0.0/v1", "not a url"]) {
      const r = await call("PUT", "/parent/ai", settings({ baseUrl }), par);
      assert.equal(r.status, 400, baseUrl);
    }
    const before = config.allowLocalLlm;
    config.allowLocalLlm = false;
    try {
      assert.equal((await call("PUT", "/parent/ai", settings(), par)).status, 400, "a local model is refused where local models are off");
    } finally {
      config.allowLocalLlm = before;
    }
  });

  test("bad keys and model names are refused (a key cannot smuggle a header)", async () => {
    const { call, par } = await setup();
    assert.equal((await call("PUT", "/parent/ai", settings({ apiKey: "sk-abc\r\nX-Evil: 1" }), par)).status, 400);
    assert.equal((await call("PUT", "/parent/ai", settings({ apiKey: "short" }), par)).status, 400);
    assert.equal((await call("PUT", "/parent/ai", settings({ model: "model; rm -rf" }), par)).status, 400);
    assert.equal((await call("PUT", "/parent/ai", settings({ provider: "evilcorp" }), par)).status, 400);
  });

  test("the test button reports success or a short reason, never the server's reply, and is rate limited", async () => {
    const { call, par, raw } = await setup();
    assert.equal((await call("POST", "/parent/ai/test", undefined, par)).status, 404);
    await call("PUT", "/parent/ai", settings(), par);
    mode = "ok";
    const good = await call("POST", "/parent/ai/test", undefined, par);
    assert.equal(good.json.ok, true);
    assert.deepEqual(good.json.results.map((x: any) => x.model), ["tiny-model", "judge-model"]);
    mode = "unauthorized";
    const refused = await call("POST", "/parent/ai/test", undefined, par);
    assert.equal(refused.json.ok, false);
    assert.equal(refused.json.results[0].error, "key_refused");
    mode = "redirect";
    const redirected = await call("POST", "/parent/ai/test", undefined, par);
    assert.equal(redirected.json.ok, false, "a redirect is never followed");
    mode = "ok";
    assert.ok(raw.every((t) => !t.includes("SECRET-BODY") && !t.includes(KEY)), "the model server's words and the key are never passed on");
    let last = 0;
    for (let i = 0; i < AI_TESTS_PER_HOUR; i++) last = (await call("POST", "/parent/ai/test", undefined, par)).status;
    assert.equal(last, 429);
  });

  test("a key that can no longer be opened (changed server secret) is reported, not sent", async () => {
    const { call, par } = await setup();
    await call("PUT", "/parent/ai", settings(), par);
    const before = config.aiKeySecret;
    config.aiKeySecret = "rotated-secret";
    try {
      const got = await call("GET", "/parent/ai", undefined, par);
      assert.equal(got.json.settings.keyUnreadable, true);
      assert.equal(got.json.settings.hasKey, false);
      seen = [];
      const t = await call("POST", "/parent/ai/test", undefined, par);
      assert.equal(t.json.error, "key_unreadable");
      assert.equal(seen.length, 0);
    } finally {
      config.aiKeySecret = before;
    }
  });

  test("removing the settings goes back to the default helper; deleting the account removes them", async () => {
    const { call, fam, par, kid, db } = await setup();
    await call("PUT", "/parent/ai", settings(), par);
    await call("PATCH", `/parent/children/${kid}`, { aiEnabled: true }, par);
    assert.equal((await call("DELETE", "/parent/ai", undefined, par)).status, 200);
    seen = [];
    const r = await call("POST", `/children/${kid}/tutor/${LESSON}`, { message: "help me" }, fam);
    assert.equal(r.status, 200);
    assert.equal(seen.length, 0, "the family model is no longer called");
    await call("PUT", "/parent/ai", settings(), par);
    await call("DELETE", "/parent/account", { password: PASSWORD }, par);
    assert.equal((await db.all("SELECT * FROM ai_settings")).length, 0);
  });

  test("the key never appears in any log line, including when the model server fails", async () => {
    const { call, fam, par, kid } = await setup();
    await call("PUT", "/parent/ai", settings(), par);
    await call("PATCH", `/parent/children/${kid}`, { aiEnabled: true }, par);
    mode = "unauthorized";
    await call("POST", `/children/${kid}/tutor/${LESSON}`, { message: "help me" }, fam);
    await call("POST", "/parent/ai/test", undefined, par);
    mode = "ok";
    assert.ok(logged.length > 0, "the failure was logged");
    assert.ok(logged.every((l) => !l.includes(KEY) && !l.includes("THIS-IS-THE-SECRET")), "no log line contains the key");
  });
});
