// The app shows the privacy notice and terms from app/src/content/legal.ts, generated from docs/legal/*.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.DB_PATH = ":memory:";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = join(root, "scripts", "build-legal.mjs");
const { buildLegalModule } = (await import(script)) as { buildLegalModule: () => string };
const { CONSENT_VERSION } = await import("../src/app.ts");

test("the app's copy of the legal texts matches docs/legal (run: node scripts/build-legal.mjs)", () => {
  assert.equal(readFileSync(join(root, "app", "src", "content", "legal.ts"), "utf8"), buildLegalModule());
});

test("the legal texts' version matches the consent version parents agree to", () => {
  const version = readFileSync(join(root, "docs", "legal", "PRIVACY_NOTICE.md"), "utf8").match(/^Version (\S+)/m)?.[1];
  assert.equal(version, CONSENT_VERSION, "update CONSENT_VERSION in server/src/app.ts and the 'Version' line in docs/legal/*.md together");
});

test("both legal texts are clearly marked as drafts for a lawyer to review", () => {
  for (const f of ["PRIVACY_NOTICE.md", "TERMS.md"]) {
    assert.match(readFileSync(join(root, "docs", "legal", f), "utf8"), /DRAFT: this must be reviewed by a lawyer/, f);
  }
});
