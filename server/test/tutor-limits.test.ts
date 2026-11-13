// Hoot's daily message limit (atomic under parallel requests) and the conversation-level wellbeing check.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";
process.env.SHOW_DRAFTS = "true";
process.env.TUTOR_DAILY_LIMIT = "5";

const { config } = await import("../src/config.ts");
const { openDb } = await import("../src/db.ts");
// TEST_DB=pglite runs the suite against Postgres (PGlite, in-process) instead of SQLite.
const usePg = process.env.TEST_DB === "pglite";
const { openPglite } = usePg ? await import("./pglite.ts") : { openPglite: null };
const { MemoryMailer } = await import("../src/mailer.ts");
const { loadContent } = await import("../src/content.ts");
const { createApp, CONSENT_VERSION } = await import("../src/app.ts");
const { MockTutor, precheckConversation, PERSONAL_INFO_PLACEHOLDER } = await import("../src/tutor.ts");
const { WikiClient } = await import("../src/wiki.ts");

const content = loadContent(config.contentDir);
const LIMIT = config.tutor.dailyMessageLimit;

function makeApp() {
  const db = openPglite ? openPglite() : openDb(":memory:");
  const mailer = new MemoryMailer();
  const wiki = new WikiClient(async () => new Response("{}", { status: 404 }));
  const app = createApp({ db, content, tutor: new MockTutor(), wiki, mailer });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { app, call, mailer, db };
}

const year = new Date().getFullYear();
const signup = { email: "Parent@Example.com", password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION };

async function family(call: ReturnType<typeof makeApp>["call"]) {
  const s = await call("POST", "/auth/signup", signup);
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  return { fam, par };
}

async function child(call: ReturnType<typeof makeApp>["call"], par: string) {
  return (await call("POST", "/parent/children", { nickname: "Ada", birthYear: year - 10 }, par)).json.child.id as string;
}

const LESSON = "b3-math-comparing-fractions";
const countUser = async (db: ReturnType<typeof makeApp>["db"], kid: string) =>
  (await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM tutor_messages WHERE child_id = ? AND role = 'user'", [kid]))!.n;

describe("daily message limit", () => {
  test("the limit is read from config", () => {
    assert.equal(LIMIT, 5);
  });

  test("messages up to the limit work, the next is refused and leaves nothing stored", async () => {
    const { call, db } = makeApp();
    const { fam, par } = await family(call);
    const kid = await child(call, par);
    const path = `/children/${kid}/tutor/${LESSON}`;
    for (let i = 0; i < LIMIT; i++) assert.equal((await call("POST", path, { message: `help ${i}` }, fam)).status, 200);
    for (let i = 0; i < 3; i++) {
      const over = await call("POST", path, { message: "one more" }, fam);
      assert.equal(over.status, 429);
      assert.equal(over.json.error, "daily_limit_reached");
    }
    assert.equal(await countUser(db, kid), LIMIT);
    const chat = await call("GET", path, undefined, fam);
    assert.ok(!chat.json.messages.some((m: any) => m.content === "one more"));
  });

  test("parallel requests can never exceed the limit", async () => {
    const { call, db } = makeApp();
    const { fam, par } = await family(call);
    const kid = await child(call, par);
    const path = `/children/${kid}/tutor/${LESSON}`;
    const results = await Promise.all(Array.from({ length: LIMIT * 3 }, (_, i) => call("POST", path, { message: `parallel ${i}` }, fam)));
    const ok = results.filter((r) => r.status === 200).length;
    const refused = results.filter((r) => r.status === 429).length;
    assert.ok(ok <= LIMIT, `${ok} messages were accepted, limit is ${LIMIT}`);
    assert.equal(ok + refused, results.length);
    assert.equal(await countUser(db, kid), ok, "every accepted message is stored and every refused one is removed");
  });

  test("the limit is per child", async () => {
    const { call } = makeApp();
    const { fam, par } = await family(call);
    const a = await child(call, par);
    const b = await child(call, par);
    for (let i = 0; i < LIMIT; i++) await call("POST", `/children/${a}/tutor/${LESSON}`, { message: `help ${i}` }, fam);
    assert.equal((await call("POST", `/children/${a}/tutor/${LESSON}`, { message: "more" }, fam)).status, 429);
    assert.equal((await call("POST", `/children/${b}/tutor/${LESSON}`, { message: "hello" }, fam)).status, 200);
  });
});

describe("wellbeing across several messages", () => {
  test("a disclosure spread over two messages is caught and the parent is told once", async () => {
    const { call, mailer } = makeApp();
    const { fam, par } = await family(call);
    const kid = await child(call, par);
    const path = `/children/${kid}/tutor/${LESSON}`;
    const before = mailer.sent.length;
    const first = await call("POST", path, { message: "my dad" }, fam);
    assert.equal(first.json.flagged, false);
    const second = await call("POST", path, { message: "hits me" }, fam);
    assert.equal(second.json.flagged, true);
    assert.match(second.json.reply, /trusted adult|grown-up/);
    assert.equal(mailer.sent.slice(before).filter((m) => /check in with Ada/.test(m.subject)).length, 1);

    // Hoot has answered; a harmless follow-up is not flagged again.
    const third = await call("POST", path, { message: "ok thanks" }, fam);
    assert.equal(third.json.flagged, false);
    const chats = await call("GET", `/parent/children/${kid}/chats`, undefined, par);
    assert.equal(chats.json.messages.filter((m: any) => m.flagged === "wellbeing").length, 1);
  });

  test("everyday conversations are not flagged", async () => {
    const { call } = makeApp();
    const { fam, par } = await family(call);
    const kid = await child(call, par);
    const path = `/children/${kid}/tutor/${LESSON}`;
    for (const message of ["my sister", "beat me at chess", "can you give me a hint?"]) {
      assert.equal((await call("POST", path, { message }, fam)).json.flagged, false, message);
    }
  });
});

describe("precheckConversation", () => {
  const flag = (m: string, earlier: string[]) => precheckConversation(m, earlier, "b3")?.flag ?? null;

  test("reads the last three messages together", () => {
    assert.equal(flag("hits me", ["my dad"]), "wellbeing");
    assert.equal(flag("me", ["my dad", "hits"]), "wellbeing");
    assert.equal(flag("thanks", ["kill", "myself", "ok"]), null, "older than the window");
    assert.equal(flag("myself", ["i want to", "kill"]), "wellbeing");
  });

  test("a single message behaves as before", () => {
    assert.equal(flag("I want to hurt myself", []), "wellbeing");
    assert.equal(flag("my email is ada@example.com", []), "personal_info");
    assert.equal(flag("what is 3/4 of 12?", []), null);
    assert.equal(flag("my dad hits me, I live at 12 Oak Street", []), "wellbeing");
  });

  test("wellbeing across messages wins over personal info in the latest one", () => {
    assert.equal(flag("hits me, my email is ada@example.com", ["my dad"]), "wellbeing");
  });

  test("stored personal-info placeholders are ignored", () => {
    assert.equal(flag("hits me", ["my dad", PERSONAL_INFO_PLACEHOLDER]), "wellbeing");
    assert.equal(flag("what is a fraction", [PERSONAL_INFO_PLACEHOLDER, PERSONAL_INFO_PLACEHOLDER]), null);
  });

  test("everyday phrases stay unflagged when joined", () => {
    const chats: [string, string[]][] = [
      ["beat me at chess", ["my sister"]],
      ["the story touched me", ["this poem really", "and"]],
      ["this homework is killing me", ["ugh", "so hard"]],
      ["is the answer 12?", ["what is 3/4 of 12", "i got 9"]],
      ["he beat me 3-0", ["my brother plays football", "yesterday"]],
      ["I don't want to live in a city", ["when I grow up"]],
      ["the character dies at the end", ["why does the main character die", "in this book"]],
    ];
    for (const [m, earlier] of chats) assert.equal(flag(m, earlier), null, [...earlier, m].join(" | "));
  });
});
