// "What they know" (parent outcomes view) and "Try next" (child home suggestions).
import { test, describe, before } from "node:test";
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

const content = loadContent(config.contentDir);

function makeApp() {
  const db = openPglite ? openPglite() : openDb(":memory:");
  const wiki = new WikiClient(async () => new Response("{}", { status: 404 }));
  const app = createApp({ db, content, tutor: new MockTutor(), wiki, mailer: new MemoryMailer() });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { app, call, db };
}

const year = new Date().getFullYear();
const signup = { email: "Parent@Example.com", password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION };

async function family(call: ReturnType<typeof makeApp>["call"]) {
  const s = await call("POST", "/auth/signup", signup);
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  return { fam, par };
}

describe("what they know and try next", () => {
  let call: ReturnType<typeof makeApp>["call"];
  let db: ReturnType<typeof makeApp>["db"];
  let fam: string, par: string, kid: string;

  before(async () => {
    ({ call, db } = makeApp());
    ({ fam, par } = await family(call));
    kid = (await call("POST", "/parent/children", { nickname: "Ada", birthYear: year - 10 }, par)).json.child.id;
  });

  const outcomes = async () => (await call("GET", `/parent/children/${kid}/outcomes`, undefined, par)).json;
  const statusOf = (o: any, id: string) => o.outcomes.find((x: any) => x.id === id)?.status;

  /** Finishes a lesson: every question right, or (wrongCount) the first questions wrong. */
  async function finish(lessonId: string, wrongCount = 0) {
    const shown = (await call("GET", `/children/${kid}/lessons/${lessonId}`, undefined, fam)).json.lesson;
    const authored = content.lessons.get(lessonId)!.quiz;
    const choices = authored.map((q, i) => {
      const right = shown.quiz[i].options.indexOf(q.options[q.answer]);
      if (i >= wrongCount) return right;
      return shown.quiz[i].options.findIndex((_: string, p: number) => p !== right);
    });
    const r = await call("POST", `/children/${kid}/lessons/${lessonId}/complete`, { choices }, fam);
    assert.equal(r.status, 200);
    return r.json;
  }

  test("needs the parent PIN, not just the family sign-in", async () => {
    const asChild = await call("GET", `/parent/children/${kid}/outcomes`, undefined, fam);
    assert.equal(asChild.status, 403);
    assert.equal(asChild.json.error, "parent_pin_required");
    assert.equal((await call("GET", `/parent/children/${kid}/outcomes`)).status, 401);
    assert.equal((await call("GET", `/parent/children/nobody/outcomes`, undefined, par)).status, 404);
  });

  test("starts with everything not started, listing outcome text and subject for the child's age group", async () => {
    const o = await outcomes();
    assert.equal(o.band, "b3");
    const cell = content.map.cells.filter((c) => c.band === "b3");
    const expected = cell.flatMap((c) => c.outcomes).filter((x) => !x.sensitive).length;
    assert.equal(o.outcomes.length, expected);
    assert.ok(o.outcomes.every((x: any) => x.status === "not_started"));
    const frac = o.outcomes.find((x: any) => x.id === "b3-math-2");
    assert.equal(frac.subject, "math");
    assert.ok(frac.text.length > 5);
    assert.ok(o.outcomes.every((x: any) => x.id.startsWith("b3-")), "only this age group");
    const math = o.subjects.find((s: any) => s.id === "math");
    assert.equal(math.strong + math.practising, 0);
    assert.ok(math.notStarted >= 1);
    // no answers or quiz content in this view
    const raw = JSON.stringify(o);
    assert.ok(!raw.includes('"answer"') && !raw.includes('"hints"') && !raw.includes('"explain"'));
  });

  test("an imperfect finish means practising; a later perfect finish means strong", async () => {
    await finish("b3-math-comparing-fractions", 1);
    let o = await outcomes();
    assert.equal(statusOf(o, "b3-math-2"), "practising");
    const math = o.subjects.find((s: any) => s.id === "math");
    assert.ok(math.practising >= 1);

    await finish("b3-math-comparing-fractions", 0);
    o = await outcomes();
    assert.equal(statusOf(o, "b3-math-2"), "strong");
    // a worse retry never takes it back
    await finish("b3-math-comparing-fractions", 2);
    assert.equal(statusOf(await outcomes(), "b3-math-2"), "strong");
    // other outcomes are untouched
    assert.equal(statusOf(o, "b3-sci-4"), "not_started");
  });

  test("a perfect first finish is strong straight away", async () => {
    await finish("b3-sci-water-cycle", 0);
    assert.equal(statusOf(await outcomes(), "b3-sci-4"), "strong");
  });

  test("locked sensitive outcomes and lessons are not disclosed until the topic is unlocked", async () => {
    let o = await outcomes();
    assert.equal(statusOf(o, "b3-world-5"), undefined, "religion outcome hidden");
    assert.equal(statusOf(o, "b3-health-5"), undefined, "body outcome hidden");
    assert.ok(!JSON.stringify(o).includes("religions"), "no hint of the locked text");
    const home = (await call("GET", `/children/${kid}/home`, undefined, fam)).json;
    assert.ok(!home.suggested.some((l: any) => l.sensitive), "no sensitive lesson suggested");

    // finishing it directly is refused while locked, so progress cannot leak either
    assert.equal((await call("POST", `/children/${kid}/lessons/b3-world-festivals-of-light/complete`, { choices: [0, 0, 0] }, fam)).status, 403);

    await call("PATCH", `/parent/children/${kid}`, { unlockedTopics: ["religion"] }, par);
    o = await outcomes();
    assert.equal(statusOf(o, "b3-world-5"), "not_started");
    assert.equal(statusOf(o, "b3-health-5"), undefined, "body is still locked");
    await finish("b3-world-festivals-of-light", 0);
    assert.equal(statusOf(await outcomes(), "b3-world-5"), "strong");

    // locking again hides it again
    await call("PATCH", `/parent/children/${kid}`, { unlockedTopics: [] }, par);
    assert.equal(statusOf(await outcomes(), "b3-world-5"), undefined);
  });

  test("a different child's progress does not leak in", async () => {
    const other = (await call("POST", "/parent/children", { nickname: "Bo", birthYear: year - 10 }, par)).json.child.id;
    const o = (await call("GET", `/parent/children/${other}/outcomes`, undefined, par)).json;
    assert.ok(o.outcomes.every((x: any) => x.status === "not_started"));
  });

  test("suggested: up to 3 unfinished lessons, without answers or urgency fields", async () => {
    const other = (await call("POST", "/parent/children", { nickname: "Cy", birthYear: year - 10 }, par)).json.child.id;
    const home = (await call("GET", `/children/${other}/home`, undefined, fam)).json;
    assert.equal(home.suggested.length, 3);
    for (const l of home.suggested) {
      assert.equal(l.reason, "new");
      assert.equal(l.band, "b3");
      assert.equal(l.sensitive, null);
      assert.deepEqual(Object.keys(l).sort(), ["band", "id", "minutes", "questions", "reason", "sensitive", "status", "subject", "title"]);
    }
    assert.equal(new Set(home.suggested.map((l: any) => l.id)).size, 3);
    const raw = JSON.stringify(home.suggested);
    assert.ok(!raw.includes('"answer"') && !raw.includes('"hints"') && !raw.includes('"explain"') && !raw.includes('"quiz"'));
  });

  test("suggested: review-due lessons come first, then practice, and mastered lessons are left out", async () => {
    const k = (await call("POST", "/parent/children", { nickname: "Di", birthYear: year - 10 }, par)).json.child.id;
    const fin = async (lessonId: string, wrongCount: number) => {
      const shown = (await call("GET", `/children/${k}/lessons/${lessonId}`, undefined, fam)).json.lesson;
      const choices = content.lessons.get(lessonId)!.quiz.map((q, i) => {
        const right = shown.quiz[i].options.indexOf(q.options[q.answer]);
        return i >= wrongCount ? right : shown.quiz[i].options.findIndex((_: string, p: number) => p !== right);
      });
      await call("POST", `/children/${k}/lessons/${lessonId}/complete`, { choices }, fam);
    };
    await fin("b3-math-comparing-fractions", 0); // strong
    await fin("b3-sci-water-cycle", 1); // practising
    let home = (await call("GET", `/children/${k}/home`, undefined, fam)).json;
    let ids = home.suggested.map((l: any) => l.id);
    assert.ok(!ids.includes("b3-math-comparing-fractions"), "a lesson with a perfect score is not suggested");
    assert.equal(ids.length, 3);
    const practise = home.suggested.find((l: any) => l.id === "b3-sci-water-cycle");
    assert.equal(practise?.reason, "practise", "an imperfect lesson can come back for practice");

    // make the perfect lesson due for review: it now leads the list, marked as review
    await db.run("UPDATE progress SET review_due = ? WHERE child_id = ? AND lesson_id = ?", [
      new Date(Date.now() - 86_400_000).toISOString(),
      k,
      "b3-math-comparing-fractions",
    ]);
    home = (await call("GET", `/children/${k}/home`, undefined, fam)).json;
    assert.equal(home.suggested[0].id, "b3-math-comparing-fractions");
    assert.equal(home.suggested[0].reason, "review");
    assert.ok(home.suggested.length <= 3);
    assert.equal(new Set(home.suggested.map((l: any) => l.id)).size, home.suggested.length, "no duplicates");
  });
});
