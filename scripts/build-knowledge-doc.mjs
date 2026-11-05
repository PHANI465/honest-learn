// Validates content/knowledge-map.json and generates docs/KNOWLEDGE_MAP.md for reviewers.
// Usage: node scripts/build-knowledge-doc.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(readFileSync(join(root, "content/knowledge-map.json"), "utf8"));

// ---- validation ----
const errors = [];
const ids = new Set();
const bandIds = map.bands.map((b) => b.id);
for (const subj of map.subjects) {
  for (const band of subj.bands ?? bandIds) {
    const cell = map.cells.find((c) => c.band === band && c.subject === subj.id);
    if (!cell) errors.push(`missing cell ${band}/${subj.id}`);
  }
}
for (const c of map.cells) {
  if (!bandIds.includes(c.band)) errors.push(`unknown band ${c.band}`);
  if (!map.subjects.some((s) => s.id === c.subject)) errors.push(`unknown subject ${c.subject}`);
  for (const o of c.outcomes) {
    if (ids.has(o.id)) errors.push(`duplicate outcome id ${o.id}`);
    ids.add(o.id);
    if (o.sensitive && !map.sensitiveTopics[o.sensitive]) errors.push(`unknown sensitive tag ${o.sensitive} on ${o.id}`);
  }
  const q = c.sampleQuiz;
  if (!q || q.answer < 0 || q.answer >= q.options.length) errors.push(`bad sampleQuiz in ${c.band}/${c.subject}`);
}
if (errors.length) {
  console.error("Knowledge map is invalid:\n- " + errors.join("\n- "));
  process.exit(1);
}

// ---- markdown ----
const L = [];
L.push(`# Honest Learn — Knowledge Map (v${map.version})`, "");
L.push(`> **Status:** ${map.status}`, "");
L.push("This is the minimum knowledge every learner should have at each age, before college. It is **universal** (not tied to one country) and is the brief for content writers and reviewers.", "");
L.push("**Aligned to:**", ...map.alignment.map((a) => `- ${a}`), "");
L.push("## Age bands", "", "| Band | Ages | Reading | Session | How the AI helps | Style |", "|---|---|---|---|---|---|");
for (const b of map.bands) L.push(`| **${b.name}** | ${b.ages[0]}–${b.ages[1]} | ${b.reading} | ${b.sessionMinutes} min | ${b.ai} | ${b.style} |`);
L.push("", "## Sensitive topics (parent PIN required)", "", "Outcomes marked 🔒 are hidden until a parent unlocks that topic for their child with their PIN.", "");
for (const [k, v] of Object.entries(map.sensitiveTopics)) L.push(`- **🔒 ${k}** — ${v}`);
L.push("");

let total = 0;
for (const b of map.bands) {
  L.push(`## ${b.name} (ages ${b.ages[0]}–${b.ages[1]})`, "");
  for (const s of map.subjects) {
    const cell = map.cells.find((c) => c.band === b.id && c.subject === s.id);
    if (!cell) continue;
    L.push(`### ${s.name}`, "");
    for (const o of cell.outcomes) {
      total++;
      L.push(`- [ ] \`${o.id}\` ${o.text}${o.sensitive ? ` 🔒 *${o.sensitive}*` : ""}`);
    }
    const q = cell.sampleQuiz;
    L.push("", `*Sample question:* ${q.q} — ${q.options.map((o, i) => (i === q.answer ? `**${o}** ✓` : o)).join(" / ")}  `, `*Hint:* ${q.hint}`, "");
  }
}
L.splice(4, 0, `**${map.bands.length} age bands · ${map.subjects.length} subjects · ${map.cells.length} cells · ${total} learning outcomes**`, "");

writeFileSync(join(root, "docs/KNOWLEDGE_MAP.md"), L.join("\n") + "\n");
console.log(`OK — ${map.cells.length} cells, ${total} outcomes → docs/KNOWLEDGE_MAP.md`);
