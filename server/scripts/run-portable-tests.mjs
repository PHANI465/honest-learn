// Runs every test with the portable platform's crypto, tokens and IP parsing (what the phone app uses, task T8) instead of
// Node's. Files, settings and DNS still come from Node (see platform.ts). Works on Windows, macOS and Linux, where an inline
// `HL_PLATFORM=portable cmd` does not work in Windows cmd.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync("npx", ["tsx", "--test", "test/*.test.ts"], { cwd: root, stdio: "inherit", shell: true, env: { ...process.env, HL_PLATFORM: "portable" } });
process.exit(r.status ?? 1);
