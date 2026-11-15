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
