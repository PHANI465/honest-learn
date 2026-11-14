// Hoot, the hint-only AI helper, and in-app reporting.
// Needs a family token (checked in app.ts for /children/* and /reports).
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { now } from "../db.ts";
import { newId } from "../security.ts";
import { optionOrder } from "../shuffle.ts";
import { detectPersonalInfo, precheckConversation, PERSONAL_INFO_PLACEHOLDER, type TutorResult, type TutorTurn } from "../tutor.ts";
import { childPublic } from "../models.ts";
import type { Ctx, Env } from "../context.ts";

const Id = z.string().max(100);
/** Reports one family may send in 24 hours. */
export const REPORTS_PER_DAY = 20;

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
    const sinceIso = since.toISOString();

    const solved =
      body.question !== null &&
      !!(await db.get("SELECT 1 FROM quiz_solved WHERE child_id = ? AND lesson_id = ? AND q_index = ?", [child.id, lesson.id, body.question]));

    const past = await history(child.id, lesson.id);
    const turns = past.slice(-12).map((m): TutorTurn => ({ role: m.role, content: m.content }));
    // Earlier messages Hoot has not already answered as a wellbeing/privacy concern, for the conversation-level check.
    const earlier = past.filter((m) => m.role === "user" && m.flagged === null).map((m) => m.content);

    // Safety first: personal information and wellbeing messages are answered without any AI call.
    // Wellbeing is also read across the child's last few messages, so a disclosure spread over them is caught.
    const pre = precheckConversation(body.message, earlier, pub.band, c.get("parent").country ?? undefined);

    // Personal info is never stored as typed, even when the message was flagged for another reason.
    const stored = pre?.flag === "personal_info" || detectPersonalInfo(body.message) ? PERSONAL_INFO_PLACEHOLDER : body.message;

    // Daily limit, atomically: store the child's message first, then count today's messages including it.
    // If that is over the limit the message is removed again. Parallel requests can only over-reject (when
    // several arrive at the very limit), never exceed it, because every admitted message was counted
    // together with all the admitted messages stored before it. Portable SQL: works on SQLite and Postgres.
    const userMsgId = newId();
    await insertMsg(userMsgId, child.id, lesson.id, "user", stored, pre?.flag ?? null, now());
    const usedToday = (await db.get<{ n: number }>(
      "SELECT CAST(COUNT(*) AS INTEGER) AS n FROM tutor_messages WHERE child_id = ? AND role = 'user' AND created_at >= ?",
      [child.id, sinceIso],
    ))!.n;
    if (usedToday > config.tutor.dailyMessageLimit) {
      await db.run("DELETE FROM tutor_messages WHERE id = ?", [userMsgId]);
      return c.json({ error: "daily_limit_reached" }, 429);
    }

    let result: TutorResult;
    try {
      result =
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
    } catch (e) {
      await db.run("DELETE FROM tutor_messages WHERE id = ?", [userMsgId]);
      throw e;
    }
    if (result.flag !== (pre?.flag ?? null)) await db.run("UPDATE tutor_messages SET flagged = ? WHERE id = ?", [result.flag, userMsgId]);

    const replyId = newId();
    // Tell the parent (once per child per day, never including what the child wrote) so a wellbeing
    // concern isn't only discoverable by opening the chat history.
    const alreadyAlerted =
      result.flag === "wellbeing" &&
      !!(await db.get("SELECT 1 FROM tutor_messages WHERE child_id = ? AND flagged = 'wellbeing' AND created_at >= ? AND id != ?", [
        child.id,
        sinceIso,
        userMsgId,
      ]));
    await insertMsg(replyId, child.id, lesson.id, "assistant", result.reply, null, now());
    if (result.flag === "wellbeing" && !alreadyAlerted) {
      try {
        await ctx.mailer.send(
          c.get("parent").email,
          "Honest Learn: please check in with " + pub.nickname,
          `${pub.nickname} sent a message to Hoot that may mean they need support. Hoot replied with a kind message and, where we have one, a helpline for your country.

` +
            "We don't put the message in this email. You can read it in the parent area (enter your PIN) under Chats. Please talk with them soon, in a calm and caring way.",
        );
      } catch (e) {
        console.error("parent alert failed", e);
      }
    }
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
    // A family sends a handful of reports at most; a cap stops a device from filling the database.
    const hit = await ctx.hitRateLimit(`reports:${c.get("parentId")}`, REPORTS_PER_DAY, 86_400_000);
    if (!hit.allowed) return c.json({ error: "too_many_reports" }, 429);
    await db.run(
      "INSERT INTO reports (id, parent_id, child_id, lesson_id, message_id, reason, details, created_at) VALUES (?,?,?,?,?,?,?,?)",
      [newId(), c.get("parentId"), body.childId ?? null, body.lessonId ?? null, body.messageId ?? null, body.reason, body.details ?? null, now()],
    );
    return c.json({ ok: true }, 201);
  });

  return r;
}
