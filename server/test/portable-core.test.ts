// The API must run where there is no Node.js (task T8: the phone app runs createApp() on the device). Two checks:
//  1. Every file createApp() loads is free of Node-only code: no node:* imports, no Node-only packages, no Buffer, no
//     process.*, no require(), no import.meta (platform-node.ts is the one exception; it only runs on Node).
//  2. A family's main paths work on a phone-like platform: portable crypto, content handed in as bundled files, no DNS.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";
process.env.SHOW_DRAFTS = "true";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

// ---------------------------------------------------------------- 1. the import graph
// esbuild bundles createApp() for a browser target, where Node's modules do not exist: a node:* import fails the build.
// Its metafile lists every file and package the API loads. Each source file is then stripped of comments and types by
// esbuild and searched for Node-only globals.
import { build, transform } from "esbuild";

/** Packages the shared API may use: all plain JavaScript that runs in Node, browsers and React Native. */
const ALLOWED_PACKAGES = [/^hono(\/[\w-]+)?$/, /^zod$/, /^chess\.js$/, /^@noble\/hashes\/[\w-]+\.js$/, /^@noble\/ciphers\/[\w-]+\.js$/];
/** Files allowed to touch Node, because they only run there. */
const NODE_ONLY_OK = new Set(["platform-node.ts"]);

async function apiGraph() {
  const result = await build({
    entryPoints: [join(src, "app.ts")],
    bundle: true,
    write: false,
    metafile: true,
    platform: "browser",
    format: "esm",
    logLevel: "silent",
    absWorkingDir: resolve(src, ".."),
  });
  const inputs = result.metafile.inputs;
  const files = Object.keys(inputs)
    .filter((f) => f.startsWith("src/"))
    .map((f) => f.slice(4))
    .sort();
  const packages = new Map<string, string>();
  for (const f of files) {
    for (const imp of inputs[`src/${f}`]!.imports) {
      const spec = imp.original ?? imp.path;
      if (!spec.startsWith(".") && !packages.has(spec)) packages.set(spec, f);
    }
  }
  return { files, packages };
}

describe("the shared API has no Node-only code", async () => {
  const graph = await apiGraph();

  test("it reaches the routes and the platform, and not the server-only files", () => {
    for (const f of ["app.ts", "context.ts", "routes/learn.ts", "routes/parent.ts", "routes/tutor.ts", "tutor.ts", "tutor-openai.ts", "db.ts", "platform.ts", "platform-portable.ts"]) {
      assert.ok(graph.files.includes(f), `expected ${f} in the shared API`);
    }
    for (const f of ["index.ts", "vercel.ts", "preview.ts", "tutor-claude.ts", "db-neon.ts", "open-db.ts", "cron.ts", "hoot-redteam.ts", "validate-content.ts"]) {
      assert.ok(!graph.files.includes(f), `${f} is server-only and must not be loaded by createApp()`);
    }
  });

  test("only portable packages are imported (no node:*, no Node-only packages)", () => {
    const bad = [...graph.packages].filter(([pkg]) => !ALLOWED_PACKAGES.some((re) => re.test(pkg)));
    assert.deepEqual(bad, [], `not allowed in the shared API: ${bad.map(([p, f]) => `${p} (in ${f})`).join(", ")}`);
  });

  test("no Buffer, process.*, require() or import.meta outside platform-node.ts", async () => {
    const problems: string[] = [];
    for (const f of graph.files) {
      if (NODE_ONLY_OK.has(f)) continue;
      const { code } = await transform(readFileSync(join(src, f), "utf8"), { loader: "ts", format: "esm" });
      if (/\bBuffer\b/.test(code)) problems.push(`${f}: Buffer (use bytes.ts)`);
      if (/(?<![\w.$"'`])process\s*\./.test(code)) problems.push(`${f}: process.* (use pf().env)`);
      if (/(?<![\w.$])require\s*\(/.test(code)) problems.push(`${f}: require()`);
      if (/\bimport\.meta\b/.test(code)) problems.push(`${f}: import.meta`);
    }
    assert.deepEqual(problems, []);
  });
});

// ---------------------------------------------------------------- 2. a family on a phone-like platform
const { pf, setPlatform } = await import("../src/platform.ts");
const { createNodePlatform } = await import("../src/platform-node.ts");
const { createPortablePlatform, contentFromFiles } = await import("../src/platform-portable.ts");
const { config } = await import("../src/config.ts");
const { openDb } = await import("../src/db.ts");
const { loadContent } = await import("../src/content.ts");
const { MemoryMailer } = await import("../src/mailer.ts");
const { MockTutor } = await import("../src/tutor.ts");
const { createApp, CONSENT_VERSION } = await import("../src/app.ts");

const original = pf();
after(() => setPlatform(original));

/** The content folder as one object of parsed files: what the phone app will bundle (T8b). */
function bundledContent(): Record<string, unknown> {
  const node = createNodePlatform();
  const files: Record<string, unknown> = {};
  for (const rel of ["knowledge-map.json", "resources.json", "helplines.json"]) files[rel] = node.content.readJson(config.contentDir, rel);
  for (const dir of ["lessons", "puzzles", "facts", "spelling", "chess"]) {
    for (const rel of node.content.listJson(config.contentDir, dir)) files[rel] = node.content.readJson(config.contentDir, rel);
  }
  return files;
}

describe("a family's main paths on a phone-like platform", () => {
  const phone = createPortablePlatform({ content: contentFromFiles(bundledContent()), env: {} });

  test("sign up, PIN, add a child, open a lesson, climb the hint ladder, check answers, ask Hoot, export", async () => {
    setPlatform(phone);
    assert.equal(pf().name, "portable");
    assert.equal(pf().resolveHost, undefined, "no DNS on a phone");
    const content = loadContent("bundled");
    const app = createApp({ db: openDb(":memory:"), content, tutor: new MockTutor(), mailer: new MemoryMailer() });
    const call = async (method: string, path: string, body?: unknown, token?: string) => {
      const res = await app.request(path, {
        method,
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : {}) as any };
    };

    assert.equal((await call("GET", "/health")).json.ok, true);
    const countries = (await call("GET", "/content/countries")).json.countries as unknown[];
    assert.ok(countries.length > 0, "helplines come from the bundled content");
    const s = await call("POST", "/auth/signup", { email: "phone@example.com", password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION });
    assert.equal(s.status, 201);
    const fam = s.json.familyToken as string;
    assert.equal((await call("POST", "/auth/parent-unlock", { pin: "1111" }, fam)).status, 401, "a wrong PIN is refused");
    const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
    const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: new Date().getFullYear() - 9 }, par)).json.child.id as string;
    assert.equal((await call("GET", "/parent/overview", undefined, fam)).status, 403, "the family token cannot open the parent area");

    const path = `/children/${kid}/lessons/b3-math-comparing-fractions`;
    const shown = (await call("GET", path, undefined, fam)).json.lesson;
    const raw = JSON.stringify(shown);
    assert.ok(!raw.includes('"answer"') && !raw.includes('"hints"') && !raw.includes('"explain"'), "no answers before they are earned");
    const pos = (qi: number, text: string) => shown.quiz[qi].options.indexOf(text);
    assert.equal((await call("POST", `${path}/hint`, { question: 2, level: 1 }, fam)).json.error, "hint_out_of_order");
    for (const level of [0, 1, 2]) assert.equal((await call("POST", `${path}/hint`, { question: 2, level }, fam)).status, 200);
    const tried = await call("POST", `${path}/check`, { question: 2, choice: pos(2, "3/4"), hintsUsed: 3 }, fam);
    assert.equal(tried.json.answer, pos(2, "5/6"));
    assert.equal((await call("POST", `${path}/check`, { question: 0, choice: pos(0, "4/5"), hintsUsed: 0 }, fam)).json.correct, true);

    const hoot = await call("POST", `/children/${kid}/tutor/b3-math-comparing-fractions`, { message: "can you help?" }, fam);
    assert.equal(hoot.status, 200);
    const safe = await call("POST", `/children/${kid}/tutor/b3-math-comparing-fractions`, { message: "my phone number is 555 123 4567" }, fam);
    assert.equal(safe.json.flagged, true, "the pre-check runs on the phone too");

    const exp = await call("GET", "/parent/export", undefined, par);
    assert.equal(exp.status, 200);
    assert.ok(!JSON.stringify(exp.json).includes("password_hash"));

    // tokens made on the phone are plain HS256 tokens the server's code accepts too
    setPlatform(createNodePlatform());
    assert.equal((await call("GET", "/family", undefined, fam)).status, 200, "a phone-made token verifies with the Node platform");
  });

  test("own AI model: the written address is still checked; names are not looked up (no DNS on a phone)", async () => {
    setPlatform(phone);
    const app = createApp({ db: openDb(":memory:"), content: loadContent("bundled"), tutor: new MockTutor(), mailer: new MemoryMailer() });
    const call = async (method: string, path: string, body?: unknown, token?: string) => {
      const res = await app.request(path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, json: (await res.json()) as any };
    };
    const fam = (await call("POST", "/auth/signup", { email: "ai@example.com", password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION })).json.familyToken;
    const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken;
    const save = (baseUrl: string) => call("PUT", "/parent/ai", { password: "correct horse", provider: "custom", baseUrl, model: "llama3.2", apiKey: "sk-phone-key-1234567890" }, par);
    assert.equal((await save("http://169.254.169.254/latest")).status, 400, "the metadata address is refused");
    assert.equal((await save("http://example.org/v1")).status, 400, "plain http to the internet is refused");
    const ok = await save("https://models.example.org/v1");
    assert.equal(ok.status, 200, "a name is accepted without a DNS lookup");
    assert.equal(ok.json.settings.keyLast4, "7890");
    assert.ok(!JSON.stringify(ok.json).includes("sk-phone-key"));
  });
});
