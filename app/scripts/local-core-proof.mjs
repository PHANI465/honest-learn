// Proof for tasks T8a and T8b: the server's API runs inside the app's own bundle, with no Node.js.
//
//   cd app && npm run proof:local
//
// 1. Bundles src/local/proof-entry.ts with Expo's own bundler (`expo export:embed --platform android`, the same Metro and
//    Babel settings as an Android build). That bundle contains the API from ../server/src.
// 2. Runs the bundle in a sandbox (node:vm) that has only what React Native gives an app: no process, Buffer, require,
//    streams or crypto.subtle; Request/Response/Headers from whatwg-fetch, the polyfill React Native itself uses; random
//    bytes through crypto.getRandomValues (expo-crypto provides it on a phone).
// 3. Walks a family through sign-up, PIN, a child, a lesson with the hint ladder, Hoot, an own AI key and the data
//    download. The bundle holds the content (content-files.generated.ts) and the app's expo-sqlite adapter; only the expo-sqlite
//    database comes from here: a stand-in on node:sqlite that behaves like expo-sqlite (foreign keys off until switched on,
//    null for "no row").
//
// What this does NOT prove: Hermes itself (React Native's JavaScript engine) and a real phone. See docs/STANDALONE.md.
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
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

// ---------------------------------------------------------------- 3. an expo-sqlite stand-in, from outside
const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: false }); // SQLite's own default, like expo-sqlite
const plainRow = (r) => ({ ...r });
const expoDb = {
  execAsync: async (source) => void db.exec(source),
  getFirstAsync: async (source, params) => {
    const r = db.prepare(source).get(...params);
    return r === undefined ? null : plainRow(r);
  },
  getAllAsync: async (source, params) => db.prepare(source).all(...params).map(plainRow),
  runAsync: async (source, params) => {
    const r = db.prepare(source).run(...params);
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  },
  closeAsync: async () => db.close(),
};

const started = Date.now();
const steps = await run({ expoDb });
const fk = db.prepare("PRAGMA foreign_keys").get();
steps.push({ name: "the adapter switched foreign keys on", ok: Number(fk.foreign_keys) === 1 });
const left = db.prepare("SELECT (SELECT COUNT(*) FROM children) + (SELECT COUNT(*) FROM hints_seen) + (SELECT COUNT(*) FROM quiz_solved) + (SELECT COUNT(*) FROM tutor_messages) AS n").get();
steps.push({ name: "nothing about the deleted child is left in the database", ok: Number(left.n) === 0, detail: JSON.stringify({ ...left }) });
let failed = 0;
for (const s of steps) {
  if (!s.ok) failed++;
  console.log(`${s.ok ? "ok  " : "FAIL"}  ${s.name}${s.ok || !s.detail ? "" : `  ${s.detail}`}`);
}
console.log(`\n${steps.length - failed} of ${steps.length} steps passed in ${Date.now() - started} ms (bundle: ${Math.round(code.length / 1024)} KB, ${(code.match(/^__d\(/gm) ?? []).length} modules).`);
process.exit(failed ? 1 : 0);
