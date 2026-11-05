// Exports every lesson to a spreadsheet (CSV) for outsourced reviewers, one row per quiz question,
// plus a lessons sheet. Open in Google Sheets or Excel, share with reviewers, and collect sign-offs.
//
//   node scripts/export-review-sheet.mjs            → docs/review/lessons.csv + docs/review/questions.csv
//   node scripts/export-review-sheet.mjs --drafts   → only lessons still in draft

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const draftsOnly = process.argv.includes("--drafts");
const map = JSON.parse(readFileSync(join(root, "content/knowledge-map.json"), "utf8"));
const bandName = Object.fromEntries(map.bands.map((b) => [b.id, `${b.name} (${b.ages[0]}–${b.ages[1]})`]));
const subjectName = Object.fromEntries(map.subjects.map((s) => [s.id, s.name]));
const outcomeText = Object.fromEntries(map.cells.flatMap((c) => c.outcomes.map((o) => [o.id, o.text])));

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : n.endsWith(".json") ? [p] : [];
  });
}
const csv = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";

const lessons = walk(join(root, "content/lessons"))
  .map((f) => ({ file: f.slice(root.length + 1), ...JSON.parse(readFileSync(f, "utf8")) }))
  .filter((l) => !draftsOnly || l.status === "draft")
  .sort((a, b) => a.band.localeCompare(b.band) || a.subject.localeCompare(b.subject) || a.id.localeCompare(b.id));

const checklist = "Facts correct & sourced | Fits outcomes | Reading level | No bias | Sensitive tag | Quiz/hints | Licensing | Safe";
const lessonRows = [["Lesson ID", "Title", "Age band", "Subject", "Outcomes", "Sensitive", "Minutes", "Status", "Lesson text", "Sources", "File", "Reviewer 1 (subject) initials", "Reviewer 1 date", "Reviewer 2 (age & safety) initials", "Reviewer 2 date", `Checklist: ${checklist}`, "Changes needed"]];
const questionRows = [["Lesson ID", "Age band", "Q#", "Question", "Correct answer", "Other options", "Hint 1 (nudge)", "Hint 2 (bigger)", "Hint 3 (similar example)", "Explanation", "Reviewer OK? (Y/N)", "Comments"]];

for (const l of lessons) {
  lessonRows.push([
    l.id, l.title, bandName[l.band], subjectName[l.subject],
    l.outcomes.map((o) => `${o}: ${outcomeText[o]}`).join("\n"),
    l.sensitive ?? "", l.minutes, l.status,
    l.sections.map((s) => `[${s.type}] ${s.body}${s.videoId ? ` (video ${s.videoId})` : ""}`).join("\n\n"),
    l.sources.map((s) => `${s.title} — ${s.url} (${s.license})`).join("\n"),
    l.file, ...(l.reviewers[0] ? [l.reviewers[0].initials, l.reviewers[0].date] : ["", ""]),
    ...(l.reviewers[1] ? [l.reviewers[1].initials, l.reviewers[1].date] : ["", ""]), "", "",
  ]);
  l.quiz.forEach((q, i) => {
    questionRows.push([l.id, bandName[l.band], i + 1, q.q, q.options[q.answer], q.options.filter((_, j) => j !== q.answer).join(" | "), q.hints[0], q.hints[1], q.hints[2], q.explain, "", ""]);
  });
}

const out = join(root, "docs/review");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "lessons.csv"), "﻿" + csv(lessonRows));
writeFileSync(join(out, "questions.csv"), "﻿" + csv(questionRows));
console.log(`Exported ${lessons.length} lessons and ${questionRows.length - 1} questions → docs/review/`);
