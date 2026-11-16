// The open source notices (scripts/build-licences.mjs) must stay complete and permissive. These tests read the committed output, so they run
// in CI without bundling anything; the generator itself re-checks everything when it runs (and CI fails if its output is stale).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const { licenceEntries, licenceTexts } = await import("../../app/src/content/licences.generated.ts");
const notices = readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
const appPackage = JSON.parse(readFileSync(join(root, "app/package.json"), "utf8")) as { dependencies: Record<string, string> };

/** The licences the project may ship (the same list as in the generator). "A OR B" is fine if one side is on the list. */
const ALLOWED = new Set(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "CC0-1.0", "Unlicense", "BlueOak-1.0.0", "OFL-1.1", "Python-2.0"]);
const allowed = (spdx: string) => spdx.replace(/[()]/g, "").split(/\s+OR\s+/i).some((s) => ALLOWED.has(s.trim()));

/** Packages from server/ that the app bundles (see app/metro.config.js and docs/STANDALONE.md). */
const FROM_SERVER = ["hono", "zod", "chess.js", "js-chess-engine", "@noble/hashes", "@noble/ciphers"];
/** Direct dependencies that are build tools, not part of the running app (same list as the generator). */
const BUILD_ONLY = new Set(["expo-build-properties"]);

describe("open source notices", () => {
  test("every shipped package and font is under a permissive licence (no GPL, AGPL, LGPL or unknown)", () => {
    const bad = licenceEntries.filter((e) => !allowed(e.licence)).map((e) => `${e.name}: ${e.licence}`);
    assert.deepEqual(bad, [], "a licence that is not on the permissive list was added: that needs a decision, see docs/PERSON_CHECKLIST.md part 4");
  });

  test("every entry is complete: a version, a copyright holder and a licence text that exists", () => {
    const ids = new Set(licenceTexts.map((t) => t.id));
    for (const e of licenceEntries) {
      assert.ok(e.version, `${e.name} has a version`);
      assert.ok(e.copyright.length > 0, `${e.name} names a copyright holder`);
      assert.ok(ids.has(e.textId), `${e.name} points at a licence text`);
    }
    for (const t of licenceTexts) assert.ok(t.text.length > 400, `${t.name}: the licence text is not empty`);
    assert.equal(new Set(licenceEntries.map((e) => `${e.name}@${e.version}`)).size, licenceEntries.length, "no package is listed twice");
  });

  test("the app's direct dependencies and the server packages it bundles are all listed (a new dependency needs `node scripts/build-licences.mjs`)", () => {
    const listed = new Set(licenceEntries.map((e) => e.name));
    const direct = [...Object.keys(appPackage.dependencies).filter((n) => !BUILD_ONLY.has(n)), ...FROM_SERVER];
    const missing = direct.filter((n) => !listed.has(n));
    assert.deepEqual(missing, [], "dependencies missing from the notices: run `node scripts/build-licences.mjs` and commit the result");
  });

  test("the fonts are listed with their licence, and the licence files travel with the font files", () => {
    const fonts = licenceEntries.filter((e) => e.kind === "font");
    assert.deepEqual(fonts.map((f) => f.name.split(" ")[0]).sort(), ["Manrope", "OpenDyslexic"]);
    for (const f of fonts) assert.equal(f.licence, "OFL-1.1");
    for (const file of ["Manrope-LICENSE.txt", "OpenDyslexic-LICENSE.txt"]) {
      assert.ok(existsSync(join(root, "app/public/fonts", file)), `${file} is served with the fonts`);
    }
    assert.match(readFileSync(join(root, "app/public/fonts/Manrope-LICENSE.txt"), "utf8"), /Manrope Project Authors/);
  });

  test("THIRD_PARTY_NOTICES.md lists every entry and every licence text", () => {
    for (const e of licenceEntries) assert.ok(notices.includes(`**${e.name}** ${e.version}`), `${e.name} ${e.version} is in THIRD_PARTY_NOTICES.md`);
    for (const t of licenceTexts) assert.ok(notices.includes(t.text.slice(0, 120)), `${t.name} text is in THIRD_PARTY_NOTICES.md`);
  });

  test("the packages with the licences this project's own tests depend on are present (chess.js is BSD-2-Clause, the engine and crypto are MIT)", () => {
    const by = (n: string) => licenceEntries.find((e) => e.name === n)!;
    assert.equal(by("chess.js").licence, "BSD-2-Clause");
    for (const n of ["js-chess-engine", "@noble/hashes", "@noble/ciphers", "hono", "zod"]) assert.equal(by(n).licence, "MIT", n);
  });
});

// ---------------------------------------------------------------- the project's own licences
// Code: Apache-2.0 (LICENSE). Content: CC BY-SA 4.0 (content/LICENSE). Chosen by the owner on 15 Nov 2026; see docs/PERSON_CHECKLIST.md.
describe("the project's own licences", () => {
  const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

  test("LICENSE is the Apache License 2.0 as published, complete", () => {
    const text = read("LICENSE");
    assert.match(text, /^\s*Apache License\s+Version 2\.0, January 2004/);
    assert.ok(text.includes("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION"));
    assert.ok(text.includes("END OF TERMS AND CONDITIONS"));
    assert.ok(text.includes("APPENDIX: How to apply the Apache License to your work."));
    assert.equal(Buffer.byteLength(text), 11358, "the official text is 11,358 bytes: it has been changed");
  });

  test("content/LICENSE is CC BY-SA 4.0 as published, complete", () => {
    const text = read("content/LICENSE");
    assert.ok(text.startsWith("Attribution-ShareAlike 4.0 International"));
    assert.ok(text.replace(/\s+/g, " ").includes("Creative Commons Attribution-ShareAlike 4.0 International Public License"));
    assert.ok(text.includes("Section 8 -- Interpretation."));
    assert.ok(text.includes("Creative Commons may be contacted at creativecommons.org."));
  });

  test("every package.json says Apache-2.0", () => {
    for (const p of ["package.json", "server/package.json", "app/package.json"]) assert.equal((JSON.parse(read(p)) as { license?: string }).license, "Apache-2.0", p);
  });

  test("NOTICE, the README and the notices file say which licence covers what", () => {
    const notice = read("NOTICE");
    for (const part of ["Copyright 2026 The Honest Learn contributors", "Apache License, Version 2.0", "CC BY-SA 4.0", "content/LICENSE", "THIRD_PARTY_NOTICES.md"]) assert.ok(notice.includes(part), `NOTICE: ${part}`);
    const readme = read("README.md");
    assert.ok(readme.includes("## Licence") && readme.includes("Apache License 2.0") && readme.includes("Creative Commons Attribution-ShareAlike 4.0"));
    assert.ok(notices.includes("Honest Learn itself") && notices.includes("Apache License 2.0") && notices.includes("Attribution-ShareAlike 4.0"));
    assert.ok(read("content/README.md").includes("CC BY-SA 4.0"));
  });

  test("no lesson, fact or word list names a source licence that cannot be combined with CC BY-SA (NonCommercial, NoDerivatives)", async () => {
    const { config } = await import("../src/config.ts");
    const { loadContent } = await import("../src/content.ts");
    const content = loadContent(config.contentDir);
    const names: { where: string; licence: string }[] = [];
    for (const l of content.lessons.values()) for (const s of l.sources) names.push({ where: l.id, licence: s.license });
    for (const set of content.spelling.values()) names.push({ where: `spelling ${set.band}`, licence: set.source.license });
    const bad = names.filter((n) => /\b(NC|ND)\b|non-?commercial|no-?derivs|no derivatives/i.test(n.licence));
    assert.deepEqual(bad, [], "content/ is CC BY-SA 4.0: a source that allows only non-commercial use or no changes cannot be used (see content/README.md)");
    assert.ok(names.length > 200, `${names.length} source licences checked`);
  });
});
