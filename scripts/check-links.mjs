// Checks that every free-resource URL and lesson source URL still responds.
//
//   node scripts/check-links.mjs           # report
//   node scripts/check-links.mjs --write   # also set lastChecked on resources that respond
//
// A working link is necessary but NOT sufficient: reviewers must still confirm each site is free,
// has no ads aimed at children and suits the listed ages.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const UA = "HonestLearn-LinkCheck/0.1 (+https://github.com/PHANI465/honest-learn)";

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : n.endsWith(".json") ? [p] : [];
  });
}

async function check(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, { method, redirect: "follow", headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
      if (res.ok) return { ok: true, status: res.status };
      if (method === "GET") return { ok: false, status: res.status };
    } catch (e) {
      if (method === "GET") return { ok: false, status: e.name === "TimeoutError" ? "timeout" : "unreachable" };
    }
  }
}

const resFile = join(root, "content/resources.json");
const resources = JSON.parse(readFileSync(resFile, "utf8"));
const urls = new Map(); // url -> where it's used
for (const r of resources.resources) urls.set(r.url, [`resource:${r.id}`]);
for (const file of walk(join(root, "content/lessons"))) {
  const l = JSON.parse(readFileSync(file, "utf8"));
  for (const s of l.sources) urls.set(s.url, [...(urls.get(s.url) ?? []), `lesson:${l.id}`]);
}

const today = new Date().toISOString().slice(0, 10);
let bad = 0;
const results = await Promise.all([...urls.keys()].map(async (u) => [u, await check(u)]));
for (const [url, r] of results) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? "✓" : "✗"} ${r.status}  ${url}  (${urls.get(url).join(", ")})`);
  if (write && r.ok) for (const res of resources.resources) if (res.url === url) res.lastChecked = today;
}
if (write) writeFileSync(resFile, JSON.stringify(resources, null, 2) + "\n");
console.log(`\n${urls.size - bad}/${urls.size} links OK.`);
process.exit(bad ? 1 : 0);
