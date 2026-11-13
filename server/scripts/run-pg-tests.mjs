// Runs every test file against Postgres (PGlite), one file at a time. Works on Windows, macOS and Linux
// (an inline `TEST_DB=pglite cmd` fails in Windows cmd) and keeps memory low: PGlite in many files at once can run out of memory.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(join(root, "test")).filter((f) => f.endsWith(".test.ts")).sort();
let failed = 0;
for (const f of files) {
  console.log(`\n== ${f} (PGlite)`);
  const r = spawnSync("npx", ["tsx", "--test", join("test", f)], { cwd: root, stdio: "inherit", shell: true, env: { ...process.env, TEST_DB: "pglite" } });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) failed on Postgres` : `\nAll ${files.length} test files passed on Postgres (PGlite)`);
process.exit(failed ? 1 : 0);
