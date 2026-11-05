import { Hono, type Context, type Next } from "hono";
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

export function createApp(deps: { db: DB; content: ContentStore; tutor: TutorProvider }) {
  const { db, content, tutor } = deps;
  const app = new Hono<Env>();

  app.use("*", cors({ origin: config.corsOrigins.includes("*") ? "*" : config.corsOrigins }));
  app.onError((err, c) => {
    if (err instanceof z.ZodError) {
      return c.json({ error: "invalid_input", details: err.issues.map((i) => i.message) }, 400);
    }
    console.error(err);
    return c.json({ error: "server_error" }, 500);
  });

  // ---------------------------------------------------------------- helpers
  const getParent = db.prepare("SELECT * FROM parents WHERE id = ?");
  const getParentByEmail = db.prepare("SELECT * FROM parents WHERE email = ?");
  const getChild = db.prepare("SELECT * FROM children WHERE id = ? AND parent_id = ?");
  const listChildren = db.prepare("SELECT * FROM children WHERE parent_id = ? ORDER BY created_at");

  const requireScope = (needed: Scope) => async (c: Context<Env>, next: Next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const claims = token ? await readToken(token) : null;
    if (!claims) return c.json({ error: "not_signed_in" }, 401);
    if (needed === "parent" && claims.scope !== "parent") return c.json({ error: "parent_pin_required" }, 403);
    if (!getParent.get(claims.sub)) return c.json({ error: "not_signed_in" }, 401);
    c.set("parentId", claims.sub);
    c.set("scope", claims.scope);
    await next();
  };

  const loadChild = (c: Context<Env>): ChildRow | null =>
    (getChild.get(c.req.param("childId") ?? "", c.get("parentId")) as ChildRow | undefined) ?? null;

  function visibleTo(child: ChildRow, l: Lesson): boolean {
    if (l.band !== childBand(child)) return false;
    if (l.status !== "reviewed" && !config.showDrafts) return false;
    if (l.sensitive && !(JSON.parse(child.unlocked_topics) as string[]).includes(l.sensitive)) return false;
    return true;
  }

  function lessonFor(c: Context<Env>): { child: ChildRow; lesson: Lesson } | Response {
    const child = loadChild(c);
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

  // ---------------------------------------------------------------- public
  app.get("/health", (c) => c.json({ ok: true, lessons: content.lessons.size, tutor: config.tutor.mode }));

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
    if (getParentByEmail.get(body.email)) return c.json({ error: "email_taken" }, 409);
    const id = newId();
    db.prepare(
      "INSERT INTO parents (id, email, password_hash, pin_hash, consent_version, consent_at, created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(id, body.email, hashSecret(body.password), hashSecret(body.pin), body.consentVersion, now(), now());
    return c.json({ familyToken: await issueToken(id, "family") }, 201);
  });

  app.post("/auth/login", async (c) => {
    const body = z.object({ email: Email, password: z.string() }).parse(await c.req.json());
    const p = getParentByEmail.get(body.email) as ParentRow | undefined;
    if (!p) return c.json({ error: "wrong_email_or_password" }, 401);
    if (isLocked(p.login_locked_until)) return c.json({ error: "too_many_attempts", retryAt: p.login_locked_until }, 429);
    if (!verifySecret(body.password, p.password_hash)) {
      const failed = p.login_failed + 1;
      const lock = failed >= config.security.loginMaxAttempts ? minutesFromNow(config.security.loginLockMinutes) : null;
      db.prepare("UPDATE parents SET login_failed = ?, login_locked_until = ? WHERE id = ?").run(lock ? 0 : failed, lock, p.id);
      return c.json({ error: "wrong_email_or_password" }, 401);
    }
    db.prepare("UPDATE parents SET login_failed = 0, login_locked_until = NULL WHERE id = ?").run(p.id);
    return c.json({ familyToken: await issueToken(p.id, "family") });
  });

  /** Parent enters their PIN to get a short-lived parent token. */
  app.post("/auth/parent-unlock", requireScope("family"), async (c) => {
    const { pin } = z.object({ pin: z.string() }).parse(await c.req.json());
    const p = getParent.get(c.get("parentId")) as unknown as ParentRow;
    if (isLocked(p.pin_locked_until)) return c.json({ error: "too_many_attempts", retryAt: p.pin_locked_until }, 429);
    if (!verifySecret(pin, p.pin_hash)) {
      const failed = p.pin_failed + 1;
      const lock = failed >= config.security.pinMaxAttempts ? minutesFromNow(config.security.pinLockMinutes) : null;
      db.prepare("UPDATE parents SET pin_failed = ?, pin_locked_until = ? WHERE id = ?").run(lock ? 0 : failed, lock, p.id);
      return c.json(
        { error: "wrong_pin", attemptsLeft: lock ? 0 : config.security.pinMaxAttempts - failed, ...(lock ? { retryAt: lock } : {}) },
        401,
      );
    }
    db.prepare("UPDATE parents SET pin_failed = 0, pin_locked_until = NULL WHERE id = ?").run(p.id);
    return c.json({ parentToken: await issueToken(p.id, "parent"), expiresInSec: config.security.parentTokenMinutes * 60 });
  });

  // ---------------------------------------------------------------- family (child-facing)
  const fam = new Hono<Env>();
  fam.use("*", requireScope("family"));

  fam.get("/family", (c) => {
    const p = getParent.get(c.get("parentId")) as unknown as ParentRow;
    const kids = (listChildren.all(p.id) as unknown as ChildRow[]).map(childPublic);
    return c.json({ parent: { email: p.email }, children: kids });
  });

  fam.get("/children/:childId/home", (c) => {
    const child = loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const band = childBand(child);
    const visible = [...content.lessons.values()].filter((l) => visibleTo(child, l));
    const done = db.prepare("SELECT lesson_id, best_score, total, review_due FROM progress WHERE child_id = ?").all(child.id) as {
      lesson_id: string;
      best_score: number;
      total: number;
      review_due: string;
    }[];
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

  fam.get("/children/:childId/lessons", (c) => {
    const child = loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const subject = c.req.query("subject");
    const progress = new Map(
      (db.prepare("SELECT lesson_id, best_score, total FROM progress WHERE child_id = ?").all(child.id) as {
        lesson_id: string;
        best_score: number;
        total: number;
      }[]).map((p) => [p.lesson_id, p]),
    );
    const all = [...content.lessons.values()].filter((l) => l.band === childBand(child) && (!subject || l.subject === subject));
    const lessons = all
      .filter((l) => visibleTo(child, l))
      .map((l) => ({ ...lessonSummary(l), progress: progress.get(l.id) ?? null }));
    // Tell the app that locked lessons exist (so it can say "ask a parent"), without their content.
    const locked = all.filter((l) => l.sensitive && !visibleTo(child, l)).length;
    return c.json({ lessons, lockedCount: locked });
  });

  fam.get("/children/:childId/lessons/:lessonId", (c) => {
    const r = lessonFor(c);
    if (r instanceof Response) return r;
    const solved = (db
      .prepare("SELECT q_index FROM quiz_solved WHERE child_id = ? AND lesson_id = ?")
      .all(r.child.id, r.lesson.id) as { q_index: number }[]).map((s) => s.q_index);
    return c.json({ lesson: publicLesson(r.lesson), solved });
  });

  const QuestionRef = z.object({ question: z.number().int().min(0) });

  fam.post("/children/:childId/lessons/:lessonId/hint", async (c) => {
    const r = lessonFor(c);
    if (r instanceof Response) return r;
    const body = QuestionRef.extend({ level: z.number().int().min(0).max(2) }).parse(await c.req.json());
    const q = r.lesson.quiz[body.question];
    if (!q) return c.json({ error: "question_not_found" }, 404);
    return c.json({ hint: q.hints[body.level], level: body.level, isLast: body.level === 2 });
  });

  fam.post("/children/:childId/lessons/:lessonId/check", async (c) => {
    const r = lessonFor(c);
    if (r instanceof Response) return r;
    const body = QuestionRef.extend({ choice: z.number().int().min(0), hintsUsed: z.number().int().min(0).max(3) }).parse(
      await c.req.json(),
    );
    const q = r.lesson.quiz[body.question];
    if (!q) return c.json({ error: "question_not_found" }, 404);
    const correct = body.choice === q.answer;
    if (correct) {
      db.prepare("INSERT OR IGNORE INTO quiz_solved (child_id, lesson_id, q_index, solved_at) VALUES (?,?,?,?)").run(
        r.child.id,
        r.lesson.id,
        body.question,
        now(),
      );
    }
    // The explanation is only revealed after success, or after the learner tried with every hint.
    const reveal = correct || body.hintsUsed >= 3;
    return c.json({ correct, explain: reveal ? q.explain : null, answer: !correct && reveal ? q.answer : null });
  });

  fam.post("/children/:childId/lessons/:lessonId/complete", async (c) => {
    const r = lessonFor(c);
    if (r instanceof Response) return r;
    const { choices } = z.object({ choices: z.array(z.number().int()) }).parse(await c.req.json());
    if (choices.length !== r.lesson.quiz.length) return c.json({ error: "answer_every_question" }, 400);
    const score = r.lesson.quiz.filter((q, i) => q.answer === choices[i]).length;
    const total = r.lesson.quiz.length;
    const prev = db.prepare("SELECT best_score, attempts FROM progress WHERE child_id = ? AND lesson_id = ?").get(
      r.child.id,
      r.lesson.id,
    ) as { best_score: number; attempts: number } | undefined;
    const attempts = (prev?.attempts ?? 0) + 1;
    const best = Math.max(score, prev?.best_score ?? 0);
    const due = new Date(Date.now() + reviewIntervalDays(score, total, attempts) * 86_400_000).toISOString();
    db.prepare(
      `INSERT INTO progress (child_id, lesson_id, best_score, total, attempts, completed_at, review_due)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (child_id, lesson_id) DO UPDATE SET best_score = excluded.best_score, total = excluded.total,
         attempts = excluded.attempts, completed_at = excluded.completed_at, review_due = excluded.review_due`,
    ).run(r.child.id, r.lesson.id, best, total, attempts, now(), due);
    return c.json({ score, total, best, reviewDue: due });
  });

  // ---- AI tutor
  const tutorHistory = db.prepare(
    "SELECT id, role, content, flagged, created_at FROM tutor_messages WHERE child_id = ? AND lesson_id = ? ORDER BY created_at, rowid",
  );
  const insertMsg = db.prepare(
    "INSERT INTO tutor_messages (id, child_id, lesson_id, role, content, flagged, created_at) VALUES (?,?,?,?,?,?,?)",
  );

  fam.get("/children/:childId/tutor/:lessonId", (c) => {
    const r = lessonFor(c);
    if (r instanceof Response) return r;
    return c.json({ messages: tutorHistory.all(r.child.id, r.lesson.id) });
  });

  fam.post("/children/:childId/tutor/:lessonId", async (c) => {
    const r = lessonFor(c);
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
    const usedToday = (db
      .prepare("SELECT COUNT(*) AS n FROM tutor_messages WHERE child_id = ? AND role = 'user' AND created_at >= ?")
      .get(r.child.id, since.toISOString()) as { n: number }).n;
    if (usedToday >= config.tutor.dailyMessageLimit) return c.json({ error: "daily_limit_reached" }, 429);

    const solved =
      body.question !== null &&
      !!db
        .prepare("SELECT 1 FROM quiz_solved WHERE child_id = ? AND lesson_id = ? AND q_index = ?")
        .get(r.child.id, r.lesson.id, body.question);

    const history = (tutorHistory.all(r.child.id, r.lesson.id) as unknown as { role: "user" | "assistant"; content: string }[])
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
        questionSolved: solved,
        history,
        message: body.message,
      }));

    // Personal info is never stored as typed.
    const stored = result.flag === "personal_info" ? "[removed: personal information]" : body.message;
    const userId = newId();
    const replyId = newId();
    insertMsg.run(userId, r.child.id, r.lesson.id, "user", stored, result.flag, now());
    insertMsg.run(replyId, r.child.id, r.lesson.id, "assistant", result.reply, null, now());
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
    if (body.childId && !getChild.get(body.childId, c.get("parentId"))) return c.json({ error: "child_not_found" }, 404);
    db.prepare(
      "INSERT INTO reports (id, parent_id, child_id, lesson_id, message_id, reason, details, created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).run(newId(), c.get("parentId"), body.childId ?? null, body.lessonId ?? null, body.messageId ?? null, body.reason, body.details ?? null, now());
    return c.json({ ok: true }, 201);
  });

  // ---------------------------------------------------------------- parent area (PIN required)
  const par = new Hono<Env>();
  par.use("*", requireScope("parent"));

  par.get("/overview", (c) => {
    const kids = listChildren.all(c.get("parentId")) as unknown as ChildRow[];
    const stats = db.prepare(
      `SELECT COUNT(*) AS lessons, COALESCE(SUM(best_score),0) AS score, COALESCE(SUM(total),0) AS total,
              MAX(completed_at) AS lastActive FROM progress WHERE child_id = ?`,
    );
    const flags = db.prepare("SELECT COUNT(*) AS n FROM tutor_messages WHERE child_id = ? AND flagged IS NOT NULL");
    const recent = db.prepare(
      "SELECT lesson_id, best_score, total, completed_at FROM progress WHERE child_id = ? ORDER BY completed_at DESC LIMIT 5",
    );
    return c.json({
      children: kids.map((k) => ({
        ...childPublic(k),
        stats: stats.get(k.id),
        flaggedMessages: (flags.get(k.id) as { n: number }).n,
        recent: (recent.all(k.id) as { lesson_id: string }[]).map((p) => ({
          ...p,
          title: content.lessons.get(p.lesson_id)?.title ?? p.lesson_id,
        })),
      })),
    });
  });

  par.post("/children", async (c) => {
    const body = ChildCreate.parse(await c.req.json());
    const count = (listChildren.all(c.get("parentId")) as unknown[]).length;
    if (count >= 8) return c.json({ error: "too_many_children" }, 400);
    const id = newId();
    db.prepare("INSERT INTO children (id, parent_id, nickname, birth_year, avatar, created_at) VALUES (?,?,?,?,?,?)").run(
      id,
      c.get("parentId"),
      body.nickname,
      body.birthYear,
      body.avatar,
      now(),
    );
    return c.json({ child: childPublic(getChild.get(id, c.get("parentId")) as unknown as ChildRow) }, 201);
  });

  par.patch("/children/:childId", async (c) => {
    const child = loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const b = ChildPatch.parse(await c.req.json());
    db.prepare(
      `UPDATE children SET nickname = ?, birth_year = ?, avatar = ?, band_override = ?, unlocked_topics = ?,
         ai_enabled = ?, daily_minutes = ? WHERE id = ?`,
    ).run(
      b.nickname ?? child.nickname,
      b.birthYear ?? child.birth_year,
      b.avatar ?? child.avatar,
      b.bandOverride === undefined ? child.band_override : b.bandOverride,
      b.unlockedTopics ? JSON.stringify([...new Set(b.unlockedTopics)]) : child.unlocked_topics,
      b.aiEnabled === undefined ? child.ai_enabled : b.aiEnabled ? 1 : 0,
      b.dailyMinutes ?? child.daily_minutes,
      child.id,
    );
    return c.json({ child: childPublic(getChild.get(child.id, c.get("parentId")) as unknown as ChildRow) });
  });

  par.delete("/children/:childId", (c) => {
    const child = loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    db.prepare("DELETE FROM children WHERE id = ?").run(child.id);
    return c.json({ ok: true });
  });

  par.get("/children/:childId/chats", (c) => {
    const child = loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const rows = db
      .prepare("SELECT id, lesson_id, role, content, flagged, created_at FROM tutor_messages WHERE child_id = ? ORDER BY created_at, rowid")
      .all(child.id) as { lesson_id: string }[];
    return c.json({
      messages: rows.map((m) => ({ ...m, lessonTitle: content.lessons.get(m.lesson_id)?.title ?? m.lesson_id })),
    });
  });

  par.get("/reports", (c) =>
    c.json({ reports: db.prepare("SELECT * FROM reports WHERE parent_id = ? ORDER BY created_at DESC").all(c.get("parentId")) }),
  );

  par.patch("/pin", async (c) => {
    const { newPin } = z.object({ newPin: Pin }).parse(await c.req.json());
    db.prepare("UPDATE parents SET pin_hash = ? WHERE id = ?").run(hashSecret(newPin), c.get("parentId"));
    return c.json({ ok: true });
  });

  /** Data portability: everything we hold about this family. */
  par.get("/export", (c) => {
    const id = c.get("parentId");
    const p = getParent.get(id) as unknown as ParentRow;
    const kids = listChildren.all(id) as unknown as ChildRow[];
    const per = (sql: string) => kids.flatMap((k) => db.prepare(sql).all(k.id));
    return c.json({
      exportedAt: now(),
      parent: { email: p.email, consentAt: p.consent_at, createdAt: p.created_at },
      children: kids.map(childPublic),
      progress: per("SELECT * FROM progress WHERE child_id = ?"),
      tutorMessages: per("SELECT * FROM tutor_messages WHERE child_id = ?"),
      reports: db.prepare("SELECT * FROM reports WHERE parent_id = ?").all(id),
    });
  });

  /** Right to erasure: deletes the parent and (via cascade) every child record. */
  par.delete("/account", (c) => {
    db.prepare("DELETE FROM parents WHERE id = ?").run(c.get("parentId"));
    return c.json({ ok: true });
  });

  app.route("/", fam);
  app.route("/parent", par);
  return app;
}
