// Hoot, the hint-only AI helper, and in-app reporting.
// Needs a family token (checked in app.ts for /children/* and /reports).
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { now } from "../db.ts";
import { newId } from "../security.ts";
import { optionOrder } from "../shuffle.ts";
import { detectPersonalInfo, precheck, type TutorTurn } from "../tutor.ts";
import { childPublic } from "../models.ts";
import type { Ctx, Env } from "../context.ts";

const Id = z.string().max(100);

export function tutorRoutes(ctx: Ctx) {
  const { db, tutor, lessonFor } = ctx;
  const r = new Hono<Env>();

  const history = (childId: string, lessonId: string) =>
    db.all<{ id: string; role: "user" | "assistant"; content: string; flagged: string | null; created_at: string }>(
      "SELECT id, role, content, flagged, created_at FROM tutor_messages WHERE child_id = ? AND lesson_id = ? ORDER BY created_at, seq",
      [childId, lessonId],
    );
  const insertMsg = (...v: [string, string, string, string, string, string | null, string]) =>
    db.run("INSERT INTO tutor_messages (id, child_id, lesson_id, role, content, flagged, created_at) VALUES (?,?,?,?,?,?,?)", v);

  r.get("/children/:childId/tutor/:lessonId", async (c) => {
    const found = await lessonFor(c);
    if (found instanceof Response) return found;
    return c.json({ messages: await history(found.child.id, found.lesson.id) });
  });

  r.post("/children/:childId/tutor/:lessonId", async (c) => {
    const found = await lessonFor(c);
    if (found instanceof Response) return found;
    const { child, lesson } = found;
    const pub = childPublic(child);
    if (!pub.aiAllowedForAge) return c.json({ error: "ai_not_available_for_age" }, 403);
    if (!pub.aiEnabled) return c.json({ error: "ai_turned_off_by_parent" }, 403);

    const body = z
      .object({
        message: z.string().trim().min(1).max(config.tutor.maxMessageChars),
        question: z.number().int().min(0).max(1000).nullable().default(null),
      })
      .parse(await c.req.json());
    if (body.question !== null && !lesson.quiz[body.question]) return c.json({ error: "question_not_found" }, 404);

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const usedToday = (await db.get<{ n: number }>(
      "SELECT CAST(COUNT(*) AS INTEGER) AS n FROM tutor_messages WHERE child_id = ? AND role = 'user' AND created_at >= ?",
      [child.id, since.toISOString()],
    ))!.n;
    if (usedToday >= config.tutor.dailyMessageLimit) return c.json({ error: "daily_limit_reached" }, 429);

    const solved =
      body.question !== null &&
      !!(await db.get("SELECT 1 FROM quiz_solved WHERE child_id = ? AND lesson_id = ? AND q_index = ?", [child.id, lesson.id, body.question]));

    const turns = (await history(child.id, lesson.id)).slice(-12).map((m): TutorTurn => ({ role: m.role, content: m.content }));

    // Safety first: personal information and wellbeing messages are answered without any AI call.
    const pre = precheck(body.message, pub.band, c.get("parent").country ?? undefined);
    const result =
      pre ??
      (await tutor.reply({
        band: pub.band,
        nickname: pub.nickname,
        lesson,
        questionIndex: body.question,
        optionOrder: body.question === null ? undefined : optionOrder(child.id, lesson.id, body.question, lesson.quiz[body.question]!.options.length),
        questionSolved: solved,
        history: turns,
        message: body.message,
      }));

    // Personal info is never stored as typed, even when the message was flagged for another reason.
    const stored = result.flag === "personal_info" || detectPersonalInfo(body.message) ? "[removed: personal information]" : body.message;
    const replyId = newId();
    await insertMsg(newId(), child.id, lesson.id, "user", stored, result.flag, now());
    await insertMsg(replyId, child.id, lesson.id, "assistant", result.reply, null, now());
    return c.json({ reply: result.reply, messageId: replyId, flagged: result.flag !== null, yourMessage: stored });
  });

  // ---- reporting (Google Play requires in-app reporting for AI content)
  r.post("/reports", async (c) => {
    const body = z
      .object({
        childId: Id.optional(),
        lessonId: Id.optional(),
        messageId: Id.optional(),
        reason: z.enum(["wrong_fact", "inappropriate", "scary", "ai_gave_answer", "bug", "other"]),
        details: z.string().max(1000).optional(),
      })
      .parse(await c.req.json());
    if (body.childId && !(await ctx.getChild(body.childId, c.get("parentId")))) return c.json({ error: "child_not_found" }, 404);
    await db.run(
      "INSERT INTO reports (id, parent_id, child_id, lesson_id, message_id, reason, details, created_at) VALUES (?,?,?,?,?,?,?,?)",
      [newId(), c.get("parentId"), body.childId ?? null, body.lessonId ?? null, body.messageId ?? null, body.reason, body.details ?? null, now()],
    );
    return c.json({ ok: true }, 201);
  });

  return r;
}
