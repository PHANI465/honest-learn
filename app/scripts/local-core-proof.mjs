// Proof for task T8a: the server's API runs inside the app's own bundle, with no Node.js.
//
//   cd app && npm run proof:local
//
// 1. Bundles src/local/proof-entry.ts with Expo's own bundler (`expo export:embed --platform android`, the same Metro and
//    Babel settings as an Android build). That bundle contains the API from ../server/src.
// 2. Runs the bundle in a sandbox (node:vm) that has only what React Native gives an app: no process, Buffer, require,
//    streams or crypto.subtle; Request/Response/Headers from whatwg-fetch, the polyfill React Native itself uses; random
//    bytes through crypto.getRandomValues (expo-crypto provides it on a phone).
// 3. Walks a family through sign-up, PIN, a child, a lesson with the hint ladder, Hoot, an own AI key and the data
//    download, against a database adapter (node:sqlite here; expo-sqlite in task 8b) and the content folder as files.
//
// What this does NOT prove: Hermes itself (React Native's JavaScript engine) and a real phone. See docs/STANDALONE.md.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(appDir, "..", "content");
const out = join(tmpdir(), "hl-local-proof");
mkdirSync(out, { recursive: true });
const bundle = join(out, "proof.android.js");

// ---------------------------------------------------------------- 1. bundle with Expo's own bundler
console.log("Bundling src/local/proof-entry.ts with expo export:embed (android) ...");
const built = spawnSync(
  "npx",
  ["expo", "export:embed", "--platform", "android", "--entry-file", "src/local/proof-entry.ts", "--bundle-output", bundle, "--assets-dest", join(out, "assets"), "--dev", "false", "--minify", "false"],
  { cwd: appDir, stdio: "inherit", shell: true, env: { ...process.env, CI: "1" } },
);
if (built.status !== 0) {
  console.error("The bundle could not be built.");
  process.exit(1);
}
const code = readFileSync(bundle, "utf8");

// ---------------------------------------------------------------- 2. a sandbox with what a phone has
const phone = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  queueMicrotask,
  TextEncoder,
  TextDecoder,
  URL,
  URLSearchParams,
  AbortController,
  AbortSignal,
  // expo-crypto's getRandomValues on a phone; no crypto.subtle (Hermes has none)
  crypto: { getRandomValues: (array) => webcrypto.getRandomValues(array) },
};
const context = vm.createContext(phone);
vm.runInContext("var global = globalThis; var self = globalThis;", context);
const require = createRequire(join(appDir, "package.json"));
vm.runInContext(readFileSync(require.resolve("whatwg-fetch/dist/fetch.umd.js"), "utf8"), context, { filename: "whatwg-fetch" });
const missing = ["process", "Buffer", "require", "ReadableStream", "structuredClone"].filter((g) => vm.runInContext(`typeof ${g} !== "undefined"`, context));
if (missing.length) throw new Error(`the sandbox should not have: ${missing.join(", ")}`);
if (vm.runInContext("typeof crypto.subtle !== 'undefined'", context)) throw new Error("the sandbox should not have crypto.subtle");

vm.runInContext(code, context, { filename: "proof.android.js" });
const run = context.__honestLearnLocalProof;
if (typeof run !== "function") throw new Error("the bundle did not register __honestLearnLocalProof");

// ---------------------------------------------------------------- 3. a database and the content, from outside
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON;");
const adapter = {
  dialect: "sqlite",
  get: async (sql, params) => db.prepare(sql).get(...params),
  all: async (sql, params) => db.prepare(sql).all(...params),
  run: async (sql, params) => ({ changes: Number(db.prepare(sql).run(...params).changes) }),
  exec: async (sql) => void db.exec(sql),
  close: async () => db.close(),
};
const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".json")) files[relative(contentDir, p).replace(/\\/g, "/")] = JSON.parse(readFileSync(p, "utf8"));
  }
};
walk(contentDir);

const started = Date.now();
const steps = await run({ adapter, files });
let failed = 0;
for (const s of steps) {
  if (!s.ok) failed++;
  console.log(`${s.ok ? "ok  " : "FAIL"}  ${s.name}${s.ok || !s.detail ? "" : `  ${s.detail}`}`);
}
console.log(`\n${steps.length - failed} of ${steps.length} steps passed in ${Date.now() - started} ms (bundle: ${Math.round(code.length / 1024)} KB, ${(code.match(/^__d\(/gm) ?? []).length} modules).`);
process.exit(failed ? 1 : 0);
