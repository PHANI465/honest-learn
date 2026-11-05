// vercel.json must send the same website security headers as the preview server (src/web-headers.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEB_SECURITY_HEADERS } from "../src/web-headers.ts";

test("vercel.json website headers match src/web-headers.ts", () => {
  const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const site = vercel.headers.find((h) => h.source === "/((?!api/|api$).*)");
  assert.ok(site, "vercel.json has a header rule for website pages");
  assert.deepEqual(Object.fromEntries(site.headers.map((h) => [h.key, h.value])), WEB_SECURITY_HEADERS);
});
