import { randomInt } from "node:crypto";
import { Hono, type Context, type Next } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { cors } from "hono/cors";
import { z } from "zod";
import { config } from "./config.ts";
import { now, type DB } from "./db.ts";
import { lessonSummary, publicLesson, type ContentStore, type Lesson } from "./content.ts";
import {
  ageFromBirthYear,
  bandForAge,
  hashSecret,
  issueToken,
  newId,
  readToken,
  verifySecret,
  type BandId,
  type Scope,
} from "./security.ts";
import { precheck, type TutorProvider, type TutorTurn } from "./tutor.ts";
import { lessonWikiTitle, WikiClient, wikiHostFor } from "./wiki.ts";
import { optionOrder } from "./shuffle.ts";
import { createMailer, type Mailer } from "./mailer.ts";

export const CONSENT_VERSION = "2026-11-v1";

type Env = { Variables: { parentId: string; scope: Scope } };

interface ParentRow {
  id: string;
  email: string;
  password_hash: string;
  pin_hash: string;
  pin_failed: number;
  pin_locked_until: string | null;
  login_failed: number;
  login_locked_until: string | null;
  email_verified_at: string | null;
  consent_at: string;
  created_at: string;
}
interface ChildRow {
  id: string;
  parent_id: string;
  nickname: string;
  birth_year: number;
  avatar: string;
  band_override: string | null;
  unlocked_topics: string;
  ai_enabled: number;
  daily_minutes: number;
  created_at: string;
}

const Email = z.string().trim().toLowerCase().email().max(200);
const Pin = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");
const Password = z.string().min(8, "Password must be at least 8 characters").max(200);
const AVATARS = ["owl", "fox", "cat", "dog", "panda", "turtle", "rabbit", "lion"] as const;

const thisYear = () => new Date().getFullYear();
const BirthYear = z
  .number()
  .int()
  .refine((y) => {
    const age = thisYear() - y;
    return age >= 3 && age <= 18;
  }, "Honest Learn is for ages 3–18");

const ChildCreate = z.object({
  nickname: z.string().trim().min(1).max(30),
  birthYear: BirthYear,
  avatar: z.enum(AVATARS).default("owl"),
});
const ChildPatch = z.object({
  nickname: z.string().trim().min(1).max(30).optional(),
  birthYear: BirthYear.optional(),
  avatar: z.enum(AVATARS).optional(),
  bandOverride: z.enum(["b1", "b2", "b3", "b4", "b5"]).nullable().optional(),
  unlockedTopics: z.array(z.enum(["religion", "body", "politics"])).optional(),
  aiEnabled: z.boolean().optional(),
  dailyMinutes: z.number().int().min(5).max(240).optional(),
});

function childBand(c: ChildRow): BandId {
  return (c.band_override as BandId | null) ?? bandForAge(ageFromBirthYear(c.birth_year));
}

function childPublic(c: ChildRow) {
  const band = childBand(c);
  return {
    id: c.id,
    nickname: c.nickname,
    birthYear: c.birth_year,
    age: ageFromBirthYear(c.birth_year),
    avatar: c.avatar,
    band,
    bandOverride: c.band_override,
    unlockedTopics: JSON.parse(c.unlocked_topics) as string[],
    // Chat is never available to the youngest band, whatever the setting.
    aiEnabled: c.ai_enabled === 1 && band !== "b1",
    aiAllowedForAge: band !== "b1",
    dailyMinutes: c.daily_minutes,
  };
}

/** Days until a finished lesson should come back for a quick review (spaced repetition). */
export function reviewIntervalDays(score: number, total: number, attempts: number): number {
  if (score < total) return 1;
  return Math.min(3 * 2 ** (attempts - 1), 30);
}

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "day must be YYYY-MM-DD");
/** The child's local date may be up to a day either side of UTC. */
function plausibleDay(day: string): boolean {
  const diff = Math.abs(Date.parse(day + "T12:00:00Z") - Date.now());
  return Number.isFinite(diff) && diff <= 1.6 * 86_400_000;
}

export function createApp(deps: { db: DB; content: ContentStore; tutor: TutorProvider; wiki?: WikiClient; mailer?: Mailer }) {
  const { db, content, tutor } = deps;
  const wiki = deps.wiki ?? new WikiClient();
  const mailer = deps.mailer ?? createMailer();
  const app = new Hono<Env>();

  app.use("*", cors({ origin: config.corsOrigins.includes("*") ? "*" : config.corsOrigins }));
  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    if (err instanceof z.ZodError) {
      return c.json({ error: "invalid_input", details: err.issues.map((i) => i.message) }, 400);
    }
    console.error(err);
    return c.json({ error: "server_error" }, 500);
  });

  // ---------------------------------------------------------------- helpers
  const getParent = (id: string) => db.get<ParentRow>("SELECT * FROM parents WHERE id = ?", [id]);
  const getParentByEmail = (email: string) => db.get<ParentRow>("SELECT * FROM parents WHERE email = ?", [email]);
  const getChild = (id: string, parentId: string) =>
    db.get<ChildRow>("SELECT * FROM children WHERE id = ? AND parent_id = ?", [id, parentId]);
  const listChildren = (parentId: string) =>
    db.all<ChildRow>("SELECT * FROM children WHERE parent_id = ? ORDER BY created_at", [parentId]);

  const requireScope = (needed: Scope) => async (c: Context<Env>, next: Next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const claims = token ? await readToken(token) : null;
    if (!claims) return c.json({ error: "not_signed_in" }, 401);
    if (needed === "parent" && claims.scope !== "parent") return c.json({ error: "parent_pin_required" }, 403);
    if (!(await getParent(claims.sub))) return c.json({ error: "not_signed_in" }, 401);
    c.set("parentId", claims.sub);
    c.set("scope", claims.scope);
    await next();
  };

  const loadChild = async (c: Context<Env>): Promise<ChildRow | null> =>
    (await getChild(c.req.param("childId") ?? "", c.get("parentId"))) ?? null;

  function visibleTo(child: ChildRow, l: Lesson): boolean {
    if (l.band !== childBand(child)) return false;
    if (l.status !== "reviewed" && !config.showDrafts) return false;
    if (l.sensitive && !(JSON.parse(child.unlocked_topics) as string[]).includes(l.sensitive)) return false;
    return true;
  }

  async function lessonFor(c: Context<Env>): Promise<{ child: ChildRow; lesson: Lesson } | Response> {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const lesson = content.lessons.get(c.req.param("lessonId") ?? "");
    if (!lesson) return c.json({ error: "lesson_not_found" }, 404);
    if (!visibleTo(child, lesson)) {
      return c.json({ error: lesson.sensitive ? "needs_parent_permission" : "lesson_not_available" }, 403);
    }
    return { child, lesson };
  }

  const isLocked = (until: string | null) => !!until && new Date(until) > new Date();
  const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

  // ---------------------------------------------------------------- rate limiting (auth)
  const hits = new Map<string, { count: number; resetAt: number }>();
  function clientIp(c: Context): string {
    if (config.trustProxy) {
      const fwd = c.req.header("x-forwarded-for");
      if (fwd) return fwd.split(",")[0]!.trim();
    }
    try {
      return getConnInfo(c).remote.address ?? "unknown";
    } catch {
      return "unknown";
    }
  }
  app.use("/auth/*", async (c, next) => {
    const ip = clientIp(c);
    const t = Date.now();
    const h = hits.get(ip);
    if (!h || h.resetAt < t) hits.set(ip, { count: 1, resetAt: t + config.security.authRateWindowMinutes * 60_000 });
    else if (++h.count > config.security.authRateLimit) {
      c.header("retry-after", String(Math.ceil((h.resetAt - t) / 1000)));
      return c.json({ error: "too_many_attempts" }, 429);
    }
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt < t) hits.delete(k);
    await next();
  });

  // ---------------------------------------------------------------- one-time codes
  type Purpose = "verify_email" | "reset_password";
  async function sendCode(p: { id: string; email: string }, purpose: Purpose) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.run(
      `INSERT INTO auth_codes (parent_id, purpose, code_hash, expires_at, attempts, sent_at) VALUES (?,?,?,?,0,?)
       ON CONFLICT (parent_id, purpose) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`,
      [p.id, purpose, hashSecret(code), minutesFromNow(config.security.codeMinutes), now()],
    );
    const subject = purpose === "verify_email" ? "Your Honest Learn verification code" : "Reset your Honest Learn password";
    const text =
      purpose === "verify_email"
        ? `Welcome to Honest Learn!\n\nYour verification code is: ${code}\n\nIt expires in ${config.security.codeMinutes} minutes.`
        : `Someone (hopefully you) asked to reset your Honest Learn password.\n\nYour reset code is: ${code}\n\nIt expires in ${config.security.codeMinutes} minutes. If you didn't ask for this, you can ignore this email.`;
    try {
      await mailer.send(p.email, subject, text);
    } catch (e) {
      console.error("mail failed", e);
    }
  }
  async function useCode(parentId: string, purpose: Purpose, code: string): Promise<"ok" | "invalid" | "expired"> {
    // Count the try before checking it, in one statement, so parallel requests can't get extra guesses.
    const row = await db.get<{ code_hash: string; expires_at: string; attempts: number }>(
      "UPDATE auth_codes SET attempts = attempts + 1 WHERE parent_id = ? AND purpose = ? RETURNING code_hash, expires_at, attempts",
      [parentId, purpose],
    );
    if (!row) return "invalid";
    if (new Date(row.expires_at) < new Date() || row.attempts > config.security.codeMaxAttempts) return "expired";
    if (!verifySecret(code, row.code_hash)) return "invalid";
    await db.run("DELETE FROM auth_codes WHERE parent_id = ? AND purpose = ?", [parentId, purpose]);
    return "ok";
  }

  // ---------------------------------------------------------------- PIN and password tries
  // Each guess first takes a numbered try with one atomic UPDATE, so parallel requests (or several
  // servers) can't get more guesses than the limit. Reaching the limit locks for a while and resets the count.
  type Tries = { failed: "pin_failed" | "login_failed"; lockedUntil: "pin_locked_until" | "login_locked_until"; max: () => number; lockMinutes: () => number };
  const PIN_TRIES: Tries = {
    failed: "pin_failed",
    lockedUntil: "pin_locked_until",
    max: () => config.security.pinMaxAttempts,
    lockMinutes: () => config.security.pinLockMinutes,
  };
  const LOGIN_TRIES: Tries = {
    failed: "login_failed",
    lockedUntil: "login_locked_until",
    max: () => config.security.loginMaxAttempts,
    lockMinutes: () => config.security.loginLockMinutes,
  };
  async function takeTry(t: Tries, parentId: string): Promise<number> {
    const row = await db.get<{ n: number }>(`UPDATE parents SET ${t.failed} = ${t.failed} + 1 WHERE id = ? RETURNING ${t.failed} AS n`, [parentId]);
    return row!.n;
  }
  /** After a wrong guess: locks once this was the last allowed try. Returns the lock end, or null. */
  async function wrongTry(t: Tries, parentId: string, tryNo: number): Promise<string | null> {
    if (tryNo < t.max()) return null;
    const lock = minutesFromNow(t.lockMinutes());
    await db.run(`UPDATE parents SET ${t.failed} = 0, ${t.lockedUntil} = ? WHERE id = ?`, [lock, parentId]);
    return lock;
  }

  // ---------------------------------------------------------------- public
  app.get("/health", (c) => c.json({ ok: true, lessons: content.lessons.size, tutor: config.tutor.mode, demo: db.demo }));

  app.get("/content/map", (c) =>
    c.json({
      version: content.map.version,
      bands: content.map.bands,
      subjects: content.map.subjects,
      sensitiveTopics: content.map.sensitiveTopics,
      consentVersion: CONSENT_VERSION,
    }),
  );

  // ---------------------------------------------------------------- auth
  app.post("/auth/signup", async (c) => {
    const body = z
      .object({
        email: Email,
        password: Password,
        pin: Pin,
        confirmAdult: z.literal(true, { message: "You must confirm you are a parent or guardian aged 18+" }),
        consentVersion: z.literal(CONSENT_VERSION, { message: "Please accept the current privacy notice" }),
      })
      .parse(await c.req.json());
    if (await getParentByEmail(body.email)) return c.json({ error: "email_taken" }, 409);
    const id = newId();
    await db.run(
      "INSERT INTO parents (id, email, password_hash, pin_hash, consent_version, consent_at, created_at) VALUES (?,?,?,?,?,?,?)",
      [id, body.email, hashSecret(body.password), hashSecret(body.pin), body.consentVersion, now(), now()],
    );
    await sendCode({ id, email: body.email }, "verify_email");
    return c.json({ familyToken: await issueToken(id, "family") }, 201);
  });

  app.post("/auth/verify-email", requireScope("family"), async (c) => {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }).parse(await c.req.json());
    const r = await useCode(c.get("parentId"), "verify_email", code);
    if (r !== "ok") return c.json({ error: r === "expired" ? "code_expired" : "wrong_code" }, 400);
    await db.run("UPDATE parents SET email_verified_at = ? WHERE id = ?", [now(), c.get("parentId")]);
    return c.json({ ok: true });
  });

  app.post("/auth/resend-verification", requireScope("family"), async (c) => {
    const p = (await getParent(c.get("parentId")))!;
    if (p.email_verified_at) return c.json({ ok: true, alreadyVerified: true });
    const last = await db.get<{ sent_at: string }>("SELECT sent_at FROM auth_codes WHERE parent_id = ? AND purpose = 'verify_email'", [p.id]);
    if (last && Date.now() - Date.parse(last.sent_at) < 60_000) return c.json({ error: "wait_a_minute" }, 429);
    await sendCode(p, "verify_email");
    return c.json({ ok: true });
  });

  /** Always answers the same way, so it can't be used to discover which emails have accounts. */
  app.post("/auth/forgot-password", async (c) => {
    const { email } = z.object({ email: Email }).parse(await c.req.json());
    const p = await getParentByEmail(email);
    if (p) await sendCode(p, "reset_password");
    return c.json({ ok: true });
  });

  app.post("/auth/reset-password", async (c) => {
    const body = z.object({ email: Email, code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"), newPassword: Password }).parse(await c.req.json());
    const p = await getParentByEmail(body.email);
    const r = p ? await useCode(p.id, "reset_password", body.code) : "invalid";
    if (!p || r !== "ok") return c.json({ error: r === "expired" ? "code_expired" : "wrong_code" }, 400);
    // A reset code proves access to the inbox, so it also verifies the email.
    await db.run(
      "UPDATE parents SET password_hash = ?, login_failed = 0, login_locked_until = NULL, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?",
      [hashSecret(body.newPassword), now(), p.id],
    );
    return c.json({ familyToken: await issueToken(p.id, "family") });
  });

  /** Forgot the PIN: the account password can set a new one. */
  app.post("/auth/reset-pin", requireScope("family"), async (c) => {
    const body = z.object({ password: z.string(), newPin: Pin }).parse(await c.req.json());
    const p = (await getParent(c.get("parentId")))!;
    if (isLocked(p.login_locked_until)) return c.json({ error: "too_many_attempts" }, 429);
    const tryNo = await takeTry(LOGIN_TRIES, p.id);
    if (tryNo > LOGIN_TRIES.max()) {
      await wrongTry(LOGIN_TRIES, p.id, tryNo);
      return c.json({ error: "too_many_attempts" }, 429);
    }
    if (!verifySecret(body.password, p.password_hash)) {
      await wrongTry(LOGIN_TRIES, p.id, tryNo);
      return c.json({ error: "wrong_email_or_password" }, 401);
    }
    await db.run("UPDATE parents SET pin_hash = ?, pin_failed = 0, pin_locked_until = NULL, login_failed = 0 WHERE id = ?", [hashSecret(body.newPin), p.id]);
    return c.json({ ok: true });
  });

  app.post("/auth/login", async (c) => {
    const body = z.object({ email: Email, password: z.string() }).parse(await c.req.json());
    const p = await getParentByEmail(body.email);
    if (!p) return c.json({ error: "wrong_email_or_password" }, 401);
    if (isLocked(p.login_locked_until)) return c.json({ error: "too_many_attempts", retryAt: p.login_locked_until }, 429);
    const tryNo = await takeTry(LOGIN_TRIES, p.id);
    if (tryNo > LOGIN_TRIES.max()) {
      const lock = await wrongTry(LOGIN_TRIES, p.id, tryNo);
      return c.json({ error: "too_many_attempts", retryAt: lock }, 429);
    }
    if (!verifySecret(body.password, p.password_hash)) {
      await wrongTry(LOGIN_TRIES, p.id, tryNo);
      return c.json({ error: "wrong_email_or_password" }, 401);
    }
    await db.run("UPDATE parents SET login_failed = 0, login_locked_until = NULL WHERE id = ?", [p.id]);
    return c.json({ familyToken: await issueToken(p.id, "family") });
  });

  /** Parent enters their PIN to get a short-lived parent token. */
  app.post("/auth/parent-unlock", requireScope("family"), async (c) => {
    const { pin } = z.object({ pin: z.string() }).parse(await c.req.json());
    const p = (await getParent(c.get("parentId")))!;
    if (isLocked(p.pin_locked_until)) return c.json({ error: "too_many_attempts", retryAt: p.pin_locked_until }, 429);
    const tryNo = await takeTry(PIN_TRIES, p.id);
    if (tryNo > PIN_TRIES.max()) {
      const lock = await wrongTry(PIN_TRIES, p.id, tryNo);
      return c.json({ error: "too_many_attempts", retryAt: lock }, 429);
    }
    if (!verifySecret(pin, p.pin_hash)) {
      const lock = await wrongTry(PIN_TRIES, p.id, tryNo);
      return c.json(
        { error: "wrong_pin", attemptsLeft: lock ? 0 : PIN_TRIES.max() - tryNo, ...(lock ? { retryAt: lock } : {}) },
        401,
      );
    }
    await db.run("UPDATE parents SET pin_failed = 0, pin_locked_until = NULL WHERE id = ?", [p.id]);
    return c.json({ parentToken: await issueToken(p.id, "parent"), expiresInSec: config.security.parentTokenMinutes * 60 });
  });

  // ---------------------------------------------------------------- family (child-facing)
  const fam = new Hono<Env>();
  fam.use("*", requireScope("family"));

  fam.get("/family", async (c) => {
    const p = (await getParent(c.get("parentId")))!;
    const kids = (await listChildren(p.id)).map(childPublic);
    return c.json({ parent: { email: p.email, emailVerified: !!p.email_verified_at }, children: kids });
  });

  fam.get("/children/:childId/home", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const band = childBand(child);
    const visible = [...content.lessons.values()].filter((l) => visibleTo(child, l));
    const done = await db.all<{ lesson_id: string; best_score: number; total: number; review_due: string }>(
      "SELECT lesson_id, best_score, total, review_due FROM progress WHERE child_id = ?",
      [child.id],
    );
    const doneIds = new Set(done.map((d) => d.lesson_id));
    const subjects = content.map.subjects
      .filter((s) => !s.bands || s.bands.includes(band))
      .map((s) => {
        const ls = visible.filter((l) => l.subject === s.id);
        return { ...s, lessonCount: ls.length, completed: ls.filter((l) => doneIds.has(l.id)).length };
      });
    const reviewDue = done
      .filter((d) => new Date(d.review_due) <= new Date() && content.lessons.has(d.lesson_id))
      .map((d) => content.lessons.get(d.lesson_id)!)
      .filter((l) => visibleTo(child, l))
      .map(lessonSummary);
    const bandInfo = content.map.bands.find((b) => b.id === band);
    return c.json({ child: childPublic(child), band: bandInfo, subjects, reviewDue });
  });

  fam.get("/children/:childId/lessons", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const subject = c.req.query("subject");
    const progress = new Map(
      (
        await db.all<{ lesson_id: string; best_score: number; total: number }>(
          "SELECT lesson_id, best_score, total FROM progress WHERE child_id = ?",
          [child.id],
        )
      ).map((p) => [p.lesson_id, p]),
    );
    const all = [...content.lessons.values()].filter((l) => l.band === childBand(child) && (!subject || l.subject === subject));
    const lessons = all
      .filter((l) => visibleTo(child, l))
      .map((l) => ({ ...lessonSummary(l), progress: progress.get(l.id) ?? null }));
    // Tell the app that locked lessons exist (so it can say "ask a parent"), without their content.
    const locked = all.filter((l) => l.sensitive && !visibleTo(child, l)).length;
    return c.json({ lessons, lockedCount: locked });
  });

  fam.get("/children/:childId/lessons/:lessonId", async (c) => {
    const r = await lessonFor(c);
    if (r instanceof Response) return r;
    const solved = (
      await db.all<{ q_index: number }>("SELECT q_index FROM quiz_solved WHERE child_id = ? AND lesson_id = ?", [r.child.id, r.lesson.id])
    ).map((s) => s.q_index);
    return c.json({ lesson: publicLesson(r.lesson, (i, n) => optionOrder(r.child.id, r.lesson.id, i, n)), solved });
  });

  /** Wikipedia summary for this lesson's topic (ages 9+; Simple English for 9–11). */
  fam.get("/children/:childId/lessons/:lessonId/learn-more", async (c) => {
    const r = await lessonFor(c);
    if (r instanceof Response) return r;
    const band = childBand(r.child);
    if (!wikiHostFor(band)) return c.json({ available: false, reason: "not_for_age" });
    const title = lessonWikiTitle(r.lesson);
    if (!title) return c.json({ available: false, reason: "no_article" });
    const summary = await wiki.summary(band, title);
    if (!summary) return c.json({ available: false, reason: "not_found" });
    return c.json({ available: true, ...summary, opensWithParentPin: band === "b3" });
  });

  /** Curated free learning resources outside the app, for this child's age (and optionally one subject). */
  fam.get("/children/:childId/resources", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const band = childBand(child);
    const subject = c.req.query("subject");
    const resources = content.resources.filter((r) => r.bands.includes(band) && (!subject || r.subjects.includes(subject)));
    // Under-13s need a grown-up to open outside links (app-store kids rules); teens get a "leaving the app" notice.
    return c.json({ resources, opensWithParentPin: band === "b1" || band === "b2" || band === "b3" });
  });

  const QuestionRef = z.object({ question: z.number().int().min(0) });

  fam.post("/children/:childId/lessons/:lessonId/hint", async (c) => {
    const r = await lessonFor(c);
    if (r instanceof Response) return r;
    const body = QuestionRef.extend({ level: z.number().int().min(0).max(2) }).parse(await c.req.json());
    const q = r.lesson.quiz[body.question];
    if (!q) return c.json({ error: "question_not_found" }, 404);
    return c.json({ hint: q.hints[body.level], level: body.level, isLast: body.level === 2 });
  });

  fam.post("/children/:childId/lessons/:lessonId/check", async (c) => {
    const r = await lessonFor(c);
    if (r instanceof Response) return r;
    const body = QuestionRef.extend({ choice: z.number().int().min(0), hintsUsed: z.number().int().min(0).max(3) }).parse(
      await c.req.json(),
    );
    const q = r.lesson.quiz[body.question];
    if (!q) return c.json({ error: "question_not_found" }, 404);
    // body.choice is the position on screen; map it back to the lesson's own option index.
    const order = optionOrder(r.child.id, r.lesson.id, body.question, q.options.length);
    if (body.choice >= order.length) return c.json({ error: "invalid_input", details: ["choice out of range"] }, 400);
    const correct = order[body.choice] === q.answer;
    if (correct) {
      await db.run("INSERT INTO quiz_solved (child_id, lesson_id, q_index, solved_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING", [
        r.child.id,
        r.lesson.id,
        body.question,
        now(),
      ]);
    }
    // The explanation is only revealed after success, or after the learner tried with every hint.
    const reveal = correct || body.hintsUsed >= 3;
    return c.json({ correct, explain: reveal ? q.explain : null, answer: !correct && reveal ? order.indexOf(q.answer) : null });
  });

  fam.post("/children/:childId/lessons/:lessonId/complete", async (c) => {
    const r = await lessonFor(c);
    if (r instanceof Response) return r;
    const { choices } = z.object({ choices: z.array(z.number().int()) }).parse(await c.req.json());
    if (choices.length !== r.lesson.quiz.length) return c.json({ error: "answer_every_question" }, 400);
    const score = r.lesson.quiz.filter((q, i) => optionOrder(r.child.id, r.lesson.id, i, q.options.length)[choices[i]!] === q.answer).length;
    const total = r.lesson.quiz.length;
    const prev = await db.get<{ best_score: number; attempts: number }>(
      "SELECT best_score, attempts FROM progress WHERE child_id = ? AND lesson_id = ?",
      [r.child.id, r.lesson.id],
    );
    const attempts = (prev?.attempts ?? 0) + 1;
    const best = Math.max(score, prev?.best_score ?? 0);
    const due = new Date(Date.now() + reviewIntervalDays(score, total, attempts) * 86_400_000).toISOString();
    await db.run(
      `INSERT INTO progress (child_id, lesson_id, best_score, total, attempts, completed_at, review_due)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (child_id, lesson_id) DO UPDATE SET best_score = excluded.best_score, total = excluded.total,
         attempts = excluded.attempts, completed_at = excluded.completed_at, review_due = excluded.review_due`,
      [r.child.id, r.lesson.id, best, total, attempts, now(), due],
    );
    return c.json({ score, total, best, reviewDue: due });
  });

  // ---- practice quiz: mixed questions from a subject (retrieval practice, not scored)
  fam.get("/children/:childId/practice", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const subject = c.req.query("subject");
    const done = new Set(
      (await db.all<{ lesson_id: string }>("SELECT lesson_id FROM progress WHERE child_id = ?", [child.id])).map((p) => p.lesson_id),
    );
    const pool = [...content.lessons.values()]
      .filter((l) => visibleTo(child, l) && (!subject || l.subject === subject))
      .flatMap((l) => l.quiz.map((q, i) => ({ l, q, i, done: done.has(l.id) })));
    // Prefer questions from lessons already finished (that's what makes practice stick), then the rest.
    const shuffled = pool
      .map((x) => ({ x, k: (x.done ? 0 : 1) + Math.random() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, 5)
      .map(({ x }) => ({
        lessonId: x.l.id,
        lessonTitle: x.l.title,
        question: x.i,
        q: x.q.q,
        options: optionOrder(child.id, x.l.id, x.i, x.q.options.length).map((o) => x.q.options[o]!),
      }));
    return c.json({ questions: shuffled });
  });

  // ---- reasoning puzzles (IQ-style practice — never an IQ score)
  const puzzleSetFor = (child: ChildRow) => {
    const set = content.puzzles.get(childBand(child));
    return set && (set.status === "reviewed" || config.showDrafts) ? set : null;
  };
  fam.get("/children/:childId/puzzles", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const set = puzzleSetFor(child);
    if (!set) return c.json({ available: false });
    const best =
      (await db.get("SELECT best_score, total FROM progress WHERE child_id = ? AND lesson_id = ?", [child.id, `puzzles-${set.band}`])) ?? null;
    return c.json({
      available: true,
      title: set.title,
      status: set.status,
      best,
      puzzles: set.puzzles.map((p, i) => ({
        id: p.id,
        type: p.type,
        q: p.q,
        options: optionOrder(child.id, `puzzles-${set.band}`, i, p.options.length).map((o) => p.options[o]!),
      })),
    });
  });
  fam.post("/children/:childId/puzzles/hint", async (c) => {
    const child = await loadChild(c);
    const set = child && puzzleSetFor(child);
    if (!child || !set) return c.json({ error: "not_found" }, 404);
    const b = z.object({ question: z.number().int().min(0), level: z.number().int().min(0).max(2) }).parse(await c.req.json());
    const p = set.puzzles[b.question];
    if (!p) return c.json({ error: "question_not_found" }, 404);
    return c.json({ hint: p.hints[b.level], level: b.level, isLast: b.level === 2 });
  });
  fam.post("/children/:childId/puzzles/check", async (c) => {
    const child = await loadChild(c);
    const set = child && puzzleSetFor(child);
    if (!child || !set) return c.json({ error: "not_found" }, 404);
    const b = z.object({ question: z.number().int().min(0), choice: z.number().int().min(0), hintsUsed: z.number().int().min(0).max(3) }).parse(await c.req.json());
    const p = set.puzzles[b.question];
    if (!p) return c.json({ error: "question_not_found" }, 404);
    const order = optionOrder(child.id, `puzzles-${set.band}`, b.question, p.options.length);
    if (b.choice >= order.length) return c.json({ error: "invalid_input", details: ["choice out of range"] }, 400);
    const correct = order[b.choice] === p.answer;
    const reveal = correct || b.hintsUsed >= 3;
    return c.json({ correct, explain: reveal ? p.explain : null, answer: !correct && reveal ? order.indexOf(p.answer) : null });
  });
  fam.post("/children/:childId/puzzles/complete", async (c) => {
    const child = await loadChild(c);
    const set = child && puzzleSetFor(child);
    if (!child || !set) return c.json({ error: "not_found" }, 404);
    const { choices } = z.object({ choices: z.array(z.number().int()) }).parse(await c.req.json());
    if (choices.length !== set.puzzles.length) return c.json({ error: "answer_every_question" }, 400);
    const key = `puzzles-${set.band}`;
    const score = set.puzzles.filter((p, i) => optionOrder(child.id, key, i, p.options.length)[choices[i]!] === p.answer).length;
    const prev = await db.get<{ best_score: number; attempts: number }>(
      "SELECT best_score, attempts FROM progress WHERE child_id = ? AND lesson_id = ?",
      [child.id, key],
    );
    const best = Math.max(score, prev?.best_score ?? 0);
    await db.run(
      `INSERT INTO progress (child_id, lesson_id, best_score, total, attempts, completed_at, review_due) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (child_id, lesson_id) DO UPDATE SET best_score = excluded.best_score, total = excluded.total, attempts = excluded.attempts, completed_at = excluded.completed_at`,
      [child.id, key, best, set.puzzles.length, (prev?.attempts ?? 0) + 1, now(), "9999-12-31T00:00:00.000Z"],
    );
    return c.json({ score, total: set.puzzles.length, best });
  });

  // ---- screen time (counted on the server so limits apply on every device)
  async function usageFor(childId: string, day: string, dailyMinutes: number) {
    const u = await db.get<{ minutes: number; bonus: number }>("SELECT minutes, bonus FROM usage WHERE child_id = ? AND day = ?", [childId, day]);
    const minutes = u?.minutes ?? 0;
    const bonus = u?.bonus ?? 0;
    return { day, minutes, bonus, limit: dailyMinutes + bonus, remaining: Math.max(0, dailyMinutes + bonus - minutes) };
  }

  fam.get("/children/:childId/usage", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const day = Day.parse(c.req.query("day"));
    return c.json(await usageFor(child.id, day, child.daily_minutes));
  });

  /** Called by the app once a minute while a child is actively learning. */
  fam.post("/children/:childId/usage/tick", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const { day } = z.object({ day: Day }).parse(await c.req.json());
    if (!plausibleDay(day)) return c.json({ error: "invalid_input", details: ["day is not today"] }, 400);
    const row = await db.get<{ last_tick: string | null }>("SELECT last_tick FROM usage WHERE child_id = ? AND day = ?", [child.id, day]);
    // At most one minute counted per 50 seconds, even if several devices are open.
    if (!row?.last_tick || Date.now() - Date.parse(row.last_tick) >= 50_000) {
      await db.run(
        `INSERT INTO usage (child_id, day, minutes, last_tick) VALUES (?,?,1,?)
         ON CONFLICT (child_id, day) DO UPDATE SET minutes = usage.minutes + 1, last_tick = excluded.last_tick`,
        [child.id, day, now()],
      );
    }
    return c.json(await usageFor(child.id, day, child.daily_minutes));
  });

  // ---- AI tutor
  const tutorHistory = (childId: string, lessonId: string) =>
    db.all<{ id: string; role: "user" | "assistant"; content: string; flagged: string | null; created_at: string }>(
      "SELECT id, role, content, flagged, created_at FROM tutor_messages WHERE child_id = ? AND lesson_id = ? ORDER BY created_at, seq",
      [childId, lessonId],
    );
  const insertMsg = (...v: [string, string, string, string, string, string | null, string]) =>
    db.run("INSERT INTO tutor_messages (id, child_id, lesson_id, role, content, flagged, created_at) VALUES (?,?,?,?,?,?,?)", v);

  fam.get("/children/:childId/tutor/:lessonId", async (c) => {
    const r = await lessonFor(c);
    if (r instanceof Response) return r;
    return c.json({ messages: await tutorHistory(r.child.id, r.lesson.id) });
  });

  fam.post("/children/:childId/tutor/:lessonId", async (c) => {
    const r = await lessonFor(c);
    if (r instanceof Response) return r;
    const pub = childPublic(r.child);
    if (!pub.aiAllowedForAge) return c.json({ error: "ai_not_available_for_age" }, 403);
    if (!pub.aiEnabled) return c.json({ error: "ai_turned_off_by_parent" }, 403);

    const body = z
      .object({
        message: z.string().trim().min(1).max(config.tutor.maxMessageChars),
        question: z.number().int().min(0).nullable().default(null),
      })
      .parse(await c.req.json());
    if (body.question !== null && !r.lesson.quiz[body.question]) return c.json({ error: "question_not_found" }, 404);

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const usedToday = (await db.get<{ n: number }>(
      "SELECT CAST(COUNT(*) AS INTEGER) AS n FROM tutor_messages WHERE child_id = ? AND role = 'user' AND created_at >= ?",
      [r.child.id, since.toISOString()],
    ))!.n;
    if (usedToday >= config.tutor.dailyMessageLimit) return c.json({ error: "daily_limit_reached" }, 429);

    const solved =
      body.question !== null &&
      !!(await db.get("SELECT 1 FROM quiz_solved WHERE child_id = ? AND lesson_id = ? AND q_index = ?", [r.child.id, r.lesson.id, body.question]));

    const history = (await tutorHistory(r.child.id, r.lesson.id))
      .slice(-12)
      .map((m): TutorTurn => ({ role: m.role, content: m.content }));

    const pre = precheck(body.message, pub.band);
    const result =
      pre ??
      (await tutor.reply({
        band: pub.band,
        nickname: pub.nickname,
        lesson: r.lesson,
        questionIndex: body.question,
        optionOrder: body.question === null ? undefined : optionOrder(r.child.id, r.lesson.id, body.question, r.lesson.quiz[body.question]!.options.length),
        questionSolved: solved,
        history,
        message: body.message,
      }));

    // Personal info is never stored as typed.
    const stored = result.flag === "personal_info" ? "[removed: personal information]" : body.message;
    const userId = newId();
    const replyId = newId();
    await insertMsg(userId, r.child.id, r.lesson.id, "user", stored, result.flag, now());
    await insertMsg(replyId, r.child.id, r.lesson.id, "assistant", result.reply, null, now());
    return c.json({ reply: result.reply, messageId: replyId, flagged: result.flag !== null, yourMessage: stored });
  });

  // ---- reporting (Google Play requires in-app reporting for AI content)
  fam.post("/reports", async (c) => {
    const body = z
      .object({
        childId: z.string().optional(),
        lessonId: z.string().optional(),
        messageId: z.string().optional(),
        reason: z.enum(["wrong_fact", "inappropriate", "scary", "ai_gave_answer", "bug", "other"]),
        details: z.string().max(1000).optional(),
      })
      .parse(await c.req.json());
    if (body.childId && !(await getChild(body.childId, c.get("parentId")))) return c.json({ error: "child_not_found" }, 404);
    await db.run(
      "INSERT INTO reports (id, parent_id, child_id, lesson_id, message_id, reason, details, created_at) VALUES (?,?,?,?,?,?,?,?)",
      [newId(), c.get("parentId"), body.childId ?? null, body.lessonId ?? null, body.messageId ?? null, body.reason, body.details ?? null, now()],
    );
    return c.json({ ok: true }, 201);
  });

  // ---------------------------------------------------------------- parent area (PIN required)
  const par = new Hono<Env>();
  par.use("*", requireScope("parent"));

  par.get("/overview", async (c) => {
    const kids = await listChildren(c.get("parentId"));
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const count = async (sql: string, params: string[]) => (await db.get<{ n: number }>(sql, params))!.n;
    const children = [];
    for (const k of kids) {
      children.push({
        ...childPublic(k),
        stats: await db.get(
          `SELECT CAST(COUNT(*) AS INTEGER) AS lessons, CAST(COALESCE(SUM(best_score),0) AS INTEGER) AS score,
                  CAST(COALESCE(SUM(total),0) AS INTEGER) AS total, MAX(completed_at) AS "lastActive"
             FROM progress WHERE child_id = ? AND lesson_id NOT LIKE 'puzzles-%'`,
          [k.id],
        ),
        flaggedMessages: await count("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM tutor_messages WHERE child_id = ? AND flagged IS NOT NULL", [k.id]),
        thisWeek: {
          lessons: await count(
            "SELECT CAST(COUNT(*) AS INTEGER) AS n FROM progress WHERE child_id = ? AND completed_at >= ? AND lesson_id NOT LIKE 'puzzles-%'",
            [k.id, weekAgo.toISOString()],
          ),
          minutes: await count("SELECT CAST(COALESCE(SUM(minutes),0) AS INTEGER) AS n FROM usage WHERE child_id = ? AND day >= ?", [
            k.id,
            weekAgo.toISOString().slice(0, 10),
          ]),
        },
        puzzles:
          (await db.get(
            "SELECT best_score, total FROM progress WHERE child_id = ? AND lesson_id LIKE 'puzzles-%' ORDER BY completed_at DESC LIMIT 1",
            [k.id],
          )) ?? null,
        recent: (
          await db.all<{ lesson_id: string }>(
            "SELECT lesson_id, best_score, total, completed_at FROM progress WHERE child_id = ? AND lesson_id NOT LIKE 'puzzles-%' ORDER BY completed_at DESC LIMIT 5",
            [k.id],
          )
        ).map((p) => ({
          ...p,
          title: content.lessons.get(p.lesson_id)?.title ?? p.lesson_id,
        })),
      });
    }
    return c.json({ children });
  });

  par.post("/children", async (c) => {
    const body = ChildCreate.parse(await c.req.json());
    if (config.requireEmailVerification && !(await getParent(c.get("parentId")))!.email_verified_at) {
      return c.json({ error: "email_not_verified" }, 403);
    }
    const count = (await listChildren(c.get("parentId"))).length;
    if (count >= 8) return c.json({ error: "too_many_children" }, 400);
    const id = newId();
    await db.run("INSERT INTO children (id, parent_id, nickname, birth_year, avatar, created_at) VALUES (?,?,?,?,?,?)", [
      id,
      c.get("parentId"),
      body.nickname,
      body.birthYear,
      body.avatar,
      now(),
    ]);
    return c.json({ child: childPublic((await getChild(id, c.get("parentId")))!) }, 201);
  });

  par.patch("/children/:childId", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const b = ChildPatch.parse(await c.req.json());
    await db.run(
      `UPDATE children SET nickname = ?, birth_year = ?, avatar = ?, band_override = ?, unlocked_topics = ?,
         ai_enabled = ?, daily_minutes = ? WHERE id = ?`,
      [
        b.nickname ?? child.nickname,
        b.birthYear ?? child.birth_year,
        b.avatar ?? child.avatar,
        b.bandOverride === undefined ? child.band_override : b.bandOverride,
        b.unlockedTopics ? JSON.stringify([...new Set(b.unlockedTopics)]) : child.unlocked_topics,
        b.aiEnabled === undefined ? child.ai_enabled : b.aiEnabled ? 1 : 0,
        b.dailyMinutes ?? child.daily_minutes,
        child.id,
      ],
    );
    return c.json({ child: childPublic((await getChild(child.id, c.get("parentId")))!) });
  });

  /** Extra minutes for today, given with the parent PIN. */
  par.post("/children/:childId/bonus", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const b = z.object({ day: Day, minutes: z.number().int().min(5).max(120) }).parse(await c.req.json());
    if (!plausibleDay(b.day)) return c.json({ error: "invalid_input", details: ["day is not today"] }, 400);
    await db.run(
      `INSERT INTO usage (child_id, day, bonus) VALUES (?,?,?)
       ON CONFLICT (child_id, day) DO UPDATE SET bonus = usage.bonus + excluded.bonus`,
      [child.id, b.day, b.minutes],
    );
    return c.json(await usageFor(child.id, b.day, child.daily_minutes));
  });

  par.delete("/children/:childId", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    await db.run("DELETE FROM children WHERE id = ?", [child.id]);
    return c.json({ ok: true });
  });

  par.get("/children/:childId/chats", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const rows = await db.all<{ lesson_id: string }>(
      "SELECT id, lesson_id, role, content, flagged, created_at FROM tutor_messages WHERE child_id = ? ORDER BY created_at, seq",
      [child.id],
    );
    return c.json({
      messages: rows.map((m) => ({ ...m, lessonTitle: content.lessons.get(m.lesson_id)?.title ?? m.lesson_id })),
    });
  });

  par.get("/reports", async (c) =>
    c.json({ reports: await db.all("SELECT * FROM reports WHERE parent_id = ? ORDER BY created_at DESC", [c.get("parentId")]) }),
  );

  par.patch("/pin", async (c) => {
    const { newPin } = z.object({ newPin: Pin }).parse(await c.req.json());
    await db.run("UPDATE parents SET pin_hash = ? WHERE id = ?", [hashSecret(newPin), c.get("parentId")]);
    return c.json({ ok: true });
  });

  /** Data portability: everything we hold about this family. */
  par.get("/export", async (c) => {
    const id = c.get("parentId");
    const p = (await getParent(id))!;
    const kids = await listChildren(id);
    const per = async (sql: string) => {
      const rows: unknown[] = [];
      for (const k of kids) rows.push(...(await db.all(sql, [k.id])));
      return rows;
    };
    return c.json({
      exportedAt: now(),
      parent: { email: p.email, consentAt: p.consent_at, createdAt: p.created_at },
      children: kids.map(childPublic),
      progress: await per("SELECT * FROM progress WHERE child_id = ?"),
      // explicit columns: the internal ordering column (seq) is not part of the export
      tutorMessages: await per("SELECT id, child_id, lesson_id, role, content, flagged, created_at FROM tutor_messages WHERE child_id = ?"),
      reports: await db.all("SELECT * FROM reports WHERE parent_id = ?", [id]),
    });
  });

  /** Right to erasure: deletes the parent and (via cascade) every child record. */
  par.delete("/account", async (c) => {
    await db.run("DELETE FROM parents WHERE id = ?", [c.get("parentId")]);
    return c.json({ ok: true });
  });

  app.route("/", fam);
  app.route("/parent", par);
  return app;
}
