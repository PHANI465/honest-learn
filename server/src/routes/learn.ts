// What a child uses: home screen, lessons, quizzes (hint ladder), practice, "learn more" and free resources.
// Needs a family token (checked in app.ts for /family, /children/* and /reports).
import { Hono } from "hono";
import { z } from "zod";
import { now } from "../db.ts";
import { lessonSummary, publicLesson, type Lesson } from "../content.ts";
import { lessonWikiTitle, wikiHostFor } from "../wiki.ts";
import { optionOrder } from "../shuffle.ts";
import { childBand, childPublic, Choices, reviewIntervalDays } from "../models.ts";
import type { Ctx, Env } from "../context.ts";

const QuestionRef = z.object({ question: z.number().int().min(0).max(1000) });

export function learnRoutes(ctx: Ctx) {
  const { db, content, wiki, loadChild, lessonFor, visibleTo } = ctx;
  const r = new Hono<Env>();

  r.get("/family", async (c) => {
    const p = c.get("parent");
    const kids = (await ctx.listChildren(p.id)).map(childPublic);
    return c.json({ parent: { email: p.email, emailVerified: !!p.email_verified_at, country: p.country }, children: kids });
  });

  r.get("/children/:childId/home", async (c) => {
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
    // "Keep going": the next unfinished lesson, preferring the subject the child has made most progress in.
    const bySubjectProgress = [...subjects].sort((a, b) => b.completed - a.completed);
    let next: Lesson | undefined;
    for (const s of bySubjectProgress) {
      next = visible.find((l) => l.subject === s.id && !doneIds.has(l.id));
      if (next) break;
    }
    const visibleIds = new Set(visible.map((l) => l.id));
    const totals = {
      lessons: visible.length,
      completed: visible.filter((l) => doneIds.has(l.id)).length,
      // a star for every lesson finished with every question right
      stars: done.filter((d) => visibleIds.has(d.lesson_id) && d.best_score === d.total).length,
    };
    return c.json({ child: childPublic(child), band: bandInfo, subjects, reviewDue, next: next ? lessonSummary(next) : null, totals });
  });

  r.get("/children/:childId/lessons", async (c) => {
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
    const lessons = all.filter((l) => visibleTo(child, l)).map((l) => ({ ...lessonSummary(l), progress: progress.get(l.id) ?? null }));
    // Tell the app that locked lessons exist (so it can say "ask a parent"), without their content.
    const locked = all.filter((l) => l.sensitive && !visibleTo(child, l)).length;
    return c.json({ lessons, lockedCount: locked });
  });

  r.get("/children/:childId/lessons/:lessonId", async (c) => {
    const found = await lessonFor(c);
    if (found instanceof Response) return found;
    const { child, lesson } = found;
    const solved = (
      await db.all<{ q_index: number }>("SELECT q_index FROM quiz_solved WHERE child_id = ? AND lesson_id = ?", [child.id, lesson.id])
    ).map((s) => s.q_index);
    return c.json({ lesson: publicLesson(lesson, (i, n) => optionOrder(child.id, lesson.id, i, n)), solved });
  });

  /** Wikipedia summary for this lesson's topic (ages 9+; Simple English for 9–11). */
  r.get("/children/:childId/lessons/:lessonId/learn-more", async (c) => {
    const found = await lessonFor(c);
    if (found instanceof Response) return found;
    const band = childBand(found.child);
    if (!wikiHostFor(band)) return c.json({ available: false, reason: "not_for_age" });
    const title = lessonWikiTitle(found.lesson);
    if (!title) return c.json({ available: false, reason: "no_article" });
    const summary = await wiki.summary(band, title);
    if (!summary) return c.json({ available: false, reason: "not_found" });
    return c.json({ available: true, ...summary, opensWithParentPin: band === "b3" });
  });

  /** Curated free learning resources outside the app, for this child's age (and optionally one subject). */
  r.get("/children/:childId/resources", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const band = childBand(child);
    const subject = c.req.query("subject");
    const resources = content.resources.filter((x) => x.bands.includes(band) && (!subject || x.subjects.includes(subject)));
    // Under-13s need a grown-up to open outside links (app-store kids rules); teens get a "leaving the app" notice.
    return c.json({ resources, opensWithParentPin: band === "b1" || band === "b2" || band === "b3" });
  });

  // ---- quiz: hints in order, checks, and completion (scores count first tries only)
  r.post("/children/:childId/lessons/:lessonId/hint", async (c) => {
    const found = await lessonFor(c);
    if (found instanceof Response) return found;
    const body = QuestionRef.extend({ level: z.number().int().min(0).max(2) }).parse(await c.req.json());
    const q = found.lesson.quiz[body.question];
    if (!q) return c.json({ error: "question_not_found" }, 404);
    if (!(await ctx.openHint(found.child.id, found.lesson.id, body.question, body.level))) return c.json({ error: "hint_out_of_order" }, 400);
    return c.json({ hint: q.hints[body.level], level: body.level, isLast: body.level === 2 });
  });

  r.post("/children/:childId/lessons/:lessonId/check", async (c) => {
    const found = await lessonFor(c);
    if (found instanceof Response) return found;
    const { child, lesson } = found;
    const body = QuestionRef.extend({ choice: z.number().int().min(0), hintsUsed: z.number().int().min(0).max(3) }).parse(await c.req.json());
    const q = lesson.quiz[body.question];
    if (!q) return c.json({ error: "question_not_found" }, 404);
    // body.choice is the position on screen; map it back to the lesson's own option index.
    const order = optionOrder(child.id, lesson.id, body.question, q.options.length);
    if (body.choice >= order.length) return c.json({ error: "invalid_input", details: ["choice out of range"] }, 400);
    const correct = order[body.choice] === q.answer;
    if (correct) {
      await db.run("INSERT INTO quiz_solved (child_id, lesson_id, q_index, solved_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING", [
        child.id,
        lesson.id,
        body.question,
        now(),
      ]);
    }
    const reveal = await ctx.mayReveal(correct, body.hintsUsed, child.id, lesson.id, body.question);
    return c.json({ correct, explain: reveal ? q.explain : null, answer: !correct && reveal ? order.indexOf(q.answer) : null });
  });

  r.post("/children/:childId/lessons/:lessonId/complete", async (c) => {
    const found = await lessonFor(c);
    if (found instanceof Response) return found;
    const { child, lesson } = found;
    const { choices } = z.object({ choices: Choices }).parse(await c.req.json());
    if (choices.length !== lesson.quiz.length) return c.json({ error: "answer_every_question" }, 400);
    const score = lesson.quiz.filter((q, i) => optionOrder(child.id, lesson.id, i, q.options.length)[choices[i]!] === q.answer).length;
    const total = lesson.quiz.length;
    const prev = await db.get<{ best_score: number; attempts: number }>(
      "SELECT best_score, attempts FROM progress WHERE child_id = ? AND lesson_id = ?",
      [child.id, lesson.id],
    );
    const attempts = (prev?.attempts ?? 0) + 1;
    const best = Math.max(score, prev?.best_score ?? 0);
    const due = new Date(Date.now() + reviewIntervalDays(score, total, attempts) * 86_400_000).toISOString();
    await db.run(
      `INSERT INTO progress (child_id, lesson_id, best_score, total, attempts, completed_at, review_due)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (child_id, lesson_id) DO UPDATE SET best_score = excluded.best_score, total = excluded.total,
         attempts = excluded.attempts, completed_at = excluded.completed_at, review_due = excluded.review_due`,
      [child.id, lesson.id, best, total, attempts, now(), due],
    );
    return c.json({ score, total, best, reviewDue: due });
  });

  // ---- practice quiz: mixed questions from a subject (retrieval practice, not scored)
  r.get("/children/:childId/practice", async (c) => {
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
    const questions = pool
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
    return c.json({ questions });
  });

  return r;
}
