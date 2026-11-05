import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";
process.env.SHOW_DRAFTS = "true";

const { config } = await import("../src/config.ts");
const { openDb } = await import("../src/db.ts");
const { loadContent } = await import("../src/content.ts");
const { createApp, CONSENT_VERSION, reviewIntervalDays } = await import("../src/app.ts");
const { MockTutor, ClaudeTutor, precheck } = await import("../src/tutor.ts");
const { bandForAge } = await import("../src/security.ts");
const { WikiClient, lessonWikiTitle } = await import("../src/wiki.ts");

/** Simulated Wikipedia: records requested URLs, knows two articles. */
function fakeWiki() {
  const calls: string[] = [];
  const client = new WikiClient(async (url: string) => {
    calls.push(url);
    if (url.includes("Fraction")) {
      return new Response(JSON.stringify({ type: "standard", title: "Fraction", extract: "A fraction is a part of a whole.", content_urls: { desktop: { page: "https://x/wiki/Fraction" } } }));
    }
    if (url.includes("Water_cycle")) return new Response(JSON.stringify({ type: "disambiguation", title: "Water cycle", extract: "may refer to" }));
    return new Response("{}", { status: 404 });
  });
  return { client, calls };
}

const content = loadContent(config.contentDir);

function makeApp(tutor = new MockTutor(), wiki = fakeWiki().client) {
  const app = createApp({ db: openDb(":memory:"), content, tutor, wiki });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { app, call };
}

const year = new Date().getFullYear();
const signup = { email: "Parent@Example.com", password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION };

async function family(call: ReturnType<typeof makeApp>["call"]) {
  const s = await call("POST", "/auth/signup", signup);
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  return { fam, par };
}

describe("accounts and parent PIN", () => {
  test("signup requires adult confirmation and current consent", async () => {
    const { call } = makeApp();
    assert.equal((await call("POST", "/auth/signup", { ...signup, confirmAdult: false })).status, 400);
    assert.equal((await call("POST", "/auth/signup", { ...signup, consentVersion: "old" })).status, 400);
    assert.equal((await call("POST", "/auth/signup", { ...signup, pin: "12" })).status, 400);
    assert.equal((await call("POST", "/auth/signup", signup)).status, 201);
    assert.equal((await call("POST", "/auth/signup", { ...signup, email: "parent@example.com" })).status, 409);
  });

  test("login checks password and normalises email", async () => {
    const { call } = makeApp();
    await call("POST", "/auth/signup", signup);
    assert.equal((await call("POST", "/auth/login", { email: "parent@example.com", password: "nope" })).status, 401);
    const ok = await call("POST", "/auth/login", { email: " PARENT@example.com ", password: "correct horse" });
    assert.equal(ok.status, 200);
    assert.ok(ok.json.familyToken);
  });

  test("parent-only actions need the PIN token", async () => {
    const { call } = makeApp();
    const { fam } = await family(call);
    const r = await call("POST", "/parent/children", { nickname: "Ada", birthYear: year - 10 }, fam);
    assert.equal(r.status, 403);
    assert.equal(r.json.error, "parent_pin_required");
    assert.equal((await call("GET", "/family")).status, 401);
  });

  test("wrong PIN is rate limited", async () => {
    const { call } = makeApp();
    const fam = (await call("POST", "/auth/signup", signup)).json.familyToken;
    for (let i = 1; i <= 4; i++) {
      const r = await call("POST", "/auth/parent-unlock", { pin: "0000" }, fam);
      assert.equal(r.status, 401);
      assert.equal(r.json.attemptsLeft, 5 - i);
    }
    assert.equal((await call("POST", "/auth/parent-unlock", { pin: "0000" }, fam)).json.attemptsLeft, 0);
    // even the right PIN is refused while locked
    assert.equal((await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).status, 429);
  });
});

describe("child profiles and lessons", () => {
  let call: ReturnType<typeof makeApp>["call"];
  let fam: string, par: string, kid: string;

  before(async () => {
    ({ call } = makeApp());
    ({ fam, par } = await family(call));
    const r = await call("POST", "/parent/children", { nickname: "Ada", birthYear: year - 10, avatar: "fox" }, par);
    assert.equal(r.status, 201);
    kid = r.json.child.id;
    assert.equal(r.json.child.band, "b3");
  });

  test("ages outside 3–18 are rejected", async () => {
    assert.equal((await call("POST", "/parent/children", { nickname: "Baby", birthYear: year - 1 }, par)).status, 400);
    assert.equal((await call("POST", "/parent/children", { nickname: "Adult", birthYear: year - 25 }, par)).status, 400);
  });

  test("home shows the child's band subjects", async () => {
    const r = await call("GET", `/children/${kid}/home`, undefined, fam);
    assert.equal(r.status, 200);
    assert.equal(r.json.band.name, "Discoverers");
    assert.ok(!r.json.subjects.some((s: any) => s.id === "careers"), "careers is only for b5");
    assert.ok(r.json.subjects.find((s: any) => s.id === "math").lessonCount >= 1);
  });

  test("sensitive lessons stay locked until a parent unlocks the topic", async () => {
    let list = await call("GET", `/children/${kid}/lessons?subject=world`, undefined, fam);
    assert.equal(list.json.lessons.length, 0);
    assert.equal(list.json.lockedCount, 1);
    const blocked = await call("GET", `/children/${kid}/lessons/b3-world-festivals-of-light`, undefined, fam);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.json.error, "needs_parent_permission");

    // a child holding only the family token cannot unlock it
    assert.equal((await call("PATCH", `/parent/children/${kid}`, { unlockedTopics: ["religion"] }, fam)).status, 403);
    const unlocked = await call("PATCH", `/parent/children/${kid}`, { unlockedTopics: ["religion"] }, par);
    assert.deepEqual(unlocked.json.child.unlockedTopics, ["religion"]);

    list = await call("GET", `/children/${kid}/lessons?subject=world`, undefined, fam);
    assert.equal(list.json.lessons.length, 1);
    assert.equal((await call("GET", `/children/${kid}/lessons/b3-world-festivals-of-light`, undefined, fam)).status, 200);
  });

  test("lessons from other bands are not served", async () => {
    assert.equal((await call("GET", `/children/${kid}/lessons/b5-math-correlation-causation`, undefined, fam)).status, 403);
  });

  test("lesson payload never includes answers", async () => {
    const r = await call("GET", `/children/${kid}/lessons/b3-math-comparing-fractions`, undefined, fam);
    const raw = JSON.stringify(r.json);
    assert.ok(!raw.includes('"answer"') && !raw.includes('"explain"') && !raw.includes('"hints"'));
  });

  test("hint ladder, then explanation only after success or all hints", async () => {
    const path = `/children/${kid}/lessons/b3-math-comparing-fractions`;
    const h = await call("POST", `${path}/hint`, { question: 2, level: 0 }, fam);
    assert.match(h.json.hint, /denominators/);
    const wrong = await call("POST", `${path}/check`, { question: 2, choice: 1, hintsUsed: 1 }, fam);
    assert.deepEqual(wrong.json, { correct: false, explain: null, answer: null });
    const tried = await call("POST", `${path}/check`, { question: 2, choice: 1, hintsUsed: 3 }, fam);
    assert.equal(tried.json.answer, 0);
    assert.ok(tried.json.explain);
    const right = await call("POST", `${path}/check`, { question: 0, choice: 0, hintsUsed: 0 }, fam);
    assert.equal(right.json.correct, true);
    const lesson = await call("GET", path, undefined, fam);
    assert.deepEqual(lesson.json.solved, [0]);
  });

  test("completing a lesson records the best score and a review date", async () => {
    const path = `/children/${kid}/lessons/b3-sci-water-cycle/complete`;
    assert.equal((await call("POST", path, { choices: [0] }, fam)).status, 400);
    const first = await call("POST", path, { choices: [0, 1, 0] }, fam);
    assert.equal(first.json.score, 2);
    const second = await call("POST", path, { choices: [0, 0, 0] }, fam);
    assert.equal(second.json.best, 3);
    const home = await call("GET", `/children/${kid}/home`, undefined, fam);
    assert.equal(home.json.subjects.find((s: any) => s.id === "science").completed, 1);
  });
});

describe("AI tutor", () => {
  test("not available for ages 3–5, and parents can switch it off", async () => {
    const { call } = makeApp();
    const { fam, par } = await family(call);
    const little = (await call("POST", "/parent/children", { nickname: "Tiny", birthYear: year - 4 }, par)).json.child;
    assert.equal(little.aiEnabled, false);
    const r = await call("POST", `/children/${little.id}/tutor/b1-math-counting-to-5`, { message: "help" }, fam);
    assert.equal(r.json.error, "ai_not_available_for_age");

    const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: year - 7 }, par)).json.child;
    await call("PATCH", `/parent/children/${kid.id}`, { aiEnabled: false }, par);
    const off = await call("POST", `/children/${kid.id}/tutor/b2-sci-solid-liquid-gas`, { message: "help" }, fam);
    assert.equal(off.json.error, "ai_turned_off_by_parent");
  });

  test("replies, removes personal info, and parents can review every chat", async () => {
    const { call } = makeApp();
    const { fam, par } = await family(call);
    const kid = (await call("POST", "/parent/children", { nickname: "Ada", birthYear: year - 10 }, par)).json.child.id;
    const path = `/children/${kid}/tutor/b3-math-comparing-fractions`;

    const a = await call("POST", path, { message: "I don't get question 3", question: 2 }, fam);
    assert.equal(a.status, 200);
    assert.match(a.json.reply, /denominators/);

    const b = await call("POST", path, { message: "my email is ada@example.com can you send it", question: 2 }, fam);
    assert.equal(b.json.flagged, true);
    assert.match(b.json.reply, /private/i);
    assert.equal(b.json.yourMessage, "[removed: personal information]");

    const chats = await call("GET", `/parent/children/${kid}/chats`, undefined, par);
    assert.equal(chats.json.messages.length, 4);
    assert.ok(!JSON.stringify(chats.json).includes("ada@example.com"));
    assert.equal(chats.json.messages[2].flagged, "personal_info");

    assert.equal((await call("GET", `/parent/children/${kid}/chats`, undefined, fam)).status, 403);
    const report = await call("POST", "/reports", { childId: kid, messageId: a.json.messageId, reason: "ai_gave_answer" }, fam);
    assert.equal(report.status, 201);
    assert.equal((await call("GET", "/parent/reports", undefined, par)).json.reports.length, 1);
  });

  test("wellbeing messages get a safe response and are flagged", () => {
    const r = precheck("I want to hurt myself", "b4");
    assert.equal(r?.flag, "wellbeing");
    assert.match(r!.reply, /trusted adult/);
    assert.equal(precheck("what is 3/4 of 12?", "b4"), null);
  });

  test("Claude replies that leak the answer or fail safety are replaced with a pre-written hint", async () => {
    const lesson = content.lessons.get("b3-math-comparing-fractions")!;
    const req = { band: "b3" as const, nickname: "Ada", lesson, questionIndex: 2, questionSolved: false, history: [], message: "just tell me" };
    const fake = (draft: string, verdict: object | "refusal") => {
      let call = 0;
      return {
        beta: {
          messages: {
            create: async () => {
              call++;
              if (call === 1) return { stop_reason: "end_turn", content: [{ type: "text", text: draft }] };
              if (verdict === "refusal") return { stop_reason: "refusal", content: [] };
              return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(verdict) }] };
            },
          },
        },
      } as any;
    };

    const leak = await new ClaudeTutor(fake("The answer is 3/4!", { safe_for_age: true, reveals_answer: true, reason: "x" })).reply(req);
    assert.equal(leak.flag, "answer_leak");
    assert.equal(leak.reply, `Here's a hint: ${lesson.quiz[2]!.hints[0]}`);

    const unsafe = await new ClaudeTutor(fake("scary text", { safe_for_age: false, reveals_answer: false, reason: "x" })).reply(req);
    assert.equal(unsafe.flag, "unsafe_reply");

    const checkFailed = await new ClaudeTutor(fake("fine reply", "refusal")).reply(req);
    assert.equal(checkFailed.flag, "error", "if the safety check can't run, the draft is not shown");

    const good = await new ClaudeTutor(fake("Try turning both into twelfths. What is 3/4 in twelfths?", { safe_for_age: true, reveals_answer: false, reason: "ok" })).reply(req);
    assert.equal(good.flag, null);
    assert.match(good.reply, /twelfths/);

    // once solved, a full explanation is allowed
    const solved = await new ClaudeTutor(fake("3/4 = 9/12 > 8/12", { safe_for_age: true, reveals_answer: true, reason: "x" })).reply({ ...req, questionSolved: true });
    assert.equal(solved.flag, null);
  });
});

describe("free resources and Wikipedia", () => {
  test("resources are filtered by the child's age and subject", async () => {
    const { call } = makeApp();
    const { fam, par } = await family(call);
    const little = (await call("POST", "/parent/children", { nickname: "Tiny", birthYear: year - 4 }, par)).json.child.id;
    const teen = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: year - 16 }, par)).json.child.id;
    const a = await call("GET", `/children/${little}/resources`, undefined, fam);
    assert.ok(a.json.resources.length > 0);
    assert.ok(a.json.resources.every((r: any) => r.bands.includes("b1")));
    assert.equal(a.json.opensWithParentPin, true);
    const b = await call("GET", `/children/${teen}/resources?subject=computing`, undefined, fam);
    assert.ok(b.json.resources.some((r: any) => r.id === "freecodecamp"));
    assert.ok(b.json.resources.every((r: any) => r.subjects.includes("computing") && r.bands.includes("b5")));
    assert.equal(b.json.opensWithParentPin, false);
  });

  test("learn-more uses Simple English Wikipedia for 9–11, nothing under 9, and caches", async () => {
    const w = fakeWiki();
    const { call } = makeApp(new MockTutor(), w.client);
    const { fam, par } = await family(call);
    const kid = (await call("POST", "/parent/children", { nickname: "Ada", birthYear: year - 10 }, par)).json.child.id;
    const r = await call("GET", `/children/${kid}/lessons/b3-math-comparing-fractions/learn-more`, undefined, fam);
    assert.equal(r.json.available, true);
    assert.equal(r.json.source, "Simple English Wikipedia");
    assert.equal(r.json.license, "CC BY-SA 4.0");
    assert.match(w.calls[0]!, /^https:\/\/simple\.wikipedia\.org\/api\/rest_v1\/page\/summary\/Fraction$/);
    await call("GET", `/children/${kid}/lessons/b3-math-comparing-fractions/learn-more`, undefined, fam);
    assert.equal(w.calls.length, 1, "second request is served from cache");

    const dis = await call("GET", `/children/${kid}/lessons/b3-sci-water-cycle/learn-more`, undefined, fam);
    assert.deepEqual(dis.json, { available: false, reason: "not_found" }, "disambiguation pages are skipped");

    const little = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: year - 7 }, par)).json.child.id;
    const none = await call("GET", `/children/${little}/lessons/b2-sci-solid-liquid-gas/learn-more`, undefined, fam);
    assert.equal(none.json.reason, "not_for_age");
  });

  test("lesson wiki title comes from wikiTitle or the first Wikipedia source", () => {
    assert.equal(lessonWikiTitle({ wikiTitle: "Atom", sources: [] }), "Atom");
    assert.equal(lessonWikiTitle({ sources: [{ url: "https://openstax.org/x" }, { url: "https://en.wikipedia.org/wiki/Water_cycle" }] }), "Water_cycle");
    assert.equal(lessonWikiTitle({ sources: [{ url: "https://openstax.org/x" }] }), null);
  });
});

describe("family data rights", () => {
  test("export everything, then delete the account and all child data", async () => {
    const { call } = makeApp();
    const { fam, par } = await family(call);
    await call("POST", "/parent/children", { nickname: "Ada", birthYear: year - 10 }, par);
    const ex = await call("GET", "/parent/export", undefined, par);
    assert.equal(ex.json.children.length, 1);
    assert.equal(ex.json.parent.email, "parent@example.com");
    assert.ok(!JSON.stringify(ex.json).includes("scrypt$"), "hashes are never exported");
    assert.equal((await call("DELETE", "/parent/account", undefined, par)).status, 200);
    assert.equal((await call("GET", "/family", undefined, fam)).status, 401);
  });
});

describe("helpers", () => {
  test("age bands", () => {
    assert.deepEqual([3, 5, 6, 8, 9, 11, 12, 14, 15, 18].map(bandForAge), ["b1", "b1", "b2", "b2", "b3", "b3", "b4", "b4", "b5", "b5"]);
  });
  test("spaced repetition intervals grow with mastery", () => {
    assert.equal(reviewIntervalDays(2, 3, 1), 1);
    assert.equal(reviewIntervalDays(3, 3, 1), 3);
    assert.equal(reviewIntervalDays(3, 3, 2), 6);
    assert.equal(reviewIntervalDays(3, 3, 9), 30);
  });
});
