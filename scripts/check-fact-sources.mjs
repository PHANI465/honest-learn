// Checks the source links of the quick facts in content/facts/*.json.
//
//   node scripts/check-fact-sources.mjs            # every source link must open
//   node scripts/check-fact-sources.mjs --text     # also: Wikipedia sources must contain the key words listed in
//                                                  #        content/facts/keywords.json (see docs/AGENT_TASKS.md, T2)
//
// Passing this is necessary but NOT sufficient: a reviewer must still read each fact against its source
// (spot-check at least 1 fact in 5, and every fact before launch). Needs internet, so it is not run in CI.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "content/facts");
const checkText = process.argv.includes("--text");
const UA = "HonestLearnFactCheck/1.0 (open educational project; fact source check)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sets = readdirSync(dir)
  .filter((n) => /^b[1-5]\.json$/.test(n))
  .map((n) => JSON.parse(readFileSync(join(dir, n), "utf8")));
const keywords = checkText && existsSync(join(dir, "keywords.json")) ? JSON.parse(readFileSync(join(dir, "keywords.json"), "utf8")) : {};

async function get(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
    if (res.status !== 429) return res;
    await sleep(4000 * (i + 1));
  }
  throw new Error("rate limited: " + url);
}

let bad = 0;
let n = 0;
const seen = new Map();
for (const set of sets) {
  for (const f of set.facts) {
    n++;
    let status = seen.get(f.source.url);
    if (status === undefined) {
      try {
        status = (await get(f.source.url)).status;
      } catch (e) {
        status = String(e.message);
      }
      seen.set(f.source.url, status);
      await sleep(300);
    }
    if (status !== 200) {
      bad++;
      console.log(`FAIL ${f.id}: ${f.source.url} -> ${status}`);
    }
    if (checkText && keywords[f.id]) {
      const m = /^https:\/\/en\.wikipedia\.org\/wiki\/(.+)$/.exec(f.source.url);
      if (!m) continue;
      const api = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(decodeURIComponent(m[1]).replaceAll("_", " "))}`;
      const data = await (await get(api)).json();
      const text = String(Object.values(data.query.pages)[0].extract ?? "").toLowerCase();
      for (const kw of keywords[f.id]) {
        if (!kw.split("|").some((alt) => text.includes(alt.toLowerCase()))) {
          bad++;
          console.log(`FAIL ${f.id}: source text does not contain "${kw}"`);
        }
      }
      await sleep(600);
    }
  }
}
console.log(bad ? `${bad} problem(s) in ${n} facts.` : `OK: all ${n} fact sources opened${checkText ? " and matched their key words" : ""}.`);
process.exit(bad ? 1 : 0);
