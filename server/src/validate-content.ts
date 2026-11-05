// Validates every lesson against the schema and the knowledge map.
// Usage: npm run validate   (exit code 1 on problems)
import { config } from "./config.ts";
import { loadContent } from "./content.ts";
import { loadHelplines } from "./tutor.ts";

try {
  const { lessons, map, puzzles, resources } = loadContent(config.contentDir);
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
  if (leaks.length) console.log(`⚠️  Check these hints don't give the answer away (may be fine):\n   ${leaks.join("\n   ")}`);
  console.log(
    `OK — ${lessons.size} lessons (${byStatus.reviewed} reviewed, ${byStatus.draft} draft). ` +
      `Outcomes covered: ${covered.size}/${totalOutcomes}. ` +
      `Puzzles: ${[...puzzles.values()].reduce((n, p) => n + p.puzzles.length, 0)} in ${puzzles.size} sets. Free resources: ${resources.length}. ` +
      `Helplines: ${Object.keys(helplines.countries).length} countries (${helplines.status}).`,
  );
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
