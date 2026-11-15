// Standalone mode (task T8c): the API inside the app on one phone, where there is no email. A recovery phrase replaces the
// password reset email, and the wellbeing alert is a notice in the parent area. Server mode must not change.
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
const { normaliseRecoveryPhrase } = await import("../src/security.ts");

const content = loadContent(config.contentDir);
const PASSWORD = "correct horse";
const PHRASE = /^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/;
const year = new Date().getFullYear();

async function setup(device: boolean) {
  const db = openPglite ? openPglite() : openDb(":memory:");
  const mailer = new MemoryMailer();
  const app = createApp({ db, content, tutor: new MockTutor(), mailer, device });
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
  const email = `p${Math.random()}@example.com`;
  const s = await call("POST", "/auth/signup", { email, password: PASSWORD, pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION });
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  return { db, mailer, call, raw, email, fam, par, phrase: s.json.recoveryPhrase as string | undefined, signupStatus: s.status };
}

describe("standalone mode: no email, a recovery phrase instead", () => {
  test("sign-up shows a recovery phrase once and sends no email; a server sign-up has no phrase and sends the code", async () => {
    const phone = await setup(true);
    assert.equal(phone.signupStatus, 201);
    assert.match(phone.phrase ?? "", PHRASE);
    assert.equal(phone.mailer.sent.length, 0, "no verification email on a phone");
    const stored = (await phone.db.get<{ recovery_hash: string }>("SELECT recovery_hash FROM parents"))!.recovery_hash;
    assert.ok(stored.startsWith("scrypt$") && !stored.includes(phone.phrase!), "only a hash is kept");

    const server = await setup(false);
    assert.equal(server.phrase, undefined);
    assert.equal(server.mailer.sent.length, 1, "the server still emails a verification code");
    assert.equal((await server.db.get<{ recovery_hash: string | null }>("SELECT recovery_hash FROM parents"))!.recovery_hash, null);
  });

  test("the phrase resets a forgotten password, however it is typed, and signs out every other session", async () => {
    const { call, email, fam, phrase } = await setup(true);
    assert.equal((await call("POST", "/auth/recover", { email, phrase: "0000-0000-0000-0000-0000-0000", newPassword: "a new password" })).status, 401);
    const typed = phrase!.toLowerCase().replace(/-/g, " ").replace(/0/g, "o").replace(/1/g, "l");
    assert.equal(normaliseRecoveryPhrase(typed), normaliseRecoveryPhrase(phrase!));
    const r = await call("POST", "/auth/recover", { email, phrase: typed, newPassword: "a new password" });
    assert.equal(r.status, 200);
    assert.equal(typeof r.json.familyToken, "string");
    assert.equal((await call("GET", "/family", undefined, fam)).status, 401, "the old session is signed out");
    assert.equal((await call("GET", "/family", undefined, r.json.familyToken)).status, 200);
    assert.equal((await call("POST", "/auth/login", { email, password: PASSWORD })).status, 401, "the old password no longer works");
    assert.equal((await call("POST", "/auth/login", { email, password: "a new password" })).status, 200);
    // the PIN can then be reset with the new password, as before
    assert.equal((await call("POST", "/auth/reset-pin", { password: "a new password", newPin: "1357" }, r.json.familyToken)).status, 200);
  });

  test("guessing the phrase locks the account like guessing the password; an unknown email gives the same answer", async () => {
    const { call, email, phrase } = await setup(true);
    assert.equal((await call("POST", "/auth/recover", { email: "nobody@example.com", phrase: phrase!, newPassword: "a new password" })).json.error, "wrong_recovery_phrase");
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await call("POST", "/auth/recover", { email, phrase: "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA", newPassword: "a new password" })).status;
    assert.equal(last, 401);
    assert.equal((await call("POST", "/auth/recover", { email, phrase: phrase!, newPassword: "a new password" })).status, 429, "locked, even with the right phrase");
  });

  test("a new phrase needs the PIN and the password; the old one then stops working", async () => {
    const { call, email, fam, par, phrase } = await setup(true);
    assert.equal((await call("POST", "/parent/recovery-phrase", { password: PASSWORD }, fam)).status, 403, "the family token is not enough");
    assert.equal((await call("POST", "/parent/recovery-phrase", { password: "wrong password" }, par)).status, 401);
    const fresh = await call("POST", "/parent/recovery-phrase", { password: PASSWORD }, par);
    assert.match(fresh.json.recoveryPhrase, PHRASE);
    assert.notEqual(fresh.json.recoveryPhrase, phrase);
    assert.equal((await call("POST", "/auth/recover", { email, phrase: phrase!, newPassword: "a new password" })).status, 401);
    assert.equal((await call("POST", "/auth/recover", { email, phrase: fresh.json.recoveryPhrase, newPassword: "a new password" })).status, 200);
  });

  test("email routes are not available on a phone; phrase routes are not available on a server", async () => {
    const phone = await setup(true);
    for (const [path, body, token] of [
      ["/auth/forgot-password", { email: phone.email }, undefined],
      ["/auth/reset-password", { email: phone.email, code: "123456", newPassword: "a new password" }, undefined],
      ["/auth/verify-email", { code: "123456" }, phone.fam],
      ["/auth/resend-verification", {}, phone.fam],
    ] as const) {
      const r = await phone.call("POST", path, body, token);
      assert.equal(r.status, 404, path);
      assert.equal(r.json.error, "not_on_this_device", path);
    }
    const server = await setup(false);
    assert.equal((await server.call("POST", "/auth/recover", { email: server.email, phrase: "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA", newPassword: "a new password" })).status, 404);
    assert.equal((await server.call("POST", "/parent/recovery-phrase", { password: PASSWORD }, server.par)).status, 404);
  });

  test("the phrase and its hash are never in any answer after sign-up, nor in the data download", async () => {
    const { call, raw, par, phrase, db } = await setup(true);
    const hash = (await db.get<{ recovery_hash: string }>("SELECT recovery_hash FROM parents"))!.recovery_hash;
    raw.length = 0;
    await call("GET", "/family", undefined, (await call("POST", "/auth/login", { email: (await db.get<{ email: string }>("SELECT email FROM parents"))!.email, password: PASSWORD })).json.familyToken);
    const exp = await call("GET", "/parent/export", undefined, par);
    assert.equal(exp.status, 200);
    assert.ok(raw.every((t) => !t.includes(phrase!) && !t.includes(hash) && !t.includes("recovery")));
  });
});

describe("the wellbeing notice in the parent area (both modes)", () => {
  for (const device of [true, false]) {
    test(`${device ? "phone" : "server"}: unseen wellbeing alerts are counted per child and cleared when the parent has seen them`, async () => {
      const { call, fam, par } = await setup(device);
      const kid = (await call("POST", "/parent/children", { nickname: "Ada", birthYear: year - 12 }, par)).json.child.id as string;
      const other = (await call("POST", "/parent/children", { nickname: "Ben", birthYear: year - 10 }, par)).json.child.id as string;
      const alerts = async () => Object.fromEntries((await call("GET", "/parent/overview", undefined, par)).json.children.map((k: any) => [k.id, k.wellbeingAlerts]));
      assert.deepEqual(await alerts(), { [kid]: 0, [other]: 0 });
      assert.equal((await call("GET", "/family", undefined, fam)).json.attention, false);

      await call("POST", `/children/${kid}/tutor/b4-math-linear-equations`, { message: "can you help me?" }, fam);
      assert.equal((await alerts())[kid], 0, "an ordinary message is not an alert");
      const r = await call("POST", `/children/${kid}/tutor/b4-math-linear-equations`, { message: "I want to hurt myself" }, fam);
      assert.equal(r.json.flagged, true);
      assert.deepEqual(await alerts(), { [kid]: 1, [other]: 0 });
      const fam1 = (await call("GET", "/family", undefined, fam)).json;
      assert.equal(fam1.attention, true);
      assert.ok(!JSON.stringify(fam1).includes("hurt"), "the family screen (open to children) says nothing about what was written");

      assert.equal((await call("POST", `/parent/children/${kid}/wellbeing-seen`, undefined, fam)).status, 403, "only with the PIN");
      assert.equal((await call("POST", `/parent/children/${kid}/wellbeing-seen`, undefined, par)).status, 200);
      assert.deepEqual(await alerts(), { [kid]: 0, [other]: 0 });
      assert.equal((await call("GET", "/family", undefined, fam)).json.attention, false);

      // a later message brings the notice back (created_at must be later than the seen time)
      await new Promise((ok) => setTimeout(ok, 5));
      const again = await call("POST", `/children/${kid}/tutor/b4-math-linear-equations`, { message: "I want to hurt myself" }, fam);
      assert.equal(again.json.flagged, true);
      assert.equal((await alerts())[kid], 1, "a new alert after the parent's 'seen' shows the notice again");
    });
  }
});

describe("standalone mode: guesses do not depend on the phone's clock (T8d)", () => {
  // On a phone the clock belongs to whoever holds it. Clearing the timed lock in the database is what moving the clock forward does.
  const clockForward = (db: Awaited<ReturnType<typeof setup>>["db"]) => db.run("UPDATE parents SET pin_locked_until = NULL, login_locked_until = NULL");

  for (const device of [true, false]) {
    test(`${device ? "phone" : "server"}: after two PIN lockouts in a row, ${device ? "only the password can reset the PIN" : "the PIN works again once the lock ends"}`, async () => {
      const { db, call, fam } = await setup(device);
      for (let lockout = 0; lockout < 2; lockout++) {
        for (let i = 0; i < 5; i++) await call("POST", "/auth/parent-unlock", { pin: "1111" }, fam);
        // the first lockout is timed; on a phone the second one needs the password at once (403), on a server it is timed again
        assert.equal((await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).status, device && lockout === 1 ? 403 : 429);
        await clockForward(db);
      }
      const right = await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam);
      if (!device) {
        assert.equal(right.status, 200, "unchanged on a server: its clock can be trusted");
        return;
      }
      assert.equal(right.status, 403);
      assert.equal(right.json.error, "pin_reset_needed", "even the right PIN is refused: moving the clock gives no more guesses");
      assert.equal((await call("POST", "/auth/reset-pin", { password: PASSWORD, newPin: "1357" }, fam)).status, 200);
      assert.equal((await call("POST", "/auth/parent-unlock", { pin: "1357" }, fam)).status, 200);
    });

    test(`${device ? "phone" : "server"}: after two password lockouts in a row, ${device ? "only the recovery phrase opens the account" : "the password works again once the lock ends"}`, async () => {
      const { db, call, email, fam, phrase } = await setup(device);
      for (let lockout = 0; lockout < 2; lockout++) {
        for (let i = 0; i < 8; i++) await call("POST", "/auth/login", { email, password: "not the password" });
        await clockForward(db);
      }
      const right = await call("POST", "/auth/login", { email, password: PASSWORD });
      if (!device) {
        assert.equal(right.status, 200);
        return;
      }
      assert.equal(right.json.error, "password_reset_needed");
      assert.equal((await call("POST", "/auth/reset-pin", { password: PASSWORD, newPin: "1357" }, fam)).json.error, "password_reset_needed", "nor can it reset the PIN");
      const r = await call("POST", "/auth/recover", { email, phrase: phrase!, newPassword: "a new password" });
      assert.equal(r.status, 200, "the recovery phrase still works");
      assert.equal((await call("POST", "/auth/login", { email, password: "a new password" })).status, 200);
    });
  }

  test("phone: one family per phone; a server takes any number", async () => {
    const phone = await setup(true);
    const second = await phone.call("POST", "/auth/signup", { email: "second@example.com", password: PASSWORD, pin: "1357", confirmAdult: true, consentVersion: CONSENT_VERSION });
    assert.equal(second.status, 409);
    assert.equal(second.json.error, "phone_has_family");
    // starting over: the parent deletes the account (password), then a new one can be made
    assert.equal((await phone.call("DELETE", "/parent/account", { password: PASSWORD }, phone.par)).status, 200);
    assert.equal((await phone.call("POST", "/auth/signup", { email: "second@example.com", password: PASSWORD, pin: "1357", confirmAdult: true, consentVersion: CONSENT_VERSION })).status, 201);

    const server = await setup(false);
    assert.equal((await server.call("POST", "/auth/signup", { email: "second@example.com", password: PASSWORD, pin: "1357", confirmAdult: true, consentVersion: CONSENT_VERSION })).status, 201);
  });
});
