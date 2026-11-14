// Bring your own model (TUTOR_MODE=openai): the provider for Ollama and other OpenAI-compatible servers.
// A fake model server stands in for the real one, so these tests need no AI and no internet.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";
process.env.SHOW_DRAFTS = "true";

const { config } = await import("../src/config.ts");
const { loadContent } = await import("../src/content.ts");
const { OpenAICompatTutor, parseVerdict, fixedChecks, localModelAddendum } = await import("../src/tutor-openai.ts");
const { safeHint } = await import("../src/tutor.ts");
type TutorRequest = import("../src/tutor.ts").TutorRequest;

const content = loadContent(config.contentDir);
const lesson = content.lessons.get("b3-math-comparing-fractions")!;
const q = lesson.quiz[0]!;
const base: TutorRequest = { band: "b3", nickname: "Ria", lesson, questionIndex: 0, questionSolved: false, history: [], message: "help me" };
const opts = { baseUrl: "http://model.test/v1/", apiKey: "sk-test-key", model: "tiny", safetyModel: "tiny-judge", timeoutMs: 5000 };
const OK_VERDICT = '{"safe_for_age": true, "reveals_answer": false, "reason": "fine"}';

/** A fake model server: answers the first call with `draft` and the second with `verdict`. Records every request. */
function fake(draft: string, verdict: string | Error) {
  const calls: { url: string; body: any; auth: string | null }[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("authorization") });
    const text = calls.length === 1 ? draft : verdict;
    if (text instanceof Error) throw text;
    return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }));
  };
  return { tutor: new OpenAICompatTutor(fetcher, opts), calls };
}

describe("own model: request shape", () => {
  test("calls /chat/completions with the key, the chosen models and the rules last in the system message", async () => {
    const { tutor, calls } = fake("What do you notice about the bottom numbers?", OK_VERDICT);
    const r = await tutor.reply(base);
    assert.deepEqual(r, { reply: "What do you notice about the bottom numbers?", flag: null });
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.url, "http://model.test/v1/chat/completions");
    assert.equal(calls[0]!.auth, "Bearer sk-test-key");
    assert.equal(calls[0]!.body.model, "tiny");
    assert.equal(calls[1]!.body.model, "tiny-judge");
    const system = calls[0]!.body.messages[0].content as string;
    assert.ok(system.includes("SECRET"), "the lesson context is included");
    assert.ok(system.trimEnd().endsWith(localModelAddendum(base).trimEnd()), "the reminder rules come last");
    assert.equal(calls[0]!.body.messages.at(-1).content, "help me");
  });

  test("no key means no Authorization header (local Ollama)", async () => {
    const calls: (string | null)[] = [];
    const tutor = new OpenAICompatTutor(
      async (_url, init) => {
        calls.push(new Headers(init?.headers).get("authorization"));
        return new Response(JSON.stringify({ choices: [{ message: { content: calls.length === 1 ? "Think about the pieces." : OK_VERDICT } }] }));
      },
      { ...opts, apiKey: "" },
    );
    assert.equal((await tutor.reply(base)).flag, null);
    assert.deepEqual(calls, [null, null]);
  });
});

describe("own model: protections that do not trust the model", () => {
  const hint = safeHint(base);

  test("a reply that names only the correct option is replaced, without asking the judge", async () => {
    const { tutor, calls } = fake(`The answer is ${q.options[q.answer]}.`, OK_VERDICT);
    assert.deepEqual(await tutor.reply(base), { reply: hint, flag: "answer_leak" });
    assert.equal(calls.length, 1);
  });

  test("a reply with a link is replaced", async () => {
    const { tutor } = fake("Look it up at https://example.com/fractions", OK_VERDICT);
    assert.deepEqual(await tutor.reply(base), { reply: hint, flag: "unsafe_reply" });
  });

  test("a very long reply is replaced", async () => {
    const { tutor } = fake("Think. ".repeat(200), OK_VERDICT);
    assert.equal((await tutor.reply(base)).flag, "unsafe_reply");
  });

  test("the judge's verdict is obeyed", async () => {
    assert.equal((await fake("Try again.", '{"safe_for_age": false, "reveals_answer": false, "reason": "x"}').tutor.reply(base)).flag, "unsafe_reply");
    assert.equal((await fake("Try again.", '{"safe_for_age": true, "reveals_answer": true, "reason": "x"}').tutor.reply(base)).flag, "answer_leak");
    // after the question is solved, explaining the answer is allowed
    assert.equal((await fake("Try again.", '{"safe_for_age": true, "reveals_answer": true, "reason": "x"}').tutor.reply({ ...base, questionSolved: true })).flag, null);
  });

  test("fails closed: an unreadable verdict, a failed check or a failed call all give the pre-written hint", async () => {
    assert.deepEqual(await fake("Try again.", "Looks fine to me!").tutor.reply(base), { reply: hint, flag: "error" });
    assert.deepEqual(await fake("Try again.", new Error("timeout")).tutor.reply(base), { reply: hint, flag: "error" });
    const down = new OpenAICompatTutor(async () => new Response("no such model", { status: 404 }), opts);
    assert.deepEqual(await down.reply(base), { reply: hint, flag: "error" });
    assert.deepEqual(await fake("", OK_VERDICT).tutor.reply(base), { reply: hint, flag: "error" });
  });

  test("private reasoning in <think> tags never reaches the child", async () => {
    const { tutor } = fake("<think>the answer is obviously the first one</think>What do the top numbers tell you?", OK_VERDICT);
    assert.equal((await tutor.reply(base)).reply, "What do the top numbers tell you?");
  });
});

describe("own model: helpers", () => {
  test("parseVerdict reads JSON wrapped in text or a code block, and refuses anything else", () => {
    assert.deepEqual(parseVerdict('Sure! ```json\n{"safe_for_age": true, "reveals_answer": false, "reason": "ok"}\n```'), { safe_for_age: true, reveals_answer: false });
    assert.equal(parseVerdict('{"safe_for_age": "yes", "reveals_answer": false}'), null);
    assert.equal(parseVerdict("safe"), null);
    assert.equal(parseVerdict("{not json}"), null);
  });

  test("fixedChecks lets an ordinary hint through", () => {
    assert.equal(fixedChecks(base, "Compare the size of each piece first."), null);
  });

  test("the reminder changes once the question is solved", () => {
    assert.match(localModelAddendum(base), /has NOT solved/);
    assert.doesNotMatch(localModelAddendum({ ...base, questionSolved: true }), /has NOT solved/);
  });
});
