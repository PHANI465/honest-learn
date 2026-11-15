// A length cue in quiz options: when the correct option is clearly the longest, children pick the longest without reading the question.
// The rule is in src/option-length.ts. These tests check the rule, and keep the shipped lessons and puzzles free of clear cues.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.ts";
import { loadContent } from "../src/content.ts";
import { isStrictlyLongest, lengthCue, MIN_GAP, MIN_RATIO } from "../src/option-length.ts";

describe("what counts as a length cue", () => {
  test("longest by a letter or two is not a cue, but it is still 'strictly longest'", () => {
    assert.equal(lengthCue(["Texture", "Colour", "Shape"], 0), null);
    assert.equal(isStrictlyLongest(["Texture", "Colour", "Shape"], 0), true);
    assert.equal(lengthCue(["Eyes 👀", "Hands ✋", "Nose"], 1), null);
  });
  test("a clear gap is a cue: at least 6 characters and at least 1.3 times the longest wrong option", () => {
    assert.equal(MIN_GAP, 6);
    assert.equal(MIN_RATIO, 1.3);
    const cue = lengthCue(["Check with a grown-up or a trusted source", "Believe it", "Try throwing a cat"], 0)!;
    assert.deepEqual([cue.gap, Math.round(cue.ratio * 10)], [23, 23]);
  });
  test("both conditions are needed: a long gap on long options, or a big ratio on tiny ones, is not a cue", () => {
    // 60 against 50: 10 characters ahead but only 1.2 times
    assert.equal(lengthCue(["a".repeat(60), "b".repeat(50), "c".repeat(40)], 0), null);
    // 6 against 4... 1.5 times but only 2 characters
    assert.equal(lengthCue(["abcdef", "abcd", "abc"], 0), null);
    // 10 against 6: 4 characters, 1.67 times
    assert.equal(lengthCue(["abcdefghij", "abcdef", "abc"], 0), null);
    // exactly on both lines
    assert.ok(lengthCue(["a".repeat(26), "b".repeat(20), "c".repeat(10)], 0));
    assert.equal(lengthCue(["a".repeat(25), "b".repeat(20), "c".repeat(10)], 0), null);
  });
  test("a correct option that is not the longest is never a cue, whatever the others are", () => {
    assert.equal(lengthCue(["short", "a much, much longer wrong option indeed", "medium length"], 0), null);
    assert.equal(isStrictlyLongest(["short", "a much, much longer wrong option indeed", "medium length"], 0), false);
    assert.equal(isStrictlyLongest(["same", "same", "x"], 0), false);
  });
  test("emoji count as one character each, not two", () => {
    // "🌬️" is two code points (the picture and a variation selector), "🧺" is one
    assert.equal(lengthCue(["Eat 🧺🧺🧺🧺🧺🧺🧺🧺", "Eat", "Eat"], 0)!.gap, 9);
  });
  test("the answer can be any position", () => {
    assert.ok(lengthCue(["Believe it", "Check with a grown-up or a trusted source", "Try throwing a cat"], 1));
    assert.equal(lengthCue(["Believe it", "Check with a grown-up or a trusted source", "Try throwing a cat"], 0), null);
  });
});

describe("the shipped quiz questions", () => {
  const content = loadContent(config.contentDir);
  const questions: { id: string; options: string[]; answer: number }[] = [];
  for (const l of content.lessons.values()) l.quiz.forEach((q, i) => questions.push({ id: `${l.id} Q${i + 1}`, options: q.options, answer: q.answer }));
  for (const set of content.puzzles.values()) for (const p of set.puzzles) questions.push({ id: p.id, options: p.options, answer: p.answer });

  test("there are lessons and puzzles to look at", () => {
    assert.ok(questions.length > 600, `${questions.length} questions`);
  });

  test("no correct option is clearly the longest", () => {
    const cues = questions.filter((q) => lengthCue(q.options, q.answer)).map((q) => `${q.id}: "${q.options[q.answer]}"`);
    assert.deepEqual(cues, [], `Make the wrong options as detailed as the right one (npm run validate lists them):\n${cues.join("\n")}`);
  });

  test("the correct option is the longest no more often than chance (about a third with three options)", () => {
    const longest = questions.filter((q) => isStrictlyLongest(q.options, q.answer)).length;
    assert.ok(longest / questions.length <= 1 / 3, `${longest} of ${questions.length} (${Math.round((100 * longest) / questions.length)}%)`);
  });

  test("and it is not given away the other way round either: clearly the shortest is rare", () => {
    const shortest = questions.filter((q) => {
      const correct = [...q.options[q.answer]!].length;
      const longestWrong = Math.max(...q.options.filter((_, i) => i !== q.answer).map((o) => [...o].length));
      return longestWrong - correct >= MIN_GAP && longestWrong / correct >= MIN_RATIO;
    }).length;
    assert.ok(shortest / questions.length <= 0.15, `${shortest} of ${questions.length} (${Math.round((100 * shortest) / questions.length)}%)`);
  });

  test("every question still has the correct option first and no repeated option", () => {
    for (const q of questions) {
      assert.equal(q.answer, 0, q.id);
      assert.equal(new Set(q.options.map((o) => o.trim())).size, q.options.length, `${q.id} repeats an option`);
    }
  });
});
