// The facts kept on the device for offline use. The rules live in app/src/lib/fact-pool.ts (no React Native imports) and are tested
// here because the app has no test runner. The two that matter most: a fact behind a parent's unlock is never kept, and what is read
// back from storage is checked before it is shown.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { asFact, keepable, MAX_POOLED_FACTS, mergePool, pickOffline, readPool, type PooledFact } from "../../app/src/lib/fact-pool.ts";

const fact = (n: number, extra: Record<string, unknown> = {}): PooledFact => ({
  id: `b3-t${n}`,
  subject: "science",
  text: `Test fact number ${n} is here.`,
  source: { title: `Wikipedia: Test ${n}`, url: `https://en.wikipedia.org/wiki/Test_${n}` },
  ...extra,
});
const many = (n: number, from = 1) => Array.from({ length: n }, (_, i) => fact(from + i));
const ids = (facts: readonly PooledFact[]) => facts.map((f) => f.id);

describe("a fact", () => {
  test("is accepted exactly as the server sends it, and only those fields are kept", () => {
    assert.deepEqual(asFact(fact(1, { sensitive: null, extra: "x", __proto__: { polluted: 1 } })), fact(1));
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });
  test("anything else is refused", () => {
    const good = fact(1);
    const bad: unknown[] = [
      null, undefined, "", "fact", 7, [], {},
      { ...good, id: "" }, { ...good, id: "Has Capitals" }, { ...good, id: "a".repeat(61) }, { ...good, id: 5 },
      { ...good, subject: "" }, { ...good, subject: "x".repeat(41) }, { ...good, subject: null },
      { ...good, text: "short" }, { ...good, text: "x".repeat(301) }, { ...good, text: 12 },
      { ...good, source: null }, { ...good, source: "https://x.org" }, { ...good, source: { title: "", url: "https://x.org" } },
      { ...good, source: { title: "t", url: "http://x.org" } }, { ...good, source: { title: "t", url: "javascript:alert(1)" } },
      { ...good, source: { title: "t", url: "data:text/html,hi" } }, { ...good, source: { title: "t", url: "https://x.org/" + "a".repeat(500) } },
      { ...good, source: { title: "t".repeat(201), url: "https://x.org" } },
    ];
    for (const x of bad) assert.equal(asFact(x), null, JSON.stringify(x));
  });
});

describe("what may be kept", () => {
  test("a fact behind a parent's unlock is never kept", () => {
    for (const topic of ["religion", "body", "politics", "anything"]) assert.equal(keepable(fact(1, { sensitive: topic })), null, topic);
    assert.deepEqual(keepable(fact(1, { sensitive: null })), fact(1));
    assert.deepEqual(keepable(fact(1)), fact(1));
  });
  test("an invalid fact is not kept either", () => {
    assert.equal(keepable({ id: "b3-x" }), null);
    assert.equal(keepable(null), null);
  });
});

describe("merging new facts into the saved ones", () => {
  test("new facts go first, each fact once, and nothing is changed in place", () => {
    const old = many(3, 1);
    const copy = JSON.stringify(old);
    const merged = mergePool(old, [fact(3), fact(4), fact(5)]);
    assert.deepEqual(ids(merged), ["b3-t3", "b3-t4", "b3-t5", "b3-t1", "b3-t2"]);
    assert.equal(JSON.stringify(old), copy);
  });
  test("at most 40 are kept: the oldest go", () => {
    const merged = mergePool(many(MAX_POOLED_FACTS), many(10, 100));
    assert.equal(merged.length, MAX_POOLED_FACTS);
    assert.deepEqual(ids(merged.slice(0, 3)), ["b3-t100", "b3-t101", "b3-t102"]);
    assert.ok(!ids(merged).includes(`b3-t${MAX_POOLED_FACTS}`));
    assert.equal(mergePool([], many(500)).length, MAX_POOLED_FACTS);
  });
  test("a fact behind a parent's unlock or a damaged one is left out, however it arrives", () => {
    const merged = mergePool([fact(1)], [fact(2, { sensitive: "religion" }), { id: "b3-bad" }, null, "x", fact(3)]);
    assert.deepEqual(ids(merged), ["b3-t3", "b3-t1"]);
  });
  test("an empty batch changes nothing", () => {
    assert.deepEqual(mergePool(many(3), []), many(3));
    assert.deepEqual(mergePool([], []), []);
  });
});

describe("reading the saved facts back", () => {
  const pool = (facts: unknown[], band = "b3") => ({ band, facts });
  test("works from text or an object, and gives back the facts in order", () => {
    assert.deepEqual(ids(readPool(JSON.stringify(pool(many(4))), "b3")), ["b3-t1", "b3-t2", "b3-t3", "b3-t4"]);
    assert.deepEqual(ids(readPool(pool(many(2)), "b3")), ["b3-t1", "b3-t2"]);
  });
  test("facts saved for another age group are not used", () => {
    assert.deepEqual(readPool(pool(many(4), "b2"), "b3"), []);
    assert.deepEqual(readPool(pool(many(4), "b3"), "b4"), []);
  });
  test("damaged or edited storage gives an empty list, never an error", () => {
    for (const raw of [null, undefined, "", "not json", "[]", "{}", 7, true, "null", { band: "b3" }, { band: "b3", facts: "x" }, { band: "b3", facts: {} }, { facts: many(2) }]) {
      assert.deepEqual(readPool(raw, "b3"), [], JSON.stringify(raw));
    }
  });
  test("each fact is checked: bad ones are skipped, duplicates collapse, the list is capped", () => {
    const messy = pool([fact(1), { ...fact(2), source: { title: "t", url: "http://insecure.example" } }, null, fact(1), "x", fact(3, { sensitive: "x" })]);
    // a saved sensitive flag is not part of the stored shape: asFact drops it, so such a fact would only be here if it was saved wrongly
    assert.deepEqual(ids(readPool(messy, "b3")), ["b3-t1", "b3-t3"]);
    assert.equal(readPool(pool(many(500)), "b3").length, MAX_POOLED_FACTS);
    assert.deepEqual(Object.keys(readPool(pool([fact(1, { extra: 1 })]), "b3")[0]!).sort(), ["id", "source", "subject", "text"]);
  });
});

describe("choosing a fact with no connection", () => {
  test("nothing saved, nothing shown", () => {
    assert.equal(pickOffline([], new Set()), null);
  });
  test("one this session has not shown, chosen at random", () => {
    const pool = many(5);
    const shown = new Set(["b3-t1", "b3-t2", "b3-t3"]);
    for (let i = 0; i < 40; i++) assert.ok(["b3-t4", "b3-t5"].includes(pickOffline(pool, shown, () => i / 40)!.id));
    const picked = new Set(Array.from({ length: 40 }, (_, i) => pickOffline(pool, new Set(), () => i / 40)!.id));
    assert.equal(picked.size, 5, "every fact can come up");
  });
  test("once all were shown, a repeat rather than an empty card", () => {
    const pool = many(3);
    const all = new Set(ids(pool));
    assert.ok(pickOffline(pool, all, () => 0.5));
  });
  test("any random value, including the edges, picks a real fact", () => {
    const pool = many(7);
    for (const r of [0, 0.0001, 0.5, 0.999999, 1, 1.5]) assert.ok(pickOffline(pool, new Set(), () => r), String(r));
  });
});
