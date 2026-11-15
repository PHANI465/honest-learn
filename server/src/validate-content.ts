// Validates every lesson against the schema and the knowledge map.
// Usage: npm run validate   (exit code 1 on problems)
import { config } from "./config.ts";
import { loadContent } from "./content.ts";
import { loadHelplines } from "./tutor.ts";
import { verifyPuzzle, type ChessPuzzle } from "./games/chess.ts";
import { isStrictlyLongest, lengthCue } from "./option-length.ts";

try {
  const { lessons, map, puzzles, resources, facts, spelling, chess } = loadContent(config.contentDir);
  const helplines = loadHelplines(config.contentDir);
  const byStatus = { draft: 0, reviewed: 0 };
  for (const l of lessons.values()) byStatus[l.status]++;
  const covered = new Set([...lessons.values()].flatMap((l) => l.outcomes));
  const totalOutcomes = map.cells.reduce((n, c) => n + c.outcomes.length, 0);
  // Reviewer aid: hints that contain the correct answer word-for-word may give it away.
  const norm = (t: string) =>
    t.toLowerCase().replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "").replace(/[^a-z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();
  const leaks: string[] = [];
  for (const l of lessons.values()) {
    l.quiz.forEach((q, i) => {
      const a = norm(q.options[q.answer]!);
      if (a.length < 3) return;
      q.hints.forEach((h, k) => norm(h).includes(a) && leaks.push(`${l.id} Q${i + 1} hint ${k + 1} mentions "${q.options[q.answer]}"`));
    });
  }
  // Reviewer aid: when the correct option is clearly the longest, children can guess it without reading the question (option-length.ts).
  // Being longest by a letter or two is no cue, so only a clear gap is a warning; the number that are longest at all is only counted.
  const longest: string[] = [];
  let questions = 0;
  let longestAtAll = 0;
  const checkLongest = (id: string, label: string, options: string[], answer: number) => {
    questions++;
    if (isStrictlyLongest(options, answer)) longestAtAll++;
    const cue = lengthCue(options, answer);
    if (cue) longest.push(`${id} ${label}: correct option is ${cue.gap} characters (${cue.ratio.toFixed(1)}x) longer than any wrong one ("${options[answer]}")`);
  };
  for (const l of lessons.values()) l.quiz.forEach((q, i) => checkLongest(l.id, `Q${i + 1}`, q.options, q.answer));
  for (const set of puzzles.values()) for (const p of set.puzzles) checkLongest(p.id, "puzzle", p.options, p.answer);
  if (longest.length) console.log(`⚠️  Correct answer is clearly the longest option (make the wrong options as detailed):\n   ${longest.join("\n   ")}`);
  if (leaks.length) console.log(`⚠️  Check these hints don't give the answer away (may be fine):\n   ${leaks.join("\n   ")}`);
  // Facts: every one already has a source (the schema requires it); also check ids match the band and text is not repeated.
  const factProblems: string[] = [];
  const factTexts = new Set<string>();
  for (const set of facts.values()) {
    for (const f of set.facts) {
      if (!f.id.startsWith(set.band + "-")) factProblems.push(`${f.id}: id should start with "${set.band}-"`);
      const key = f.text.toLowerCase().replace(/\W+/g, " ").trim();
      if (factTexts.has(key)) factProblems.push(`${f.id}: same text as another fact`);
      factTexts.add(key);
    }
  }
  if (factProblems.length) throw new Error("Fact problems:\n- " + factProblems.join("\n- "));
  // Chess: every puzzle must be proven sound (legal, the goal really happens, unique first move); see games/chess.ts
  const chessProblems: string[] = [];
  for (const set of chess.values()) {
    for (const p of set.puzzles) {
      const v = verifyPuzzle(p as ChessPuzzle);
      for (const msg of v.problems) chessProblems.push(`${p.id}: ${msg}`);
    }
  }
  if (chessProblems.length) throw new Error("Chess puzzle problems:" + String.fromCharCode(10) + "- " + chessProblems.join(String.fromCharCode(10) + "- "));
  // Spelling: every group should reach 120 words (T3); a shorter list still works but repeats sooner.
  for (const set of spelling.values()) {
    if (set.words.length < 120) console.log(`⚠️  Spelling list for ${set.band} has ${set.words.length} words (the target is at least 120).`);
  }
  console.log(`Warnings: ${leaks.length} hint(s) may contain the answer; ${longest.length} question(s) where the correct option is clearly the longest (${longestAtAll} of ${questions} are the longest by any margin).`);
  console.log(
    `OK — ${lessons.size} lessons (${byStatus.reviewed} reviewed, ${byStatus.draft} draft). ` +
      `Outcomes covered: ${covered.size}/${totalOutcomes}. ` +
      `Puzzles: ${[...puzzles.values()].reduce((n, p) => n + p.puzzles.length, 0)} in ${puzzles.size} sets. Free resources: ${resources.length}. ` +
      `Facts: ${[...facts.values()].reduce((n, f) => n + f.facts.length, 0)} in ${facts.size} sets. ` +
      `Chess puzzles: ${[...chess.values()].reduce((n, c) => n + c.puzzles.length, 0)} (all verified). ` +
      `Spelling words: ${[...spelling.values()].reduce((n, s) => n + s.words.length, 0)} in ${spelling.size} lists. ` +
      `Helplines: ${Object.keys(helplines.countries).length} countries (${helplines.status}).`,
  );
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
