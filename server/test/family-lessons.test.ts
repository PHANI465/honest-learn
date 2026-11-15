import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";
process.env.SHOW_DRAFTS = "false"; // launch-like: built-in drafts are hidden, but a family's own lessons must still show

const { config } = await import("../src/config.ts");
const { openDb } = await import("../src/db.ts");
const usePg = process.env.TEST_DB === "pglite";
const { openPglite } = usePg ? await import("./pglite.ts") : { openPglite: null };
const { MemoryMailer } = await import("../src/mailer.ts");
const { loadContent } = await import("../src/content.ts");
const { createApp, CONSENT_VERSION } = await import("../src/app.ts");
const { MockTutor } = await import("../src/tutor.ts");
const { MAX_FAMILY_LESSONS } = await import("../src/family-lessons.ts");

const content = loadContent(config.contentDir);
const year = new Date().getFullYear();

async function setup(email = `f${Math.random()}@example.com`) {
  const db = openPglite ? openPglite() : openDb(":memory:");
  const app = createApp({ db, content, tutor: new MockTutor(), mailer: new MemoryMailer() });
  return { db, app, ...(await join(app, email)) };
}
async function join(app: ReturnType<typeof createApp>, email: string) {
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  const s = await call("POST", "/auth/signup", { email, password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION });
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: year - 9 }, par)).json.child.id as string; // band b3
  return { call, fam, par, kid };
}

/** A valid lesson. The correct option is the third one as typed, to prove it is moved to the front and shuffled. */
const lesson = (extra: object = {}) => ({
  title: "Our family recipe",
  band: "b3",
  subject: "language",
  minutes: 8,
  sections: [
    { type: "text", body: "Grandma's soup has three steps." },
    { type: "parent", body: "Ask about the family stories." },
  ],
  quiz: [
    { q: "How many steps does the soup have?", options: ["Two", "Five", "Three"], answer: 2, hints: ["Count the steps in the text.", "Read the first sentence again.", "A bike has two wheels, so for two wheels you count two."], explain: "The text says three steps." },
  ],
  ...extra,
});

describe("lessons a family adds", () => {
  test("only the parent (with the PIN) can add, change or remove them", async () => {
    const { call, fam, par } = await setup();
    assert.equal((await call("POST", "/parent/lessons", lesson(), fam)).status, 403);
    assert.equal((await call("GET", "/parent/lessons", undefined, fam)).status, 403);
    const made = await call("POST", "/parent/lessons", lesson(), par);
    assert.equal(made.status, 201);
    const id = made.json.lesson.id as string;
    assert.match(id, /^fam-[a-z0-9-]+$/);
    assert.equal((await call("PUT", `/parent/lessons/${id}`, lesson({ title: "Changed" }), fam)).status, 403);
    assert.equal((await call("DELETE", `/parent/lessons/${id}`, undefined, fam)).status, 403);
  });

  test("the child sees it, labelled as the family's, even when built-in drafts are hidden", async () => {
    const { call, fam, par, kid } = await setup();
    const id = (await call("POST", "/parent/lessons", lesson(), par)).json.lesson.id;
    const list = await call("GET", `/children/${kid}/lessons?subject=language`, undefined, fam);
    const mine = list.json.lessons.find((l: any) => l.id === id);
    assert.ok(mine, "family lesson is listed");
    assert.equal(mine.family, true);
    assert.equal(mine.title, "Our family recipe");
    assert.ok(list.json.lessons.every((l: any) => l.id === id || l.family === false), "built-in lessons are not marked");
    const home = await call("GET", `/children/${kid}/home`, undefined, fam);
    assert.equal(home.json.subjects.find((s: any) => s.id === "language").lessonCount, 1);
    const open = await call("GET", `/children/${kid}/lessons/${id}`, undefined, fam);
    assert.equal(open.status, 200);
    assert.equal(open.json.lesson.ownerId, undefined, "the owner id never leaves the server");
  });

  test("quiz secrecy: the child never receives answers, hints or explanations, and the correct option is shuffled", async () => {
    const { call, fam, par, kid } = await setup();
    const id = (await call("POST", "/parent/lessons", lesson(), par)).json.lesson.id;
    const open = (await call("GET", `/children/${kid}/lessons/${id}`, undefined, fam)).json.lesson;
    const q = open.quiz[0];
    assert.deepEqual(Object.keys(q).sort(), ["options", "q"]);
    assert.equal(JSON.stringify(open).includes("The text says three steps"), false);
    assert.equal(JSON.stringify(open).includes("Count the steps"), false);
    // the hint ladder and checks work on the server as for any lesson
    const right = q.options.indexOf("Three");
    assert.equal((await call("POST", `/children/${kid}/lessons/${id}/check`, { question: 0, choice: right, hintsUsed: 0 }, fam)).json.correct, true);
    const wrong = q.options.indexOf("Five");
    const miss = await call("POST", `/children/${kid}/lessons/${id}/check`, { question: 0, choice: wrong, hintsUsed: 3 }, fam);
    assert.equal(miss.json.correct, false);
    assert.equal(miss.json.answer, null, "no answer before the hints were really opened");
    assert.equal((await call("POST", `/children/${kid}/lessons/${id}/hint`, { question: 0, level: 1 }, fam)).status, 400, "hints go in order");
    for (const level of [0, 1, 2]) assert.equal((await call("POST", `/children/${kid}/lessons/${id}/hint`, { question: 0, level }, fam)).status, 200);
    const after = await call("POST", `/children/${kid}/lessons/${id}/check`, { question: 0, choice: wrong, hintsUsed: 3 }, fam);
    assert.equal(after.json.answer, right);
  });

  test("finishing it is recorded, and the parent overview shows its title", async () => {
    const { call, fam, par, kid } = await setup();
    const id = (await call("POST", "/parent/lessons", lesson(), par)).json.lesson.id;
    const open = (await call("GET", `/children/${kid}/lessons/${id}`, undefined, fam)).json.lesson;
    const done = await call("POST", `/children/${kid}/lessons/${id}/complete`, { choices: [open.quiz[0].options.indexOf("Three")] }, fam);
    assert.equal(done.json.score, 1);
    const ov = await call("GET", "/parent/overview", undefined, par);
    assert.equal(ov.json.children[0].recent[0].title, "Our family recipe");
  });

  test("practice questions can come from a family lesson, still without answers", async () => {
    const { call, fam, par, kid } = await setup();
    const id = (await call("POST", "/parent/lessons", lesson(), par)).json.lesson.id;
    const p = await call("GET", `/children/${kid}/practice?subject=language`, undefined, fam);
    const mine = p.json.questions.find((x: any) => x.lessonId === id);
    assert.ok(mine);
    assert.deepEqual(Object.keys(mine).sort(), ["lessonId", "lessonTitle", "options", "q", "question"]);
  });

  test("another family cannot see it or open it, even knowing its id", async () => {
    const a = await setup("a@example.com");
    const db = a.db;
    const b = await join(a.app, "b@example.com");
    const id = (await a.call("POST", "/parent/lessons", lesson(), a.par)).json.lesson.id;
    assert.equal((await b.call("GET", `/children/${b.kid}/lessons/${id}`, undefined, b.fam)).status, 404);
    assert.equal((await b.call("POST", `/children/${b.kid}/lessons/${id}/check`, { question: 0, choice: 0, hintsUsed: 0 }, b.fam)).status, 404);
    const list = await b.call("GET", `/children/${b.kid}/lessons?subject=language`, undefined, b.fam);
    assert.ok(!list.json.lessons.some((l: any) => l.id === id));
    assert.equal((await b.call("GET", "/parent/lessons", undefined, b.par)).json.lessons.length, 0);
    assert.equal((await b.call("PUT", `/parent/lessons/${id}`, lesson(), b.par)).status, 404);
    assert.equal((await b.call("DELETE", `/parent/lessons/${id}`, undefined, b.par)).status, 404);
    assert.equal((await db.all("SELECT id FROM family_lessons")).length, 1, "the other family's delete did nothing");
  });

  test("a lesson is only shown to children of its own age group", async () => {
    const { call, fam, par, kid } = await setup();
    const older = (await call("POST", "/parent/lessons", lesson({ band: "b5", subject: "math" }), par)).json.lesson.id;
    const list = await call("GET", `/children/${kid}/lessons`, undefined, fam);
    assert.ok(!list.json.lessons.some((l: any) => l.id === older));
    assert.equal((await call("GET", `/children/${kid}/lessons/${older}`, undefined, fam)).status, 403);
  });

  test("bad lessons are refused with a clear reason", async () => {
    const { call, par } = await setup();
    const bad = async (patch: object) => (await call("POST", "/parent/lessons", lesson(patch), par)).status;
    assert.equal(await bad({ title: "" }), 400);
    assert.equal(await bad({ subject: "cooking" }), 400);
    assert.equal(await bad({ subject: "careers" }), 400); // careers is only offered at 15 to 18
    assert.equal(await bad({ band: "b9" }), 400);
    assert.equal(await bad({ sections: [] }), 400);
    assert.equal(await bad({ sections: [{ type: "video", body: "x" }] }), 400);
    const q = lesson().quiz[0]!;
    assert.equal(await bad({ quiz: [{ ...q, options: ["Same", "same", "Other"], answer: 0 }] }), 400);
    assert.equal(await bad({ quiz: [{ ...q, answer: 7 }] }), 400);
    assert.equal(await bad({ quiz: [{ ...q, hints: ["only one"] }] }), 400);
    assert.equal(await bad({ quiz: [{ ...q, options: ["Only"], answer: 0 }] }), 400);
    const careers = await call("POST", "/parent/lessons", lesson({ band: "b5", subject: "careers" }), par);
    assert.equal(careers.status, 201);
  });

  test("limits: 20 KB per lesson and 100 lessons per family", async () => {
    const { call, par, db } = await setup();
    const big = lesson({ sections: Array.from({ length: 12 }, () => ({ type: "text", body: "x".repeat(2000) })) });
    const r = await call("POST", "/parent/lessons", big, par);
    assert.equal(r.status, 400);
    assert.match(JSON.stringify(r.json), /too long/);
    const parentId = ((await db.get("SELECT id FROM parents")) as { id: string }).id;
    for (let i = 0; i < MAX_FAMILY_LESSONS; i++) {
      await db.run("INSERT INTO family_lessons (id, parent_id, json, created_at, updated_at) VALUES (?,?,?,?,?)", [`fam-fill-${i}`, parentId, "{}", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"]);
    }
    const over = await call("POST", "/parent/lessons", lesson(), par);
    assert.equal(over.status, 400);
    assert.equal(over.json.error, "too_many_lessons");
  });

  test("a hint that contains the answer is saved but the parent is warned", async () => {
    const { call, par } = await setup();
    const q = lesson().quiz[0]!;
    const r = await call("POST", "/parent/lessons", lesson({ quiz: [{ ...q, hints: ["It is Three!", "Count.", "Look at the text."] }] }), par);
    assert.equal(r.status, 201);
    assert.ok(r.json.warnings.some((w: string) => /hint contains the correct answer/.test(w)));
  });

  test("changing a lesson clears what children opened or solved for the old questions; deleting removes everything tied to it", async () => {
    const { call, fam, par, kid, db } = await setup();
    const id = (await call("POST", "/parent/lessons", lesson(), par)).json.lesson.id;
    await call("POST", `/children/${kid}/lessons/${id}/hint`, { question: 0, level: 0 }, fam);
    const open = (await call("GET", `/children/${kid}/lessons/${id}`, undefined, fam)).json.lesson;
    await call("POST", `/children/${kid}/lessons/${id}/complete`, { choices: [open.quiz[0].options.indexOf("Three")] }, fam);
    assert.equal((await db.all("SELECT * FROM hints_seen WHERE item_id = ?", [id])).length, 1);
    const put = await call("PUT", `/parent/lessons/${id}`, lesson({ title: "Renamed" }), par);
    assert.equal(put.json.lesson.title, "Renamed");
    assert.equal((await db.all("SELECT * FROM hints_seen WHERE item_id = ?", [id])).length, 0);
    assert.equal((await db.all("SELECT * FROM progress WHERE lesson_id = ?", [id])).length, 1, "finished-lesson progress is kept on an edit");
    assert.equal((await call("DELETE", `/parent/lessons/${id}`, undefined, par)).status, 200);
    assert.equal((await db.all("SELECT * FROM progress WHERE lesson_id = ?", [id])).length, 0);
    assert.equal((await call("GET", `/children/${kid}/lessons/${id}`, undefined, fam)).status, 404);
  });

  test("they are included in the data export and erased with the account", async () => {
    const { call, par, db } = await setup();
    await call("POST", "/parent/lessons", lesson(), par);
    const exp = await call("GET", "/parent/export", undefined, par);
    assert.equal(exp.json.familyLessons.length, 1);
    assert.equal(exp.json.familyLessons[0].title, "Our family recipe");
    const del = await call("DELETE", "/parent/account", { password: "correct horse" }, par);
    assert.equal(del.status, 200);
    assert.equal((await db.all("SELECT id FROM family_lessons")).length, 0);
  });

  test("the edit form gets the lesson back as typed, with the correct option first", async () => {
    const { call, par } = await setup();
    await call("POST", "/parent/lessons", lesson(), par);
    const list = await call("GET", "/parent/lessons", undefined, par);
    const q = list.json.lessons[0].quiz[0];
    assert.equal(q.answer, 0);
    assert.equal(q.options[0], "Three");
    assert.equal(list.json.limit, 100);
    assert.ok(list.json.subjects.length >= 10);
  });
});
