// Validates every lesson against the schema and the knowledge map.
// Usage: npm run validate   (exit code 1 on problems)
import { config } from "./config.ts";
import { loadContent } from "./content.ts";

try {
  const { lessons, map } = loadContent(config.contentDir);
  const byStatus = { draft: 0, reviewed: 0 };
  for (const l of lessons.values()) byStatus[l.status]++;
  const covered = new Set([...lessons.values()].flatMap((l) => l.outcomes));
  const totalOutcomes = map.cells.reduce((n, c) => n + c.outcomes.length, 0);
  console.log(
    `OK — ${lessons.size} lessons (${byStatus.reviewed} reviewed, ${byStatus.draft} draft). ` +
      `Outcomes covered: ${covered.size}/${totalOutcomes}.`,
  );
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
