// Not part of the app. scripts/local-core-proof.mjs bundles this file with Expo's own bundler (`expo export:embed`, the same
// Metro and Babel settings as an Android build) and runs the bundle with no Node.js APIs, to prove that the shared API runs
// there (tasks T8a, T8b). It uses what the phone uses: the content bundled through content-files.generated.ts and the expo-sqlite
// adapter; only the expo-sqlite database itself comes from outside (a stand-in, since there is no phone). It walks one family
// through the main paths and reports each step. It does not import device.ts, which needs the native modules.
import { Chess } from "chess.js";
import { chooseReply, gameOutcome } from "../../../server/src/games/computer-opponent.ts";
import { contentFiles } from "./content-files.generated";
import { createLocalApi } from "./core";
import { expoSqliteAdapter, type ExpoSqliteLike } from "./sqlite-adapter";

export interface ProofStep {
  name: string;
  ok: boolean;
  detail?: string;
}

async function run(opts: { expoDb: ExpoSqliteLike }): Promise<ProofStep[]> {
  const steps: ProofStep[] = [];
  const check = (name: string, ok: boolean, detail?: unknown) => steps.push({ name, ok, detail: detail === undefined ? undefined : JSON.stringify(detail).slice(0, 300) });
  const api = createLocalApi({ adapter: await expoSqliteAdapter(opts.expoDb), files: contentFiles });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await api.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { notJson: text.slice(0, 200) };
    }
    return { status: res.status, json };
  };

  const health = await call("GET", "/health");
  check("health answers and counts the bundled lessons", health.status === 200 && health.json.lessons > 200, health);
  const map = await call("GET", "/content/map");
  check("consent version from the map", typeof map.json.consentVersion === "string", map.json.consentVersion);

  const signup = await call("POST", "/auth/signup", { email: "phone@example.com", password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: map.json.consentVersion });
  check("sign up (scrypt and a signed token on the device)", signup.status === 201 && typeof signup.json.familyToken === "string", signup.status);
  const fam = signup.json.familyToken as string;
  const phrase = signup.json.recoveryPhrase as string | undefined;
  check("sign-up shows a recovery phrase instead of sending email", /^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/.test(phrase ?? ""));
  check("email routes say they are not on this device", (await call("POST", "/auth/forgot-password", { email: "phone@example.com" })).json.error === "not_on_this_device");
  const wrongPin = await call("POST", "/auth/parent-unlock", { pin: "1111" }, fam);
  check("a wrong PIN is refused", wrongPin.status === 401, wrongPin.json);
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  check("the right PIN opens the parent area", typeof par === "string");
  const child = await call("POST", "/parent/children", { nickname: "Sam", birthYear: new Date().getFullYear() - 9 }, par);
  check("add a child", child.status === 201 || child.status === 200, child.status);
  const kid = child.json.child?.id as string;
  check("the family token cannot open the parent area", (await call("GET", "/parent/overview", undefined, fam)).status === 403);

  const path = `/children/${kid}/lessons/b3-math-comparing-fractions`;
  const lesson = await call("GET", path, undefined, fam);
  const raw = JSON.stringify(lesson.json);
  check("a lesson arrives without answers, hints or explanations", lesson.status === 200 && !raw.includes('"answer"') && !raw.includes('"hints"') && !raw.includes('"explain"'), lesson.status === 200 ? undefined : lesson);
  if (lesson.status !== 200) return steps;
  const shown = lesson.json.lesson as { quiz: { options: string[] }[] };
  const pos = (qi: number, text: string) => shown.quiz[qi]!.options.indexOf(text);
  check("hints must be opened in order", (await call("POST", `${path}/hint`, { question: 2, level: 2 }, fam)).json.error === "hint_out_of_order");
  let ladder = true;
  for (const level of [0, 1, 2]) ladder &&= (await call("POST", `${path}/hint`, { question: 2, level }, fam)).status === 200;
  check("the hint ladder opens step by step", ladder);
  const tried = await call("POST", `${path}/check`, { question: 2, choice: pos(2, "3/4"), hintsUsed: 3 }, fam);
  check("the answer is revealed only after all three hints", tried.json.answer === pos(2, "5/6") && !!tried.json.explain, tried.json);
  const right = await call("POST", `${path}/check`, { question: 0, choice: pos(0, "4/5"), hintsUsed: 0 }, fam);
  check("a right answer is recognised", right.json.correct === true, right.json);

  const hoot = await call("POST", `/children/${kid}/tutor/b3-math-comparing-fractions`, { message: "can you help me?" }, fam);
  check("Hoot answers with the lesson's own hint (no AI)", hoot.status === 200 && typeof hoot.json.reply === "string", hoot.json.reply);
  const pii = await call("POST", `/children/${kid}/tutor/b3-math-comparing-fractions`, { message: "my phone number is 555 123 4567" }, fam);
  check("Hoot's pre-check catches personal information", pii.json.flagged === true, pii.json);
  await call("POST", `/children/${kid}/tutor/b3-math-comparing-fractions`, { message: "I want to hurt myself" }, fam);
  const alerts = (await call("GET", "/parent/overview", undefined, par)).json.children?.[0]?.wellbeingAlerts;
  const attention = (await call("GET", "/family", undefined, fam)).json.attention;
  check("a wellbeing message shows the parent-area notice (no email on a phone)", alerts === 1 && attention === true, { alerts, attention });
  await call("POST", `/parent/children/${kid}/wellbeing-seen`, undefined, par);
  check("the notice goes once the parent has checked in", (await call("GET", "/family", undefined, fam)).json.attention === false);

  const aiKey = await call("PUT", "/parent/ai", { password: "correct horse", provider: "custom", baseUrl: "https://models.example.org/v1", model: "llama3.2", apiKey: "sk-phone-key-1234567890" }, par);
  check("an own AI key is sealed with AES-GCM on the device and never returned", aiKey.status === 200 && aiKey.json.settings?.keyLast4 === "7890" && !JSON.stringify(aiKey.json).includes("sk-phone-key"), aiKey.status);
  const metadata = await call("PUT", "/parent/ai", { password: "correct horse", provider: "custom", baseUrl: "http://169.254.169.254/latest", model: "x" }, par);
  check("the metadata address is still refused", metadata.status === 400);

  // chess against the computer (T5d): the engine runs in the same Node-free sandbox as the API, and its moves are legal
  const chess = new Chess();
  let plies = 0;
  let fromEngine = true;
  const started = Date.now();
  while (!gameOutcome(chess).over && plies < 24) {
    const reply = chooseReply(chess, 3);
    if (!reply) break;
    fromEngine &&= reply.source === "engine";
    chess.move({ from: reply.from, to: reply.to, promotion: reply.promotion }); // throws if the move is illegal
    plies++;
  }
  check("the chess engine plays 24 legal moves without Node.js", plies === 24 && fromEngine, { plies, fromEngine, ms: Date.now() - started });

  const exp = await call("GET", "/parent/export", undefined, par);
  check("the data download works and holds no password hash", exp.status === 200 && !JSON.stringify(exp.json).includes("password_hash"));
  // Importing a download (task #9, routes/parent-import.ts) on the phone: the same download under another child id comes back as a new child.
  const dl = JSON.parse(JSON.stringify(exp.json)) as { children: { id: string }[]; progress: { child_id: string }[]; spellingProgress: { child_id: string }[] };
  const again = await call("POST", "/parent/import", { data: dl }, par);
  check("a download of a child that is already here is not copied", again.status === 200 && again.json.skipped?.[0]?.reason === "already_here", again.json);
  dl.children[0]!.id = "copy-of-" + dl.children[0]!.id;
  for (const row of [...dl.progress, ...dl.spellingProgress]) row.child_id = dl.children[0]!.id;
  const copied = await call("POST", "/parent/import", { data: dl }, par);
  check("a download is imported as a new child, with hints and solved questions left behind", copied.status === 201 && copied.json.imported?.length === 1, copied.json);
  if (copied.json.imported?.[0]) check("the imported child can be deleted", (await call("DELETE", `/parent/children/${copied.json.imported[0].id}`, undefined, par)).status === 200);
  // last: the host then checks that the child's hints, solved questions and Hoot chats went with them (ON DELETE CASCADE)
  check("deleting the child", (await call("DELETE", `/parent/children/${kid}`, undefined, par)).status === 200);

  // very last, because it signs out every session: the recovery phrase resets a forgotten password
  const recovered = await call("POST", "/auth/recover", { email: "phone@example.com", phrase: (phrase ?? "").toLowerCase(), newPassword: "a brand new password" });
  check("the recovery phrase resets the password and signs out the old session", recovered.status === 200 && (await call("GET", "/family", undefined, fam)).status === 401, recovered.status);
  check("the new password signs in", (await call("POST", "/auth/login", { email: "phone@example.com", password: "a brand new password" })).status === 200);
  return steps;
}

(globalThis as { __honestLearnLocalProof?: typeof run }).__honestLearnLocalProof = run;
