// The parent area: everything a child must not do alone. Mounted at /parent; every route needs the
// short-lived parent token from the PIN (checked in app.ts).
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { now } from "../db.ts";
import { hashSecret, issueToken, newId } from "../security.ts";
import { childBand, ChildCreate, ChildPatch, childPublic, Country, Day, outcomeStatuses, Password, Pin, plausibleDay, Secret, type ChildRow } from "../models.ts";
import type { Ctx, Env } from "../context.ts";
import { usageFor } from "./usage.ts";
import {
  buildFamilyLesson,
  checkSubject,
  FamilyLessonInput,
  FAMILY_LESSON_PREFIX,
  MAX_FAMILY_LESSONS,
  MAX_FAMILY_LESSON_BYTES,
  sizeOf,
  toFormShape,
  warningsFor,
} from "../family-lessons.ts";

export function parentRoutes(ctx: Ctx) {
  const { db, content, loadChild, listChildren, getChild, visibleTo } = ctx;
  const r = new Hono<Env>();

  /** Lessons done per subject (only subjects with lessons for this child's age). */
  async function subjectProgress(k: ChildRow) {
    const doneIds = new Set(
      (await db.all<{ lesson_id: string }>("SELECT lesson_id FROM progress WHERE child_id = ?", [k.id])).map((p) => p.lesson_id),
    );
    const visible = await ctx.visibleLessons(k);
    const band = childBand(k);
    return content.map.subjects
      .filter((sub) => !sub.bands || sub.bands.includes(band))
      .map((sub) => {
        const ls = visible.filter((l) => l.subject === sub.id);
        return { id: sub.id, name: sub.name, total: ls.length, completed: ls.filter((l) => doneIds.has(l.id)).length };
      })
      .filter((x) => x.total > 0);
  }

  r.get("/overview", async (c) => {
    const kids = await listChildren(c.get("parentId"));
    const familyTitles = new Map((await ctx.familyLessonsOf(c.get("parentId"))).map((l) => [l.id, l.title]));
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
        subjects: await subjectProgress(k),
        recent: (
          await db.all<{ lesson_id: string }>(
            "SELECT lesson_id, best_score, total, completed_at FROM progress WHERE child_id = ? AND lesson_id NOT LIKE 'puzzles-%' ORDER BY completed_at DESC LIMIT 5",
            [k.id],
          )
        ).map((p) => ({ ...p, title: content.lessons.get(p.lesson_id)?.title ?? familyTitles.get(p.lesson_id) ?? p.lesson_id })),
      });
    }
    return c.json({ children });
  });

  // ---- child profiles
  r.post("/children", async (c) => {
    const body = ChildCreate.parse(await c.req.json());
    if (config.requireEmailVerification && !c.get("parent").email_verified_at) return c.json({ error: "email_not_verified" }, 403);
    if ((await listChildren(c.get("parentId"))).length >= 8) return c.json({ error: "too_many_children" }, 400);
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

  r.patch("/children/:childId", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const b = ChildPatch.parse(await c.req.json());
    await db.run(
      `UPDATE children SET nickname = ?, birth_year = ?, avatar = ?, band_override = ?, unlocked_topics = ?,
         ai_enabled = ?, daily_minutes = ?, text_scale = ?, dyslexia_font = ?, high_contrast = ?,
         read_aloud_auto = ? WHERE id = ?`,
      [
        b.nickname ?? child.nickname,
        b.birthYear ?? child.birth_year,
        b.avatar ?? child.avatar,
        b.bandOverride === undefined ? child.band_override : b.bandOverride,
        b.unlockedTopics ? JSON.stringify([...new Set(b.unlockedTopics)]) : child.unlocked_topics,
        b.aiEnabled === undefined ? child.ai_enabled : b.aiEnabled ? 1 : 0,
        b.dailyMinutes ?? child.daily_minutes,
        b.textScale ?? child.text_scale ?? 1,
        b.dyslexiaFont === undefined ? child.dyslexia_font : b.dyslexiaFont ? 1 : 0,
        b.highContrast === undefined ? child.high_contrast : b.highContrast ? 1 : 0,
        b.readAloudAuto === undefined ? child.read_aloud_auto : b.readAloudAuto ? 1 : 0,
        child.id,
      ],
    );
    return c.json({ child: childPublic((await getChild(child.id, c.get("parentId")))!) });
  });

  /** Extra minutes for today, given with the parent PIN. */
  r.post("/children/:childId/bonus", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const b = z.object({ day: Day, minutes: z.number().int().min(5).max(120) }).parse(await c.req.json());
    if (!plausibleDay(b.day)) return c.json({ error: "invalid_input", details: ["day is not today"] }, 400);
    await db.run(
      `INSERT INTO usage (child_id, day, bonus) VALUES (?,?,?)
       ON CONFLICT (child_id, day) DO UPDATE SET bonus = usage.bonus + excluded.bonus`,
      [child.id, b.day, b.minutes],
    );
    return c.json(await usageFor(ctx, child.id, b.day, child.daily_minutes));
  });

  r.delete("/children/:childId", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    await db.run("DELETE FROM children WHERE id = ?", [child.id]);
    return c.json({ ok: true });
  });

  /** What this child knows: every knowledge-map outcome for their age group with a calm status (no scores, no ranking). */
  /** Spelling words for the parent's view: how many are learned (spelled right at least twice in a row) and how many are being practised. */
  r.get("/children/:childId/spelling", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const rows = await db.all<{ box: number }>("SELECT box FROM spelling_progress WHERE child_id = ?", [child.id]);
    const set = content.spelling.get(childBand(child));
    return c.json({
      available: !!set,
      learned: rows.filter((x) => x.box >= 2).length,
      practising: rows.filter((x) => x.box < 2).length,
      total: set?.words.length ?? 0,
    });
  });

  r.get("/children/:childId/outcomes", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const progress = await db.all<{ lesson_id: string; best_score: number; total: number }>(
      "SELECT lesson_id, best_score, total FROM progress WHERE child_id = ? AND lesson_id NOT LIKE 'puzzles-%'",
      [child.id],
    );
    const { outcomes } = outcomeStatuses(content, child, progress, visibleTo);
    const subjects = content.map.subjects
      .map((s) => {
        const os = outcomes.filter((o) => o.subject === s.id);
        return {
          id: s.id,
          name: s.name,
          strong: os.filter((o) => o.status === "strong").length,
          practising: os.filter((o) => o.status === "practising").length,
          notStarted: os.filter((o) => o.status === "not_started").length,
        };
      })
      .filter((s) => s.strong + s.practising + s.notStarted > 0);
    return c.json({ band: childBand(child), subjects, outcomes });
  });

  // ---- reviewing Hoot chats and reports
  r.get("/children/:childId/chats", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const rows = await db.all<{ lesson_id: string }>(
      "SELECT id, lesson_id, role, content, flagged, created_at FROM tutor_messages WHERE child_id = ? ORDER BY created_at, seq",
      [child.id],
    );
    const familyTitles = new Map((await ctx.familyLessonsOf(c.get("parentId"))).map((l) => [l.id, l.title]));
    return c.json({ messages: rows.map((m) => ({ ...m, lessonTitle: content.lessons.get(m.lesson_id)?.title ?? familyTitles.get(m.lesson_id) ?? m.lesson_id })) });
  });

  r.get("/reports", async (c) =>
    c.json({ reports: await db.all("SELECT * FROM reports WHERE parent_id = ? ORDER BY created_at DESC", [c.get("parentId")]) }),
  );

  // ---- account
  r.patch("/pin", async (c) => {
    const { newPin } = z.object({ newPin: Pin }).parse(await c.req.json());
    await db.run("UPDATE parents SET pin_hash = ? WHERE id = ?", [hashSecret(newPin), c.get("parentId")]);
    return c.json({ ok: true });
  });

  /** Change the password while signed in. Needs the current one; signs out every other device. */
  r.patch("/password", async (c) => {
    const b = z.object({ currentPassword: Secret, newPassword: Password }).parse(await c.req.json());
    const id = c.get("parentId");
    const check = await ctx.checkPassword(c.get("parent"), b.currentPassword);
    if (check === "locked") return c.json({ error: "too_many_attempts" }, 429);
    if (check === "wrong") return c.json({ error: "wrong_password" }, 401);
    await db.run("UPDATE parents SET password_hash = ? WHERE id = ?", [hashSecret(b.newPassword), id]);
    const version = await ctx.revokeSessions(id);
    return c.json({
      familyToken: await issueToken(id, "family", version),
      parentToken: await issueToken(id, "parent", version),
      expiresInSec: config.security.parentTokenMinutes * 60,
    });
  });

  /** Lost a phone? Signs out every device, then returns a fresh sign-in (and parent unlock) for this one. */
  r.post("/sign-out-everywhere", async (c) => {
    const id = c.get("parentId");
    const version = await ctx.revokeSessions(id);
    return c.json({
      familyToken: await issueToken(id, "family", version),
      parentToken: await issueToken(id, "parent", version),
      expiresInSec: config.security.parentTokenMinutes * 60,
    });
  });

  /** Family settings: currently just the (optional) country used for helpline information. */
  r.patch("/settings", async (c) => {
    const b = z.object({ country: Country.nullable() }).parse(await c.req.json());
    await db.run("UPDATE parents SET country = ? WHERE id = ?", [b.country, c.get("parentId")]);
    return c.json({ ok: true, country: b.country });
  });

  /** Data portability: everything we hold about this family. */
  r.get("/export", async (c) => {
    const id = c.get("parentId");
    const p = c.get("parent");
    const kids = await listChildren(id);
    const per = async (sql: string) => {
      const rows: unknown[] = [];
      for (const k of kids) rows.push(...(await db.all(sql, [k.id])));
      return rows;
    };
    return c.json({
      exportedAt: now(),
      parent: { email: p.email, country: p.country, emailVerified: !!p.email_verified_at, consentAt: p.consent_at, createdAt: p.created_at },
      children: kids.map(childPublic),
      progress: await per("SELECT * FROM progress WHERE child_id = ?"),
      // explicit columns: the internal ordering column (seq) is not part of the export
      tutorMessages: await per("SELECT id, child_id, lesson_id, role, content, flagged, created_at FROM tutor_messages WHERE child_id = ?"),
      reports: await db.all("SELECT * FROM reports WHERE parent_id = ?", [id]),
      usageMinutes: await per("SELECT child_id, day, minutes, bonus FROM usage WHERE child_id = ?"),
      solvedQuizQuestions: await per("SELECT child_id, lesson_id, q_index, solved_at FROM quiz_solved WHERE child_id = ?"),
      hintsOpened: await per("SELECT child_id, item_id, q_index, level FROM hints_seen WHERE child_id = ?"),
      spellingProgress: await per("SELECT child_id, word, box, due, last_day FROM spelling_progress WHERE child_id = ?"),
      familyLessons: (await ctx.familyLessonsOf(id)).map(toFormShape),
      gamesSolved: await per("SELECT child_id, game, puzzle_key, solved_at, hint_chains FROM games_solved WHERE child_id = ?"),
    });
  });

  /** Right to erasure: deletes the parent and (via cascade) every child record. */
  r.delete("/account", async (c) => {
    // The PIN alone is not enough to erase a family: a child may have seen it. Ask for the account password too.
    const { password } = z.object({ password: Secret }).parse(await c.req.json().catch(() => ({})));
    const check = await ctx.checkPassword(c.get("parent"), password);
    if (check === "locked") return c.json({ error: "too_many_attempts" }, 429);
    if (check === "wrong") return c.json({ error: "wrong_password" }, 401);
    await db.run("DELETE FROM parents WHERE id = ?", [c.get("parentId")]);
    return c.json({ ok: true });
  });

  // ---- lessons the family adds themselves (private to this family; see family-lessons.ts)
  /** Validates a lesson from the form. Returns the lesson to store, or the response to send back. */
  async function readFamilyLesson(c: import("hono").Context<Env>, id: string) {
    const input = FamilyLessonInput.parse(await c.req.json().catch(() => ({})));
    const problem = checkSubject(content.map, input.band, input.subject);
    if (problem) return { error: c.json({ error: "invalid_input", details: [`${problem.field}: ${problem.message}`] }, 400) };
    const lesson = buildFamilyLesson(id, c.get("parentId"), input);
    const { ownerId: _owner, family: _family, ...stored } = lesson;
    if (sizeOf(stored) > MAX_FAMILY_LESSON_BYTES) {
      return { error: c.json({ error: "invalid_input", details: [`This lesson is too long (over ${MAX_FAMILY_LESSON_BYTES / 1000} KB). Shorten the text or split it into two lessons.`] }, 400) };
    }
    return { stored, warnings: warningsFor(input) };
  }

  r.get("/lessons", async (c) => {
    const lessons = await ctx.familyLessonsOf(c.get("parentId"));
    return c.json({ lessons: lessons.map(toFormShape), limit: MAX_FAMILY_LESSONS, subjects: content.map.subjects.map((s) => ({ id: s.id, name: s.name, bands: s.bands ?? null })) });
  });

  r.post("/lessons", async (c) => {
    const parentId = c.get("parentId");
    const count = (await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM family_lessons WHERE parent_id = ?", [parentId]))!.n;
    if (count >= MAX_FAMILY_LESSONS) return c.json({ error: "too_many_lessons", limit: MAX_FAMILY_LESSONS }, 400);
    const id = FAMILY_LESSON_PREFIX + newId();
    const made = await readFamilyLesson(c, id);
    if ("error" in made) return made.error;
    await db.run("INSERT INTO family_lessons (id, parent_id, json, created_at, updated_at) VALUES (?,?,?,?,?)", [id, parentId, JSON.stringify(made.stored), now(), now()]);
    return c.json({ lesson: toFormShape(made.stored), warnings: made.warnings }, 201);
  });

  r.put("/lessons/:lessonId", async (c) => {
    const parentId = c.get("parentId");
    const id = c.req.param("lessonId");
    if (!(await ctx.familyLesson(parentId, id))) return c.json({ error: "lesson_not_found" }, 404);
    const made = await readFamilyLesson(c, id);
    if ("error" in made) return made.error;
    await db.run("UPDATE family_lessons SET json = ?, updated_at = ? WHERE id = ? AND parent_id = ?", [JSON.stringify(made.stored), now(), id, parentId]);
    // The questions may have changed, so what children opened or solved for the old version no longer lines up.
    await db.run("DELETE FROM hints_seen WHERE item_id = ?", [id]);
    await db.run("DELETE FROM quiz_solved WHERE lesson_id = ?", [id]);
    return c.json({ lesson: toFormShape(made.stored), warnings: made.warnings });
  });

  r.delete("/lessons/:lessonId", async (c) => {
    const parentId = c.get("parentId");
    const id = c.req.param("lessonId");
    if (!(await ctx.familyLesson(parentId, id))) return c.json({ error: "lesson_not_found" }, 404);
    await db.run("DELETE FROM family_lessons WHERE id = ? AND parent_id = ?", [id, parentId]);
    // Lesson ids are unique, so everything tied to this lesson can go with it (progress, hints, solved questions, Hoot chat).
    for (const sql of [
      "DELETE FROM progress WHERE lesson_id = ?",
      "DELETE FROM hints_seen WHERE item_id = ?",
      "DELETE FROM quiz_solved WHERE lesson_id = ?",
      "DELETE FROM tutor_messages WHERE lesson_id = ?",
    ]) await db.run(sql, [id]);
    return c.json({ ok: true });
  });

  return r;
}
