// Sign language lessons (task T9). No real sign language content exists yet: a person must choose and approve every video (see
// docs/SIGN_LANGUAGE.md). These tests use FIXTURE lessons built inside the test and check everything around them: the child's
// sign language (the parent's choice or the country's default), which lessons a child sees, the validator rules that keep the
// reviewer's record complete, and the quiz length rule.
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
const { createApp, CONSENT_VERSION } = await import("../src/app.ts");
const { MockTutor } = await import("../src/tutor.ts");
const content = await import("../src/content.ts");
const { pf, setPlatform } = await import("../src/platform.ts");
const { createNodePlatform } = await import("../src/platform-node.ts");
const { createPortablePlatform, contentFromFiles } = await import("../src/platform-portable.ts");

const original = pf();
after(() => setPlatform(original));

// ---------------------------------------------------------------- fixtures
const YEAR = new Date().getFullYear();
const question = (n: number) => ({
  q: `Fixture question ${n}: which handshape starts the sign?`,
  options: ["Fixture right answer", "Fixture wrong one", "Fixture wrong two"],
  answer: 0,
  hints: [`Fixture hint one ${n}`, `Fixture hint two ${n}`, `Fixture hint three ${n}`],
  explain: `Fixture explanation ${n}`,
});
interface Overrides {
  id?: string;
  signLanguage?: "asl" | "bsl" | "isl" | "lsm";
  status?: "draft" | "reviewed";
  video?: Record<string, unknown> | null;
  questions?: number;
  text?: boolean;
  signReviewer?: unknown;
  signVideoId?: string;
}
function signLesson(o: Overrides = {}) {
  const video =
    o.video === null
      ? []
      : [{ type: "video", body: "Fixture video caption", videoId: "abcdefghijk", videoMinutes: 1.5, videoChannel: "Fixture Deaf Association", videoLicence: "Fixture permission, 2026-11-15", videoCheckedOn: "2026-11-15", ...o.video }];
  return {
    id: o.id ?? "test-sign-greetings-asl",
    title: "Fixture: greetings",
    band: "b3",
    subject: "sign",
    outcomes: ["b3-sign-1"],
    sensitive: null,
    minutes: 8,
    status: o.status ?? "draft",
    reviewers: o.status === "reviewed" ? [{ initials: "AA", role: "teacher", date: "2026-11-15" }, { initials: "BB", role: "teacher", date: "2026-11-15" }] : [],
    sources: [{ title: "Fixture", url: "https://example.org/", license: "Fixture" }],
    sections: [{ type: "text", body: "Fixture introduction" }, ...video, ...(o.text === false ? [] : [{ type: "text", body: "Fixture: the sign in words" }])].slice(o.text === false ? 1 : 0),
    quiz: Array.from({ length: o.questions ?? 2 }, (_, i) => question(i + 1)),
    ...(o.signLanguage === undefined ? { signLanguage: "asl" } : { signLanguage: o.signLanguage }),
    ...(o.signReviewer ? { signReviewer: o.signReviewer } : {}),
    ...(o.signVideoId ? { signVideoId: o.signVideoId } : {}),
  };
}
/** The shipped content plus a "sign" subject and the given fixture lessons, loaded and validated like real content. */
function load(lessons: ReturnType<typeof signLesson>[]) {
  const node = createNodePlatform();
  const files: Record<string, unknown> = {};
  const add = (rel: string) => (files[rel] = node.content.readJson(config.contentDir, rel));
  for (const rel of ["knowledge-map.json", "resources.json", "helplines.json"]) add(rel);
  for (const dir of ["lessons", "puzzles", "facts", "spelling", "chess"]) for (const rel of node.content.listJson(config.contentDir, dir)) add(rel);
  const map = files["knowledge-map.json"] as { subjects: unknown[]; cells: unknown[] };
  map.subjects.push({ id: "sign", name: "Sign language", icon: "🤟" });
  map.cells.push({ band: "b3", subject: "sign", outcomes: [{ id: "b3-sign-1", text: "Fixture outcome" }] });
  for (const l of lessons) files[`lessons/b3/sign/${l.id}.json`] = l;
  setPlatform(createPortablePlatform({ content: contentFromFiles(files) }));
  try {
    return content.loadContent("fixture");
  } finally {
    setPlatform(original);
  }
}
const rejects = (lessons: ReturnType<typeof signLesson>[], pattern: RegExp) => assert.throws(() => load(lessons), pattern);

// ================================================================ the quiz length rule
describe("the quiz after a sign language video", () => {
  test("2 questions under 2 minutes, 3 for 2 to 5, 4 for 5 to 10, 5 for longer", () => {
    const cases: [number, number][] = [[0.5, 2], [1.9, 2], [2, 3], [4.9, 3], [5, 4], [9.9, 4], [10, 5], [20, 5]];
    for (const [minutes, questions] of cases) assert.equal(content.signQuizLength(minutes), questions, `${minutes} minutes`);
  });
});

// ================================================================ what the validator demands
describe("the validator keeps the reviewer's record complete", () => {
  test("a complete sign language lesson loads", () => {
    const store = load([signLesson()]);
    assert.equal(store.lessons.get("test-sign-greetings-asl")!.signLanguage, "asl");
  });
  test("a longer video needs more questions", () => {
    assert.doesNotThrow(() => load([signLesson({ video: { videoMinutes: 3 }, questions: 3 })]));
    assert.doesNotThrow(() => load([signLesson({ video: { videoMinutes: 7 }, questions: 4 })]));
    assert.doesNotThrow(() => load([signLesson({ video: { videoMinutes: 12 }, questions: 5 })]));
    rejects([signLesson({ video: { videoMinutes: 3 }, questions: 2 })], /3 minutes of video needs 3 quiz questions/);
    rejects([signLesson({ video: { videoMinutes: 1.5 }, questions: 3 })], /needs 2 quiz questions/);
  });
  test("a video must say who made it, its licence, when it was checked and how long it is", () => {
    for (const field of ["videoChannel", "videoLicence", "videoCheckedOn", "videoMinutes"]) {
      rejects([signLesson({ video: { [field]: undefined } })], new RegExp(`needs ${field}`));
    }
  });
  test("it needs a video, and a text section that describes the signs in words", () => {
    rejects([signLesson({ video: null })], /needs a video section/);
    rejects([signLesson({ text: false })], /describes each sign in words/);
  });
  test("it can only be reviewed with a Deaf signer or a qualified teacher named", () => {
    rejects([signLesson({ status: "reviewed" })], /needs a signReviewer/);
    assert.doesNotThrow(() => load([signLesson({ status: "reviewed", signReviewer: { name: "Fixture Reviewer", role: "deaf-signer", date: "2026-11-15" } })]));
    assert.doesNotThrow(() => load([signLesson({ status: "reviewed", signReviewer: { name: "Fixture Reviewer", role: "qualified-teacher", date: "2026-11-15" } })]));
    rejects([signLesson({ status: "reviewed", signReviewer: { name: "Fixture Reviewer", role: "friend", date: "2026-11-15" } })], /signReviewer/);
  });
  test("an unknown sign language is refused", () => {
    rejects([signLesson({ signLanguage: "xyz" as never })], /signLanguage/);
  });
  test("the 'watch in sign language' slot is just an optional video id on any lesson", () => {
    assert.doesNotThrow(() => load([signLesson({ signVideoId: "ZYXWVUTSRQP" })]));
    rejects([signLesson({ signVideoId: "short" })], /11-character YouTube id/);
  });
  test("lessons with no sign language are not held to any of these rules", () => {
    const store = load([]);
    assert.ok(store.lessons.size > 200);
    assert.ok([...store.lessons.values()].every((l) => l.signLanguage === undefined));
  });
});

// ================================================================ the default from the country
describe("the sign language a family's country suggests", () => {
  test("US, UK, IN and MX; anything else, or no country, suggests none", () => {
    assert.equal(content.defaultSignLanguage("US"), "asl");
    assert.equal(content.defaultSignLanguage("gb"), "bsl");
    assert.equal(content.defaultSignLanguage("UK"), "bsl");
    assert.equal(content.defaultSignLanguage("IN"), "isl");
    assert.equal(content.defaultSignLanguage("MX"), "lsm");
    for (const c of ["FR", "", null, undefined]) assert.equal(content.defaultSignLanguage(c as string | null | undefined), null);
  });
});

// ================================================================ what a child sees
async function family(country: string | null) {
  const store = load([signLesson(), signLesson({ id: "test-sign-greetings-bsl", signLanguage: "bsl" }), signLesson({ id: "test-sign-greetings-isl", signLanguage: "isl" })]);
  const db = openPglite ? openPglite() : openDb(":memory:");
  const app = createApp({ db, content: store, tutor: new MockTutor(), mailer: new MemoryMailer() });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : {}) as any };
  };
  const s = await call("POST", "/auth/signup", { email: `s${Math.random()}@example.com`, password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION, ...(country ? { country } : {}) });
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: YEAR - 9 }, par)).json.child.id as string;
  const signLessons = async () => ((await call("GET", `/children/${kid}/lessons?subject=sign`, undefined, fam)).json.lessons as { id: string }[] | undefined)?.filter((l) => l.id.startsWith("test-sign-")).map((l) => l.id) ?? [];
  return { call, fam, par, kid, signLessons };
}

describe("which sign language lessons a child sees", () => {
  test("by default the one the family's country suggests, and nothing for a country with none", async () => {
    assert.deepEqual(await (await family("US")).signLessons(), ["test-sign-greetings-asl"]);
    assert.deepEqual(await (await family("GB")).signLessons(), ["test-sign-greetings-bsl"]);
    assert.deepEqual(await (await family("IN")).signLessons(), ["test-sign-greetings-isl"]);
    assert.deepEqual(await (await family("FR")).signLessons(), []);
    assert.deepEqual(await (await family(null)).signLessons(), []);
  });

  test("the parent's choice wins over the country, and 'automatic' (null) goes back to the country", async () => {
    const f = await family("US");
    const set = async (value: string | null) => (await f.call("PATCH", `/parent/children/${f.kid}`, { signLanguage: value }, f.par));
    const r = await set("bsl");
    assert.equal(r.status, 200);
    assert.equal(r.json.child.signLanguage, "bsl");
    assert.equal(r.json.child.signLanguageChoice, "bsl");
    assert.deepEqual(await f.signLessons(), ["test-sign-greetings-bsl"]);
    const auto = await set(null);
    assert.equal(auto.json.child.signLanguage, "asl", "the country's default again");
    assert.equal(auto.json.child.signLanguageChoice, null);
    assert.deepEqual(await f.signLessons(), ["test-sign-greetings-asl"]);
    // a country with no default: the parent's choice is all there is
    const fr = await family("FR");
    await fr.call("PATCH", `/parent/children/${fr.kid}`, { signLanguage: "isl" }, fr.par);
    assert.deepEqual(await fr.signLessons(), ["test-sign-greetings-isl"]);
  });

  test("changing the family's country changes the default, but not a choice the parent made", async () => {
    const f = await family("US");
    await f.call("PATCH", "/parent/settings", { country: "MX" }, f.par);
    const kids = (await f.call("GET", "/family", undefined, f.fam)).json.children;
    assert.equal(kids[0].signLanguage, "lsm");
    await f.call("PATCH", `/parent/children/${f.kid}`, { signLanguage: "bsl" }, f.par);
    await f.call("PATCH", "/parent/settings", { country: "IN" }, f.par);
    assert.equal((await f.call("GET", "/family", undefined, f.fam)).json.children[0].signLanguage, "bsl");
  });

  test("a lesson in another sign language cannot be opened by id either", async () => {
    const f = await family("US");
    const mine = await f.call("GET", `/children/${f.kid}/lessons/test-sign-greetings-asl`, undefined, f.fam);
    assert.equal(mine.status, 200);
    const other = await f.call("GET", `/children/${f.kid}/lessons/test-sign-greetings-bsl`, undefined, f.fam);
    assert.ok(other.status === 403 || other.status === 404, `refused, got ${other.status}`);
    assert.equal(other.json.lesson, undefined);
  });

  test("only the parent area can set it, and only to a known language", async () => {
    const f = await family("US");
    assert.equal((await f.call("PATCH", `/parent/children/${f.kid}`, { signLanguage: "bsl" }, f.fam)).status, 403);
    assert.equal((await f.call("PATCH", `/parent/children/${f.kid}`, { signLanguage: "klingon" }, f.par)).status, 400);
  });

  test("the sign language and the choice are in the data download", async () => {
    const f = await family("GB");
    await f.call("PATCH", `/parent/children/${f.kid}`, { signLanguage: "asl" }, f.par);
    const exp = (await f.call("GET", "/parent/export", undefined, f.par)).json;
    assert.equal(exp.children[0].signLanguage, "asl");
    assert.equal(exp.children[0].signLanguageChoice, "asl");
  });

  test("the content map says which sign languages have lessons (none in the shipped content yet)", async () => {
    const f = await family("US");
    assert.deepEqual((await f.call("GET", "/content/map")).json.signLanguages, ["asl", "bsl", "isl"]);
    const shipped = createApp({ db: openDb(":memory:"), content: content.loadContent(config.contentDir), tutor: new MockTutor(), mailer: new MemoryMailer() });
    assert.deepEqual(((await (await shipped.request("/content/map")).json()) as { signLanguages: string[] }).signLanguages, []);
  });

  test("the 'watch in sign language' video id reaches the app with its lesson", async () => {
    const store = load([signLesson({ signVideoId: "ZYXWVUTSRQP" })]);
    assert.equal(content.publicLesson(store.lessons.get("test-sign-greetings-asl")!).signVideoId, "ZYXWVUTSRQP");
  });
});
