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
const sp = await import("../src/spelling.ts");

const content = loadContent(config.contentDir);

/** Today's date, plus a helper to move by whole days (the server accepts one day either side of UTC today). */
const today = new Date().toISOString().slice(0, 10);
const plus = (n: number) => sp.addDays(today, n);

async function setup(age = 9) {
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
  const s = await call("POST", "/auth/signup", { email: `s${Math.random()}@example.com`, password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION });
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: new Date().getFullYear() - age }, par)).json.child.id as string;
  return { call, fam, par, kid, db };
}

describe("spelling rules (pure)", () => {
  test("a correct spelling climbs the boxes and is due after 1, 3, 7, 16 days", () => {
    let st = { box: 0, due: "" };
    const gaps: number[] = [];
    for (let i = 0; i < 5; i++) {
      st = sp.nextState(st.box, true, "2026-01-01");
      gaps.push((Date.parse(st.due) - Date.parse("2026-01-01")) / 86_400_000);
    }
    assert.deepEqual(gaps, [1, 3, 7, 16, 16]); // stays in the top box
  });

  test("a miss sends the word to box 0, due tomorrow", () => {
    assert.deepEqual(sp.nextState(3, false, "2026-01-31"), { box: 0, due: "2026-02-01" });
  });

  test("words per day by age group", () => {
    assert.deepEqual(sp.WORDS_PER_DAY, { b1: 3, b2: 4, b3: 6, b4: 8, b5: 10 });
  });

  test("distractors, scrambles and gaps never equal the word", () => {
    for (const set of content.spelling.values()) {
      for (const w of set.words) {
        const [a, b] = sp.distractors(w.word, "seed");
        assert.notEqual(a, w.word);
        assert.notEqual(b, w.word);
        assert.notEqual(a, b);
        if (new Set(w.word).size > 1) assert.notEqual(sp.scramble(w.word, "s"), w.word);
        assert.equal(sp.scramble(w.word, "s").split("").sort().join(""), w.word.split("").sort().join(""));
        const g = sp.gapPattern(w.word, "s");
        assert.equal(g.length, w.word.length);
        assert.ok(g.includes("_"));
        assert.equal(g[0], w.word[0]);
      }
    }
  });

  test("the blanked sentence no longer contains the word", () => {
    for (const set of content.spelling.values()) {
      for (const w of set.words) assert.ok(!new RegExp(`\\b${w.word}\\b`, "i").test(sp.blankSentence(w.sentence, w.word)));
    }
  });

  test("new words come from level 1 until 80% of it is in box 2 or higher", () => {
    const set = content.spelling.get("b2")!;
    const l1 = set.words.filter((w) => w.level === 1).map((w) => w.word);
    const need = Math.ceil(l1.length * sp.LEVEL_UP_SHARE); // how many level 1 words make 80%
    const boxes = new Map(l1.slice(0, need - 1).map((w) => [w, 2])); // just under 80%
    assert.equal(sp.currentLevel(set.words, boxes), 1);
    boxes.set(l1[need - 1]!, 2); // 80%
    assert.equal(sp.currentLevel(set.words, boxes), 2);
  });
});

describe("daily spelling routes", () => {
  test("today gives the right number of words, with a meaning and a blanked sentence", async () => {
    const { call, fam, kid } = await setup(9); // band b3: 6 words a day
    const r = await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam);
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 6);
    for (const it of r.json.items) {
      assert.ok(it.meaning && it.sentence.includes("_____"));
      assert.equal(it.done, false);
      assert.equal(it.result, undefined);
      assert.equal(typeof it.say, "string"); // audio only, by the owner's choice (see routes/spelling.ts)
      assert.equal(it.word, undefined);
      // the clues (meaning and sentence) never contain the word; the exercise's own options, letters or gaps are part of the game
      for (const clue of [it.meaning, it.sentence]) assert.ok(!new RegExp(`\\b${it.say}\\b`, "i").test(clue), `${it.say} leaked in a clue`);
    }
  });

  test("the set is the same when reloaded, and after answering", async () => {
    const { call, fam, kid } = await setup(9);
    const a = await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam);
    const b = await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam);
    assert.deepEqual(a.json.items.map((i: any) => i.say), b.json.items.map((i: any) => i.say));
    await call("POST", `/children/${kid}/spelling/check`, { day: today, index: 0, typed: a.json.items[0].say }, fam);
    const c = await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam);
    assert.equal(c.json.items.length, a.json.items.length);
    assert.equal(c.json.items[0].done, true);
    assert.equal(c.json.items[0].result.correct, true);
    assert.equal(c.json.items[0].result.word, a.json.items[0].say);
    assert.equal(c.json.items[0].say, null); // once tried, the spelling is in `result` instead
    assert.equal(c.json.doneCount, 1);
  });

  test("a different child gets a different set (seeded by child and day)", async () => {
    const a = await setup(9);
    const b = await setup(9);
    const x = (await a.call("GET", `/children/${a.kid}/spelling/today?day=${today}`, undefined, a.fam)).json.items.map((i: any) => i.say).join();
    const y = (await b.call("GET", `/children/${b.kid}/spelling/today?day=${today}`, undefined, b.fam)).json.items.map((i: any) => i.say).join();
    assert.notEqual(x, y);
  });

  test("a wrong try reveals the word, cannot be redone for credit, and brings the word back tomorrow", async () => {
    const { call, fam, kid } = await setup(9);
    const t = (await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam)).json.items;
    const word = t[0].say as string;
    const miss = await call("POST", `/children/${kid}/spelling/check`, { day: today, index: 0, typed: "zzz" }, fam);
    assert.equal(miss.json.correct, false);
    assert.equal(miss.json.word, word);
    const again = await call("POST", `/children/${kid}/spelling/check`, { day: today, index: 0, typed: word }, fam);
    assert.equal(again.json.already, true);
    assert.equal(again.json.correct, false);
    const tomorrow = await call("GET", `/children/${kid}/spelling/today?day=${plus(1)}`, undefined, fam);
    assert.equal(tomorrow.status, 200);
    assert.equal(tomorrow.json.items[0].say, word);
  });

  test("a correct try ignores capital letters and spaces around the word", async () => {
    const { call, fam, kid } = await setup(9);
    const t = (await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam)).json.items;
    const r = await call("POST", `/children/${kid}/spelling/check`, { day: today, index: 1, typed: `  ${(t[1].say as string).toUpperCase()} ` }, fam);
    assert.equal(r.json.correct, true);
  });

  test("a word spelled right is due again the next day (box 1), not never", async () => {
    const { call, fam, kid } = await setup(9);
    const t = (await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam)).json.items;
    await call("POST", `/children/${kid}/spelling/check`, { day: today, index: 0, typed: t[0].say }, fam);
    const tomorrow = (await call("GET", `/children/${kid}/spelling/today?day=${plus(1)}`, undefined, fam)).json.items.map((i: any) => i.say);
    assert.ok(tomorrow.includes(t[0].say));
  });

  test("bad input is refused", async () => {
    const { call, fam, kid } = await setup(9);
    assert.equal((await call("GET", `/children/${kid}/spelling/today?day=nope`, undefined, fam)).status, 400);
    assert.equal((await call("GET", `/children/${kid}/spelling/today?day=${plus(20)}`, undefined, fam)).status, 400);
    await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam);
    assert.equal((await call("POST", `/children/${kid}/spelling/check`, { day: today, index: 99, typed: "x" }, fam)).status, 400);
    assert.equal((await call("POST", `/children/${kid}/spelling/check`, { day: today, index: 40, typed: "x" }, fam)).status, 404);
    assert.equal((await call("POST", `/children/${kid}/spelling/check`, { day: today, index: 0, typed: "x".repeat(100) }, fam)).status, 400);
  });

  test("needs sign-in, and a child cannot be reached from another family", async () => {
    const a = await setup(9);
    const b = await setup(9);
    assert.equal((await a.call("GET", `/children/${a.kid}/spelling/today?day=${today}`)).status, 401);
    assert.equal((await b.call("GET", `/children/${a.kid}/spelling/today?day=${today}`, undefined, b.fam)).status, 404);
    assert.equal((await b.call("POST", `/children/${a.kid}/spelling/check`, { day: today, index: 0, typed: "x" }, b.fam)).status, 404);
  });

  test("the parent sees words learned; progress is in the export and removed with the child", async () => {
    const { call, fam, par, kid, db } = await setup(9);
    const t = (await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam)).json.items;
    await call("POST", `/children/${kid}/spelling/check`, { day: today, index: 0, typed: t[0].say }, fam);
    const before = await call("GET", `/parent/children/${kid}/spelling`, undefined, par);
    assert.equal(before.json.practising, 1);
    assert.equal(before.json.learned, 0);
    assert.equal((await call("GET", `/parent/children/${kid}/spelling`, undefined, fam)).status, 403);
    const exp = await call("GET", "/parent/export", undefined, par);
    assert.equal(exp.json.spellingProgress.length, 1);
    await call("DELETE", `/parent/children/${kid}`, undefined, par);
    assert.equal((await db.all("SELECT * FROM spelling_progress WHERE child_id = ?", [kid])).length, 0);
    assert.equal((await db.all("SELECT * FROM spelling_days WHERE child_id = ?", [kid])).length, 0);
  });

  test("words reaching box 2 unlock the next level", async () => {
    const { call, fam, kid, db } = await setup(9);
    const set = content.spelling.get("b3")!;
    const l1 = set.words.filter((w) => w.level === 1);
    for (const w of l1.slice(0, Math.ceil(l1.length * sp.LEVEL_UP_SHARE))) {
      await db.run("INSERT INTO spelling_progress (child_id, word, box, due, last_day) VALUES (?,?,?,?,?)", [kid, w.word, 2, plus(30), plus(-1)]);
    }
    const r = await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam);
    const levels = r.json.items.map((i: any) => set.words.find((w) => w.word === i.say)!.level);
    assert.ok(levels.every((l: number) => l >= 2), `expected only level 2 or 3 words, got ${levels}`);
  });
});
