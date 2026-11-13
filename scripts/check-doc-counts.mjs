// Fails if a document states a different content count than content/ actually has.
//   node scripts/check-doc-counts.mjs
// Counts checked: lessons, quiz questions, brain puzzles, free resources, learning outcomes.
// Only current-status statements are checked:
//  - lines that mention a version such as "v0.4" are changelog/history and are skipped;
//  - a line containing "doc-counts:ignore" is skipped;
//  - numbers below 20 are skipped (subsets such as "13 lessons (b*-dig-*)" or "2 quiz questions").
// No dependencies.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const content = join(root, "content");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".json") ? [join(dir, e.name)] : [],
  );

// ---- actual counts ----
const lessonFiles = walk(join(content, "lessons"));
const lessons = lessonFiles.map(json);
const puzzleDir = join(content, "puzzles");
const puzzleSets = existsSync(puzzleDir) ? walk(puzzleDir).map(json) : [];
const actual = {
  lessons: lessons.length,
  questions: lessons.reduce((n, l) => n + l.quiz.length, 0),
  puzzles: puzzleSets.reduce((n, s) => n + s.puzzles.length, 0),
  resources: json(join(content, "resources.json")).resources.length,
  outcomes: json(join(content, "knowledge-map.json")).cells.reduce((n, c) => n + c.outcomes.length, 0),
};

// ---- what documents say ----
const NOUN = {
  lessons: "lessons?",
  questions: "(?:quiz )?questions?",
  puzzles: "puzzles?",
  resources: "(?:free )?(?:resources?|websites?|sites?)",
  outcomes: "outcomes?",
};
// "175 lessons", "175 draft lessons", "all 220 knowledge-map outcomes", "27 hand-picked free websites"
const inline = (kind) => new RegExp(`(?<![\\d–.,-])(\\d+)\\s+(?:(?!(?:lessons?|questions?|puzzles?|outcomes?|resources?|and|for|in|of|with|to)\\b)[A-Za-z-]+\\s+){0,3}?${NOUN[kind]}\\b(?!\\s+(?:per|each)\\b)`, "gi");
// table rows: "| Lessons | 175 (...) |"
const TABLE_LABEL = {
  lessons: /^lessons$/i,
  questions: /^quiz questions$/i,
  puzzles: /^brain puzzles$/i,
  resources: /^free resources$/i,
  outcomes: /^learning outcomes$/i,
};
const MIN_CLAIM = 20;
const docs = [
  "docs/NEEDS_APPROVAL.md",
  "docs/LAUNCH_CHECKLIST.md",
  "docs/guide/1_WHAT_WE_BUILT.md",
  "docs/guide/3_PROJECT_EXPLAINED.md",
  "docs/guide/5_SCALING_PLAN.md",
  "CLAUDE.md",
];

const problems = [];
let checked = 0;
for (const doc of docs) {
  const path = join(root, doc);
  if (!existsSync(path)) {
    problems.push(`${doc}: file not found`);
    continue;
  }
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      if (/\bv\d+\.\d+/i.test(raw) || raw.includes("doc-counts:ignore")) return;
      const line = raw.replace(/[*`_]/g, "");
      const claims = [];
      for (const kind of Object.keys(NOUN)) {
        for (const m of line.matchAll(inline(kind))) claims.push([kind, Number(m[1])]);
      }
      const cells = line.split("|").map((c) => c.trim());
      if (cells.length > 2) {
        for (const kind of Object.keys(TABLE_LABEL)) {
          if (TABLE_LABEL[kind].test(cells[1] ?? "")) {
            const n = (cells[2] ?? "").match(/^(\d+)/);
            if (n) claims.push([kind, Number(n[1])]);
          }
        }
      }
      for (const [kind, n] of claims) {
        if (n < MIN_CLAIM) continue;
        checked++;
        if (n !== actual[kind]) {
          problems.push(`${doc}:${i + 1}: says ${n} ${kind}, content/ has ${actual[kind]}`);
        }
      }
    });
}

const summary = Object.entries(actual).map(([k, v]) => `${v} ${k}`).join(", ");
if (problems.length) {
  console.error(`Document counts are out of date (content/ has ${summary}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`OK: ${checked} count statements in ${docs.length} documents match content/ (${summary}).`);
