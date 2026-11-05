// Reasoning puzzles (IQ-style practice — never an IQ score).
// Needs a family token (checked in app.ts for /children/*).
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { now } from "../db.ts";
import { optionOrder } from "../shuffle.ts";
import { childBand, Choices, type ChildRow } from "../models.ts";
import type { Ctx, Env } from "../context.ts";

export function puzzleRoutes(ctx: Ctx) {
  const { db, content, loadChild } = ctx;
  const r = new Hono<Env>();

  const puzzleSetFor = (child: ChildRow) => {
    const set = content.puzzles.get(childBand(child));
    return set && (set.status === "reviewed" || config.showDrafts) ? set : null;
  };
  /** Puzzle progress is stored like a lesson, under this id. */
  const setKey = (band: string) => `puzzles-${band}`;

  r.get("/children/:childId/puzzles", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const set = puzzleSetFor(child);
    if (!set) return c.json({ available: false });
    const key = setKey(set.band);
    const best = (await db.get("SELECT best_score, total FROM progress WHERE child_id = ? AND lesson_id = ?", [child.id, key])) ?? null;
    return c.json({
      available: true,
      title: set.title,
      status: set.status,
      best,
      puzzles: set.puzzles.map((p, i) => ({
        id: p.id,
        type: p.type,
        q: p.q,
        options: optionOrder(child.id, key, i, p.options.length).map((o) => p.options[o]!),
      })),
    });
  });

  r.post("/children/:childId/puzzles/hint", async (c) => {
    const child = await loadChild(c);
    const set = child && puzzleSetFor(child);
    if (!child || !set) return c.json({ error: "not_found" }, 404);
    const b = z.object({ question: z.number().int().min(0).max(1000), level: z.number().int().min(0).max(2) }).parse(await c.req.json());
    const p = set.puzzles[b.question];
    if (!p) return c.json({ error: "question_not_found" }, 404);
    if (!(await ctx.openHint(child.id, setKey(set.band), b.question, b.level))) return c.json({ error: "hint_out_of_order" }, 400);
    return c.json({ hint: p.hints[b.level], level: b.level, isLast: b.level === 2 });
  });

  r.post("/children/:childId/puzzles/check", async (c) => {
    const child = await loadChild(c);
    const set = child && puzzleSetFor(child);
    if (!child || !set) return c.json({ error: "not_found" }, 404);
    const b = z
      .object({ question: z.number().int().min(0).max(1000), choice: z.number().int().min(0), hintsUsed: z.number().int().min(0).max(3) })
      .parse(await c.req.json());
    const p = set.puzzles[b.question];
    if (!p) return c.json({ error: "question_not_found" }, 404);
    const key = setKey(set.band);
    const order = optionOrder(child.id, key, b.question, p.options.length);
    if (b.choice >= order.length) return c.json({ error: "invalid_input", details: ["choice out of range"] }, 400);
    const correct = order[b.choice] === p.answer;
    const reveal = await ctx.mayReveal(correct, b.hintsUsed, child.id, key, b.question);
    return c.json({ correct, explain: reveal ? p.explain : null, answer: !correct && reveal ? order.indexOf(p.answer) : null });
  });

  r.post("/children/:childId/puzzles/complete", async (c) => {
    const child = await loadChild(c);
    const set = child && puzzleSetFor(child);
    if (!child || !set) return c.json({ error: "not_found" }, 404);
    const { choices } = z.object({ choices: Choices }).parse(await c.req.json());
    if (choices.length !== set.puzzles.length) return c.json({ error: "answer_every_question" }, 400);
    const key = setKey(set.band);
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

  return r;
}
