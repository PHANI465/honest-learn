// British and American spelling in the daily spelling practice. A family chooses (or its country suggests) how words that differ are
// spelled; a family with neither is only asked the words that are spelled the same. Progress is keyed by the American spelling so
// it survives a change of setting. See docs/SPELLING.md.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";
process.env.SHOW_DRAFTS = "true";

const { config } = await import("../src/config.ts");
const { openDb } = await import("../src/db.ts");
const usePg = process.env.TEST_DB === "pglite";
const { openPglite } = usePg ? await import("./pglite.ts") : { openPglite: null };
const { MemoryMailer } = await import("../src/mailer.ts");
const content = await import("../src/content.ts");
const { createApp, CONSENT_VERSION } = await import("../src/app.ts");
const { MockTutor } = await import("../src/tutor.ts");
const sp = await import("../src/spelling.ts");
const { spellingVariantFor } = await import("../src/models.ts");
const { pf, setPlatform } = await import("../src/platform.ts");
const { createNodePlatform } = await import("../src/platform-node.ts");
const { createPortablePlatform, contentFromFiles } = await import("../src/platform-portable.ts");

const original = pf();
after(() => setPlatform(original));
const real = content.loadContent(config.contentDir);
const today = new Date().toISOString().slice(0, 10);
const YEAR = new Date().getFullYear();

// ================================================================ the rules
describe("which spelling a family uses", () => {
  test("a country suggests one, a mixed or unknown country suggests none", () => {
    for (const c of ["US", "us", "PH"]) assert.equal(content.defaultSpellingVariant(c), "us", c);
    for (const c of ["GB", "UK", "IN", "AU", "NZ", "IE", "ZA"]) assert.equal(content.defaultSpellingVariant(c), "uk", c);
    for (const c of ["CA", "FR", "", null, undefined]) assert.equal(content.defaultSpellingVariant(c as string | null | undefined), null, String(c));
  });
  test("the parent's choice wins over the country; anything else falls back to the country", () => {
    assert.equal(spellingVariantFor("us", "GB"), "us");
    assert.equal(spellingVariantFor("uk", "US"), "uk");
    assert.equal(spellingVariantFor(null, "GB"), "uk");
    assert.equal(spellingVariantFor("klingon", "US"), "us", "an unknown stored value is ignored");
    assert.equal(spellingVariantFor(null, null), null);
  });
});

describe("words that differ (pure)", () => {
  const word = { word: "center", uk: "centre", level: 2, meaning: "the middle", sentence: "Stand in the center of the circle." };
  const plain = { word: "library", level: 1, meaning: "where books are kept", sentence: "We went to the library." };
  const set = { band: "b2", status: "draft", source: { title: "t", url: "https://example.org/", license: "l" }, words: [word, plain] } as never;

  test("without a known spelling the words that differ are left out", () => {
    assert.deepEqual(sp.usableWords(set, null).map((w) => w.word), ["library"]);
    assert.deepEqual(sp.usableWords(set, "uk").map((w) => w.word), ["center", "library"]);
    assert.deepEqual(sp.usableWords(set, "us").map((w) => w.word), ["center", "library"]);
  });
  test("the spelling, the other spelling and the sentence follow the family", () => {
    assert.equal(sp.spellingOf(word, "uk"), "centre");
    assert.equal(sp.spellingOf(word, "us"), "center");
    assert.equal(sp.otherSpelling(word, "uk"), "center");
    assert.equal(sp.otherSpelling(word, "us"), "centre");
    assert.equal(sp.otherSpelling(plain, "uk"), null);
    assert.equal(sp.sentenceFor(word, "uk"), "Stand in the centre of the circle.");
    assert.equal(sp.sentenceFor(word, "us"), "Stand in the center of the circle.");
    assert.equal(sp.sentenceFor(plain, "uk"), plain.sentence);
    assert.equal(sp.blankSentence(sp.sentenceFor(word, "uk"), "centre"), "Stand in the _____ of the circle.");
  });
  test("a wrong-spelling option never offers the other country's spelling", () => {
    for (let i = 0; i < 60; i++) {
      const [a, b] = sp.distractors("centre", `seed${i}`, ["center"]);
      assert.ok(a !== "center" && b !== "center", `seed${i}: ${a} ${b}`);
    }
    // the swap of the last two letters is exactly the American spelling, so without the guard it does turn up
    assert.ok(Array.from({ length: 60 }, (_, i) => sp.distractors("centre", `seed${i}`)).some(([a, b]) => a === "center" || b === "center"));
  });
  test("a word made of the same letters in both spellings is never an unscramble", () => {
    for (let i = 0; i < 40; i++) assert.notEqual(sp.activityFor("b3", "kid", `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, i, "centre", "center"), "unscramble");
    // a word whose spellings use different letters still can be
    const kinds = new Set(Array.from({ length: 80 }, (_, i) => sp.activityFor("b3", "kid", "2026-01-05", i, "colour", "color")));
    assert.ok(kinds.has("unscramble"));
  });
});

// ================================================================ the word lists
describe("the shipped word lists", () => {
  const sets = [...real.spelling.values()];
  const variants = sets.flatMap((s) => s.words.filter((w) => w.uk).map((w) => ({ band: s.band, ...w })));
  test("there are words that differ, in every age group, and each really differs", () => {
    assert.ok(variants.length >= 25, `${variants.length} words`);
    for (const set of sets) assert.ok(variants.some((w) => w.band === set.band), `none in ${set.band}`);
    for (const w of variants) assert.notEqual(w.uk, w.word);
  });
  test("neither spelling shows up in any other word's text, and no text mixes the two", () => {
    const all = variants.flatMap((w) => [w.word, w.uk!]);
    for (const set of sets) {
      for (const w of set.words) {
        const text = `${w.sentence} ${w.meaning} ${w.tip ?? ""}`;
        for (const spelling of all) {
          if (spelling === w.word || spelling === w.uk) continue;
          assert.ok(!new RegExp(`\\b${spelling}\\b`, "i").test(text), `${w.word}: "${spelling}" in the text`);
        }
        if (w.uk) assert.ok(!new RegExp(`\\b${w.uk}\\b`, "i").test(`${w.sentence} ${w.meaning}`), `${w.word}: the British spelling is in its own text`);
      }
    }
  });
  test("a word that differs has no tip, and its British spelling is not also a word of its own", () => {
    for (const set of sets) {
      const keys = new Set(set.words.map((w) => w.word));
      for (const w of set.words.filter((x) => x.uk)) {
        assert.equal(w.tip, undefined);
        assert.ok(!keys.has(w.uk!));
      }
    }
  });
});

describe("the validator", () => {
  /** The shipped content with extra words in the b3 list, loaded and validated like real content. */
  function load(extra: Record<string, unknown>[]) {
    const node = createNodePlatform();
    const files: Record<string, unknown> = {};
    for (const rel of ["knowledge-map.json", "resources.json", "helplines.json"]) files[rel] = node.content.readJson(config.contentDir, rel);
    for (const dir of ["lessons", "puzzles", "facts", "spelling", "chess"]) for (const rel of node.content.listJson(config.contentDir, dir)) files[rel] = node.content.readJson(config.contentDir, rel);
    const b3 = JSON.parse(JSON.stringify(files["spelling/b3.json"])) as { words: unknown[] };
    b3.words.push(...extra);
    files["spelling/b3.json"] = b3;
    setPlatform(createPortablePlatform({ content: contentFromFiles(files) }));
    try {
      return content.loadContent("fixture");
    } finally {
      setPlatform(original);
    }
  }
  const good = { word: "tire", uk: "tyre", level: 2, meaning: "the rubber ring around a wheel", sentence: "The bike has a flat tire." };
  test("a well-formed word that differs loads", () => {
    assert.ok(load([good]).spelling.get("b3")!.words.some((w) => w.uk === "tyre"));
  });
  test("a British spelling that is the same, or is also a word, is refused", () => {
    assert.throws(() => load([{ ...good, uk: "tire" }]), /British spelling that is the same/);
    assert.throws(() => load([{ word: "tyre", level: 1, meaning: "a rubber ring", sentence: "A tyre is round." }, good]), /listed as a word and as the British spelling/);
    assert.throws(() => load([good, { word: "tyre", level: 1, meaning: "a rubber ring", sentence: "A tyre is round." }]), /duplicate word tyre/);
  });
  test("the British spelling in a word's own text is refused", () => {
    assert.throws(() => load([{ ...good, sentence: "The bike has a flat tire, or tyre." }]), /contains the British spelling "tyre"/);
    assert.throws(() => load([{ ...good, meaning: "a tyre is the rubber ring around a wheel" }]), /meaning of "tire"|British spelling/);
  });
  test("either spelling in another word's text is refused", () => {
    assert.throws(() => load([good, { word: "wheel", level: 1, meaning: "it turns", sentence: "A wheel needs a tyre." }]), /spelled differently/);
    assert.throws(() => load([good, { word: "wheel", level: 1, meaning: "it turns", sentence: "A wheel needs a tire." }]), /spelled differently/);
    // and a word already in the lists is protected too: "color" turns up in someone's sentence
    assert.throws(() => load([{ word: "paint", level: 1, meaning: "you put it on a wall", sentence: "I chose a new color of paint." }]), /spelled differently/);
  });
  test("a tip on a word that differs is refused", () => {
    assert.throws(() => load([{ ...good, tip: "Think of a wheel." }]), /has no tip/);
  });
});

// ================================================================ what a child gets
async function family(opts: { country?: string | null; variant?: "uk" | "us" | null; age?: number } = {}) {
  const db = (openPglite ? openPglite() : openDb(":memory:")) as ReturnType<typeof openDb>;
  const app = createApp({ db, content: real, tutor: new MockTutor(), mailer: new MemoryMailer() });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : {}) as any };
  };
  const s = await call("POST", "/auth/signup", { email: `s${Math.random()}@example.com`, password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION, ...(opts.country ? { country: opts.country } : {}) });
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: YEAR - (opts.age ?? 9) }, par)).json.child.id as string;
  if (opts.variant !== undefined) await call("PATCH", "/parent/settings", { spellingVariant: opts.variant }, par);
  /** Fixes the day's words, so a test can ask for exactly the words it needs. */
  const setDay = (words: string[]) => db.run("INSERT INTO spelling_days (child_id, day, words) VALUES (?,?,?) ON CONFLICT (child_id, day) DO UPDATE SET words = excluded.words", [kid, today, JSON.stringify(words)]);
  const todayItems = async () => (await call("GET", `/children/${kid}/spelling/today?day=${today}`, undefined, fam)).json.items as any[];
  const check = (index: number, typed: string) => call("POST", `/children/${kid}/spelling/check`, { day: today, index, typed }, fam);
  return { call, fam, par, kid, db, setDay, todayItems, check };
}

describe("a family that uses British spelling", () => {
  test("is shown, hears and is checked against the British spelling", async () => {
    const f = await family({ country: "GB" });
    await f.setDay(["flavor", "library"]);
    const items = await f.todayItems();
    assert.equal(items.length, 2);
    assert.equal(items[0].say, "flavour");
    assert.equal(items[0].sentence.includes("flavo"), false, "the word is blanked out");
    assert.equal(items[0].sentence, items[0].sentence.replace(/flavou?r/i, "_____"));
    assert.ok(!JSON.stringify(items[0]).includes("flavor"), "the American spelling is not sent");
    const right = await f.check(0, " Flavour ");
    assert.equal(right.json.correct, true);
    assert.equal(right.json.word, "flavour");
  });
  test("the American spelling is wrong, and the child is told why", async () => {
    const f = await family({ country: "GB" });
    await f.setDay(["flavor"]);
    const wrong = await f.check(0, "flavor");
    assert.equal(wrong.json.correct, false);
    assert.equal(wrong.json.word, "flavour");
    assert.match(wrong.json.tip, /Americans spell it/);
    assert.match(wrong.json.tip, /British spelling/);
  });
  test("a multiple-choice exercise never offers the American spelling as a wrong answer, and a word with the same letters is never unscrambled", async () => {
    for (const [country, age, band] of [["GB", 9, "b3"], ["GB", 7, "b2"], ["US", 9, "b3"], ["US", 7, "b2"]] as const) {
      const f = await family({ country, age });
      const pairs = real.spelling.get(band)!.words.filter((w) => w.uk);
      // the same words in many positions: each position gets its own kind of exercise, so every kind turns up for every word
      await f.setDay(Array.from({ length: 30 }, () => pairs.map((w) => w.word)).flat());
      const seen = new Set<string>();
      for (const item of await f.todayItems()) {
        const pair = pairs.find((w) => (country === "GB" ? w.uk : w.word) === item.say)!;
        const [right, other] = country === "GB" ? [pair.uk!, pair.word] : [pair.word, pair.uk!];
        seen.add(item.activity);
        if (item.options) {
          assert.ok(item.options.includes(right), "the right spelling is there");
          assert.ok(!item.options.includes(other), `${other} offered as a wrong answer`);
        }
        if (item.activity === "unscramble") assert.notEqual([...right].sort().join(""), [...other].sort().join(""), `${right} cannot be unscrambled`);
      }
      assert.ok(seen.has("choose"), "the multiple-choice exercise was exercised");
    }
  });
});

describe("a family that uses American spelling", () => {
  test("is checked against the American spelling, and told why the British one is wrong", async () => {
    const f = await family({ country: "US" });
    await f.setDay(["flavor"]);
    assert.equal((await f.todayItems())[0].say, "flavor");
    const wrong = await f.check(0, "flavour");
    assert.equal(wrong.json.correct, false);
    assert.equal(wrong.json.word, "flavor");
    assert.match(wrong.json.tip, /British people spell it/);
    assert.match(wrong.json.tip, /American spelling/);
  });
});

describe("a family with no spelling and no country", () => {
  test("is only asked words that are spelled the same", async () => {
    const f = await family();
    await f.setDay(["flavor", "library", "harbor"]);
    const items = await f.todayItems();
    assert.equal(items.length, 1);
    assert.equal(items[0].say, "library");
    assert.equal((await f.check(0, "library")).json.correct, true);
    assert.equal((await f.check(1, "flavor")).status, 404, "positions count the words that can be asked");
  });
  test("whatever the day's words, no word that differs is ever sent", async () => {
    const f = await family({ age: 10 });
    for (const band of ["b3", "b4"]) {
      const set = real.spelling.get(band)!;
      await f.setDay(set.words.map((w) => w.word));
      const items = await f.todayItems();
      assert.ok(items.every((i) => !set.words.some((w) => w.uk && (i.say === w.word || i.say === w.uk))), band);
    }
  });
  test("a day's words picked from the full list never include one", async () => {
    for (const age of [4, 7, 10, 13, 16]) {
      const f = await family({ age });
      const items = await f.todayItems();
      const set = real.spelling.get(["b1", "b2", "b3", "b4", "b5"][[3, 6, 9, 12, 15].filter((a) => a <= age).length - 1]!)!;
      const differing = new Set(set.words.filter((w) => w.uk).flatMap((w) => [w.word, w.uk!]));
      assert.ok(items.length > 0);
      assert.ok(items.every((i) => !differing.has(i.say)), `age ${age}`);
    }
  });
});

describe("changing the setting", () => {
  test("the parent's choice wins over the country, and 'automatic' goes back to it", async () => {
    const f = await family({ country: "US", variant: "uk" });
    await f.setDay(["flavor"]);
    assert.equal((await f.todayItems())[0].say, "flavour");
    await f.call("PATCH", "/parent/settings", { spellingVariant: null }, f.par);
    assert.equal((await f.todayItems())[0].say, "flavor");
  });
  test("a word answered under one spelling stays answered under the other (one progress row, keyed by the American spelling)", async () => {
    const f = await family({ country: "GB" });
    await f.setDay(["flavor"]);
    assert.equal((await f.check(0, "flavour")).json.correct, true);
    await f.call("PATCH", "/parent/settings", { spellingVariant: "us" }, f.par);
    const rows = await f.db.all<{ word: string; box: number }>("SELECT word, box FROM spelling_progress WHERE child_id = ?", [f.kid]);
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ word: "flavor", box: 1 }]);
    const item = (await f.todayItems())[0];
    assert.equal(item.done, true);
    assert.equal(item.result.word, "flavor", "what is shown now uses the new spelling");
    assert.equal(item.result.correct, true);
  });
  test("switching during the day keeps the positions of the words that remain", async () => {
    const f = await family({ country: "GB" });
    await f.setDay(["flavor", "library", "harbor", "island"]);
    await f.call("PATCH", "/parent/settings", { spellingVariant: null, country: null }, f.par);
    const items = await f.todayItems();
    assert.deepEqual(items.map((i) => i.say), ["library", "island"]);
    assert.equal((await f.check(1, "island")).json.correct, true);
    assert.equal((await f.check(0, "library")).json.correct, true);
  });
  test("the parent's count of words only includes words that can be asked", async () => {
    const neutral = await family();
    const uk = await family({ country: "GB" });
    const total = async (f: Awaited<ReturnType<typeof family>>) => (await f.call("GET", `/parent/children/${f.kid}/spelling`, undefined, f.par)).json.total as number;
    const set = real.spelling.get("b3")!;
    assert.equal(await total(uk), set.words.length);
    assert.equal(await total(neutral), set.words.filter((w) => !w.uk).length);
  });
});

describe("the setting itself", () => {
  test("it is saved, shown in the overview, and kept when only the country changes", async () => {
    const f = await family({ country: "IN" });
    let o = (await f.call("GET", "/parent/overview", undefined, f.par)).json.settings;
    assert.deepEqual(o, { spellingVariant: null, spellingVariantNow: "uk", hasVariantWords: true });
    const saved = await f.call("PATCH", "/parent/settings", { spellingVariant: "us" }, f.par);
    assert.deepEqual([saved.status, saved.json.spellingVariant, saved.json.spellingVariantNow, saved.json.country], [200, "us", "us", "IN"]);
    const moved = await f.call("PATCH", "/parent/settings", { country: "FR" }, f.par);
    assert.deepEqual([moved.json.country, moved.json.spellingVariant], ["FR", "us"], "the choice stays");
    o = (await f.call("GET", "/parent/overview", undefined, f.par)).json.settings;
    assert.deepEqual(o, { spellingVariant: "us", spellingVariantNow: "us", hasVariantWords: true });
    const cleared = await f.call("PATCH", "/parent/settings", { spellingVariant: null }, f.par);
    assert.equal(cleared.json.spellingVariantNow, null, "France suggests none");
  });
  test("a country alone still works as before, and an empty or unknown request is refused", async () => {
    const f = await family();
    assert.equal((await f.call("PATCH", "/parent/settings", { country: "GB" }, f.par)).json.spellingVariantNow, "uk");
    assert.equal((await f.call("PATCH", "/parent/settings", { country: null }, f.par)).status, 200);
    for (const bad of [{}, { spellingVariant: "au" }, { spellingVariant: 1 }, { spellingVariant: "UK" }]) {
      assert.equal((await f.call("PATCH", "/parent/settings", bad, f.par)).status, 400, JSON.stringify(bad));
    }
  });
  test("only the parent area can change it, and it is in the data download", async () => {
    const f = await family({ variant: "uk" });
    assert.equal((await f.call("PATCH", "/parent/settings", { spellingVariant: "us" }, f.fam)).status, 403);
    assert.equal((await f.call("GET", "/parent/export", undefined, f.par)).json.parent.spellingVariant, "uk");
  });
});
