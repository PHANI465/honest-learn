// Writes the open source notices for the app (task: "Open source licences" screen):
//   app/src/content/licences.generated.ts   what the screen shows
//   THIRD_PARTY_NOTICES.md                   the same, for people reading the repository
// Run after adding, removing or updating a dependency (CI fails if the files are stale):
//   node scripts/build-licences.mjs
//   node scripts/build-licences.mjs --maps <dir>     reuse bundles built earlier (dir has android.map, ios.map and web/); for quick runs
//
// Which packages: the ones that really are in the app. The script builds the Android, iOS and web bundles with source maps (Expo's own
// bundler) and reads every file's package from them, then adds the app's direct dependencies (their native code ships even if no
// JavaScript from them is reachable). Their licence files are read from node_modules: nothing is typed by hand except the two fonts.
// Packages whose licence text is identical share one copy of the text, with every package's own copyright lines listed above it.
//
// The guard: the script FAILS if any shipped package has no licence, or one that is not on the permissive list below. A copyleft
// dependency (GPL, AGPL, LGPL ...) would change what the project may do with its own code; adding one must be a decision, not an accident.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "app");
const OUT_TS = join(appDir, "src/content/licences.generated.ts");
const OUT_MD = join(root, "THIRD_PARTY_NOTICES.md");

/** Licences that may be shipped. For "A OR B" expressions, one allowed alternative is enough. */
const ALLOWED = new Set(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "CC0-1.0", "Unlicense", "BlueOak-1.0.0", "OFL-1.1", "Python-2.0"]);
/** Direct dependencies that are build tools (config plugins), not part of the running app. */
const BUILD_ONLY = new Set(["expo-build-properties"]);
/** Files shipped with the website that are not npm packages. The licence text is read from the file. */
const FONTS = [
  { name: "Manrope (website typeface)", version: "from @fontsource/manrope 5.3.0 (files are byte-identical)", spdx: "OFL-1.1", file: "app/public/fonts/Manrope-LICENSE.txt" },
  { name: "OpenDyslexic (website font for readers who choose it)", version: "from the OpenDyslexic project", spdx: "OFL-1.1", file: "app/public/fonts/OpenDyslexic-LICENSE.txt" },
];

/** Plain character order, the same on every machine (localeCompare depends on the locale, and the output must be identical in CI). */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const lf = (s) => s.replace(/\r\n?/g, "\n");
const args = process.argv.slice(2);
const mapsArg = args.indexOf("--maps") >= 0 ? resolve(args[args.indexOf("--maps") + 1]) : null;

// ---------------------------------------------------------------- 1. bundles with source maps
function bundle() {
  const dir = join(tmpdir(), "hl-licence-bundles");
  mkdirSync(dir, { recursive: true });
  const run = (cmdArgs, env = {}) => {
    const r = spawnSync("npx", ["expo", ...cmdArgs], { cwd: appDir, stdio: ["ignore", "inherit", "inherit"], shell: true, env: { ...process.env, CI: "1", ...env } });
    if (r.status !== 0) throw new Error(`expo ${cmdArgs[0]} failed`);
  };
  for (const p of ["android", "ios"]) {
    console.log(`Bundling ${p} with a source map ...`);
    run(["export:embed", "--platform", p, "--bundle-output", join(dir, `${p}.js`), "--sourcemap-output", join(dir, `${p}.map`), "--assets-dest", join(dir, `assets-${p}`), "--dev", "false", "--minify", "false"]);
  }
  console.log("Bundling the website with source maps ...");
  run(["export", "--platform", "web", "--source-maps", "--output-dir", join(dir, "web")], { EXPO_PUBLIC_API_URL: "/api" });
  return dir;
}

// ---------------------------------------------------------------- 2. which packages are in the bundles
const sourcesOf = (map) => (map.sections ? map.sections.flatMap((s) => sourcesOf(s.map)) : map.sources ?? []);

function packageRoots(dir) {
  const maps = [join(dir, "android.map"), join(dir, "ios.map")];
  const webJs = join(dir, "web/_expo/static/js/web");
  for (const f of readdirSync(webJs)) if (f.endsWith(".map")) maps.push(join(webJs, f));
  const roots = new Set();
  const missing = new Set();
  for (const m of maps) {
    for (const source of sourcesOf(JSON.parse(readFileSync(m, "utf8")))) {
      const norm = source.split("\\").join("/");
      const at = norm.lastIndexOf("/node_modules/");
      if (at < 0) continue;
      const rest = norm.slice(at + "/node_modules/".length).split("/");
      const name = rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
      // Metro writes paths relative to the app folder with a leading slash ("/node_modules/x/y.js", "/../server/node_modules/z/w.js");
      // an absolute path is tried too, in case a source lies outside it
      const prefix = norm.slice(0, at + "/node_modules/".length) + name;
      const rootDir = [resolve(appDir, prefix.replace(/^\//, "")), resolve(prefix)].find((c) => existsSync(join(c, "package.json")));
      if (rootDir) roots.add(rootDir);
      else missing.add(name);
    }
  }
  // a package that is in a bundle but whose folder cannot be found would silently be left out of the notices: stop instead
  const unresolved = [...missing].filter((n) => ![...roots].some((r) => r.split("\\").join("/").endsWith(`/node_modules/${n}`)));
  if (unresolved.length) throw new Error(`packages in the bundles whose folders were not found: ${unresolved.join(", ")}`);
  const direct = Object.keys(JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")).dependencies ?? {}).filter((n) => !BUILD_ONLY.has(n));
  for (const name of direct) {
    const rootDir = join(appDir, "node_modules", name);
    if (!existsSync(join(rootDir, "package.json"))) throw new Error(`${name} is a dependency of the app but is not installed (run npm ci in app/ and server/)`);
    roots.add(rootDir);
  }
  return [...roots];
}

// ---------------------------------------------------------------- 3. each package's licence
const COPYRIGHT = /^\s*(copyright\b|\(c\)\s|©)/i;

function licenceFile(dirPath) {
  const files = readdirSync(dirPath).filter((f) => /^(licen[cs]e|copying)([-._].*)?$/i.test(f) && statSync(join(dirPath, f)).isFile());
  const rank = (f) => (/^licen[cs]e$/i.test(f) ? 0 : /^licen[cs]e\.(md|txt)$/i.test(f) ? 1 : /^licen[cs]e/i.test(f) ? 2 : 3);
  files.sort((a, b) => rank(a) - rank(b) || cmp(a, b));
  return files[0] ? lf(readFileSync(join(dirPath, files[0]), "utf8")) : null;
}
function noticeFile(dirPath) {
  const f = readdirSync(dirPath).find((n) => /^notice(\.(md|txt))?$/i.test(n) && statSync(join(dirPath, n)).isFile());
  return f ? lf(readFileSync(join(dirPath, f), "utf8")).trim() : null;
}
function spdxOf(pkg) {
  const one = (l) => (typeof l === "string" ? l : l?.type);
  if (pkg.license) return one(pkg.license);
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map(one).filter(Boolean).join(" OR ");
  return null;
}
const allowed = (spdx) => !!spdx && spdx.replace(/[()]/g, "").split(/\s+OR\s+/i).some((s) => ALLOWED.has(s.trim()));
const authorOf = (pkg) => (typeof pkg.author === "string" ? pkg.author : pkg.author?.name) ?? null;

/** Repository addresses that name the same project (the React Native repository moved from github.com/facebook to github.com/react). */
const REPO_ALIASES = { "https://github.com/facebook/react-native": "https://github.com/react/react-native" };
const normaliseRepo = (url) => {
  const clean = url.replace(/^git\+/, "").replace(/\.git$/, "").toLowerCase();
  return REPO_ALIASES[clean] ?? clean;
};

function readPackage(rootDir) {
  const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  const text = licenceFile(rootDir);
  const spdx = spdxOf(pkg);
  const lines = text ? [...new Set(text.split("\n").filter((l) => COPYRIGHT.test(l)).map((l) => l.trim()))].slice(0, 6) : [];
  const author = authorOf(pkg);
  return {
    kind: "package",
    name: pkg.name,
    version: pkg.version,
    licence: spdx ?? "(none declared)",
    text,
    copyright: lines.length ? lines : author ? [`Copyright (c) ${author.replace(/\s*[<(].*$/, "")} (taken from the package's author field: it has no copyright line in its licence file)`] : [],
    notice: noticeFile(rootDir),
    note: null,
    repo: normaliseRepo(typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? ""),
    ok: allowed(spdx) && !!(text || pkg.license),
    hasText: !!text,
  };
}

// ---------------------------------------------------------------- 4. build the list
const bundlesDir = mapsArg ?? bundle();
// two installed copies of the same version (for example in app/ and in server/) are one entry
const entries = [...new Map(packageRoots(bundlesDir).map(readPackage).map((e) => [`${e.name}@${e.version}`, e])).values()];
for (const f of FONTS) {
  const text = lf(readFileSync(join(root, f.file), "utf8"));
  entries.push({ kind: "font", name: f.name, version: f.version, licence: f.spdx, text, copyright: [...new Set(text.split("\n").filter((l) => COPYRIGHT.test(l)).map((l) => l.trim()))].slice(0, 6), notice: null, note: null, ok: allowed(f.spdx), hasText: true });
}
entries.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.name, b.name) || cmp(a.version, b.version));

// A package that declares a permissive licence but ships no licence file gets the standard text of that licence (taken from another shipped
// package under the same licence) and its author as the copyright holder. The output says so for each such package.
const strip = (t) => t.split("\n").filter((l) => !COPYRIGHT.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
const donorText = (spdx) => {
  const counts = new Map();
  for (const e of entries) if (e.hasText && !e.borrowed && e.licence === spdx) counts.set(strip(e.text), (counts.get(strip(e.text)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
for (const e of entries) {
  if (e.kind !== "package" || e.hasText || !allowed(e.licence)) continue;
  const donor = donorText(e.licence);
  if (!donor) continue;
  e.text = donor;
  e.hasText = true;
  e.borrowed = true;
  e.note = `The package ships no licence file; the standard ${e.licence} text is used and the copyright holder is taken from the package's author field.`;
}

// A package with no copyright line and no author takes the copyright lines of another shipped package from the same repository
// (the monorepo's licence file names the holder), and the output says so.
for (const e of entries) {
  if (e.kind !== "package" || e.copyright.length || !e.repo) continue;
  const peer = entries.find((p) => p !== e && p.repo === e.repo && p.copyright.length && !p.copyright[0].includes("author field"));
  if (!peer) continue;
  e.copyright = peer.copyright;
  e.note = `${e.note ? e.note + " " : ""}The copyright lines are those of ${peer.name}, which is published from the same repository.`;
}

// the guard
const problems = [];
for (const e of entries) {
  if (!allowed(e.licence)) problems.push(`${e.name}@${e.version}: licence "${e.licence}" is not on the permissive list (${[...ALLOWED].join(", ")})`);
  else if (!e.copyright.length) problems.push(`${e.name}@${e.version}: no copyright holder could be found (no copyright line, no author, no sibling package from the same repository)`);
  else if (!e.hasText) problems.push(`${e.name}@${e.version}: declares ${e.licence} but ships no licence file, so there is no text to reproduce (add its text by hand or replace the package)`);
}
if (problems.length) {
  console.error("\nLicence problems:\n- " + problems.join("\n- ") + "\n\nDo not ship these without a decision: see docs/PERSON_CHECKLIST.md part 4.");
  process.exit(1);
}

// ---------------------------------------------------------------- 5. group identical texts
const groups = new Map();
for (const e of entries) {
  const clean = strip(e.text ?? "");
  const id = createHash("sha256").update(clean.toLowerCase().replace(/\s+/g, " ")).digest("hex").slice(0, 8);
  if (!groups.has(id)) groups.set(id, { id, spdx: e.licence, text: clean, members: [] });
  groups.get(id).members.push(e);
}
const ordered = [...groups.values()].sort((a, b) => b.members.length - a.members.length || cmp(a.spdx, b.spdx) || cmp(a.id, b.id));
const seen = {};
for (const g of ordered) {
  seen[g.spdx] = (seen[g.spdx] ?? 0) + 1;
  g.name = seen[g.spdx] === 1 ? g.spdx : `${g.spdx} (wording ${seen[g.spdx]})`;
}
for (const e of entries) e.textId = [...groups.values()].find((g) => g.members.includes(e)).id;

// ---------------------------------------------------------------- 6. write
const header = "// Generated by scripts/build-licences.mjs. Do not edit: run `node scripts/build-licences.mjs` after changing a dependency (CI checks it is fresh).\n";
const ts =
  header +
  "export interface LicenceText { id: string; name: string; text: string }\n" +
  "export interface LicenceEntry { kind: \"package\" | \"font\"; name: string; version: string; licence: string; textId: string; copyright: string[]; notice: string | null; note: string | null }\n\n" +
  `export const licenceTexts: LicenceText[] = ${JSON.stringify(ordered.map((g) => ({ id: g.id, name: g.name, text: g.text })), null, 2)};\n\n` +
  `export const licenceEntries: LicenceEntry[] = ${JSON.stringify(entries.map((e) => ({ kind: e.kind, name: e.name, version: e.version, licence: e.licence, textId: e.textId, copyright: e.copyright, notice: e.notice, note: e.note })), null, 2)};\n`;
writeFileSync(OUT_TS, ts);

const md = [];
md.push("# Third-party notices", "");
md.push("Honest Learn includes the open source software and fonts listed here. Each is used under its own licence, reproduced below with the");
md.push("copyright notices of the packages that use it. **This file is generated** by `node scripts/build-licences.mjs` from the packages that are actually in the app's");
md.push("Android, iOS and website bundles (and the app's direct dependencies); it is shown in the app under *Open source licences*.");
md.push("");
md.push(`${entries.filter((e) => e.kind === "package").length} packages and ${entries.filter((e) => e.kind === "font").length} fonts, under ${ordered.length} licence wordings. Every one is on the permissive list in the script.`);
md.push("");
md.push("**Not covered here:** the lesson content (written for this project; each lesson lists its own sources and their licences), Wikipedia text (shown with attribution under CC BY-SA), and the");
md.push("native libraries that React Native and Expo bring into the Android and iOS builds (for example networking and image libraries). Those are listed by the platforms' build tools once a");
md.push("real build exists; see `docs/PERSON_CHECKLIST.md`.");
md.push("");
for (const g of ordered) {
  md.push(`## ${g.name}`, "", `Used by ${g.members.length} ${g.members.length === 1 ? "item" : "items"}:`, "");
  for (const e of g.members) {
    md.push(`- **${e.name}** ${e.version}${e.copyright.length ? " — " + e.copyright.join("; ") : ""}`);
    if (e.note) md.push(`  - *${e.note}*`);
    if (e.notice) md.push("  ", ...e.notice.split("\n").map((l) => `  > ${l}`));
  }
  md.push("", "```text", g.text, "```", "");
}
writeFileSync(OUT_MD, md.join("\n"));
console.log(`Wrote ${OUT_TS.replace(root + "/", "").replace(/\\/g, "/")} and THIRD_PARTY_NOTICES.md: ${entries.length} entries, ${ordered.length} licence wordings.`);
