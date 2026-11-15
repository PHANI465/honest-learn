// The red-team runner (src/hoot-redteam.ts) is run as a real command here, against a fake OpenAI-compatible model server,
// so these tests need no AI and no internet. They check that the runner follows .env (createTutor), names the model in
// the report, and gives a pass rate per category.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const serverDir = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "redteam-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** Runs `npm run redteam` equivalent and returns its exit code and output, whatever the code. */
async function redteam(args: string[], env: Record<string, string>) {
  try {
    const r = await run(process.execPath, ["--import", "tsx", "src/hoot-redteam.ts", ...args], {
      cwd: serverDir,
      env: { ...process.env, DB_PATH: ":memory:", ...env },
      timeout: 90_000,
    });
    return { code: 0, out: r.stdout + r.stderr };
  } catch (e: any) {
    return { code: e.code as number, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

describe("red-team runner", () => {
  test("runs against your own model (TUTOR_MODE=openai), names it in the report, and gives a pass rate per category", async () => {
    const seen: string[] = [];
    const fake: Server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const model = JSON.parse(body).model as string;
        seen.push(model);
        // the judge gets a verdict; the tutor gets a gentle nudge that never names an option
        const text = model === "fake-judge" ? '{"safe_for_age": true, "reveals_answer": false, "reason": "fine"}' : "What do you notice if you look at the bottom numbers first?";
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
      });
    });
    await new Promise<void>((ok) => fake.listen(0, "127.0.0.1", ok));
    const port = (fake.address() as { port: number }).port;
    try {
      const out = join(tmp, "own-model.md");
      const r = await redteam(["--limit", "10", "--out", out], {
        TUTOR_MODE: "openai",
        LLM_BASE_URL: `http://127.0.0.1:${port}/v1`,
        LLM_MODEL: "fake-model",
        LLM_SAFETY_MODEL: "fake-judge",
        ANTHROPIC_API_KEY: "",
      });
      assert.equal(r.code, 0, r.out);
      assert.ok(seen.includes("fake-model") && seen.includes("fake-judge"), "both the reply model and the judge were called");
      const md = readFileSync(out, "utf8");
      assert.match(md, /own model at http:\/\/127\.0\.0\.1:\d+\/v1/);
      assert.match(md, /reply model `fake-model`/);
      assert.match(md, /safety model `fake-judge`/);
      assert.match(md, /Automatic pass rate: \*\*\d+\/\d+ \(\d+%\)\*\*/);
      assert.match(md, /\| Category \| Cases \| Auto-pass \|/);
      assert.match(r.out, /Automatic pass rate by category/);
      assert.match(r.out, /answer-begging +\d+\/\d+ \(\d+%\)/);
    } finally {
      fake.close();
    }
  });

  test("with Claude selected and no key, it stops before sending anything and says how to test your own model", async () => {
    const r = await redteam(["--limit", "2", "--out", join(tmp, "none.md")], { TUTOR_MODE: "claude", ANTHROPIC_API_KEY: "" });
    assert.equal(r.code, 2);
    assert.match(r.out, /ANTHROPIC_API_KEY is not set/);
    assert.match(r.out, /TUTOR_MODE=openai/);
    assert.equal(existsSync(join(tmp, "none.md")), false);
  });

  test("the pre-check alone needs no model, and the report is named after what was tested", async () => {
    const r = await redteam(["--precheck-only"], { TUTOR_MODE: "mock", ANTHROPIC_API_KEY: "" });
    const file = join(serverDir, "redteam-report-precheck-only.md");
    try {
      assert.equal(r.code, 0, r.out);
      assert.ok(existsSync(file), "default report name is redteam-report-<model>.md in server/");
      assert.match(readFileSync(file, "utf8"), /pre-check only \(no AI\)/);
    } finally {
      rmSync(file, { force: true });
    }
  });

  test("the mock tutor runs the runner end to end and says it is not a real test", async () => {
    const out = join(tmp, "mock.md");
    const r = await redteam(["--limit", "6", "--out", out], { TUTOR_MODE: "mock", ANTHROPIC_API_KEY: "" });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /mock tutor only returns/);
    assert.match(readFileSync(out, "utf8"), /mock tutor \(canned hints, not a real test\)/);
  });
});
