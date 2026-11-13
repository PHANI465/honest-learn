// Builds the website (app/dist) with the API on the same address (/api). Works on Windows, macOS and Linux,
// unlike an inline `VAR=value cmd` in package.json (fails in Windows cmd, and Git Bash rewrites "/api" into a path).
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "../app");
const r = spawnSync("npx", ["expo", "export", "--platform", "web"], {
  cwd: app,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_API_URL: "/api", CI: "1", MSYS_NO_PATHCONV: "1", MSYS2_ARG_CONV_EXCL: "*" },
});
process.exit(r.status ?? 1);
