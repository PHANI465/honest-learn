// Games. Needs a family token (checked in app.ts for /children/*).
//
// Sudoku: the app gets only the clues. It asks the server whether what it has filled in is right (`check`, which names the
// wrong squares but never sends the solution) and for hints (`hint`, the same three-step ladder as quizzes, recorded in
// hints_seen so the app cannot skip ahead). A puzzle always has exactly one solution (see games/sudoku.ts).
import { Hono } from "hono";
import { z } from "zod";
import { now } from "../db.ts";
import { childBand } from "../models.ts";
import { CLUES, generate, hintTexts, LEVELS, mistakeTexts, nextStep, specFor, type Puzzle } from "../games/sudoku.ts";
import type { Ctx, Env } from "../context.ts";

const MAX_PUZZLE = 9999;
const cache = new Map<string, Puzzle>();

/** Puzzles are generated from a seed, so they cost nothing to keep; a small cache saves redoing the work for each check or hint. */
function puzzleFor(childId: string, band: Parameters<typeof specFor>[0], level: 1 | 2 | 3, n: number): Puzzle {
  const spec = specFor(band);
  const key = `${childId}:${spec.size}:${level}:${n}`;
  let p = cache.get(key);
  if (!p) {
    p = generate(spec, level, key);
    cache.set(key, p);
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
  }
  return p;
}

const Level = z.coerce.number().int().min(1).max(3).default(1);
const N = z.coerce.number().int().min(1).max(MAX_PUZZLE);
const Cells = (size: number) => z.array(z.number().int().min(0).max(size)).length(size * size);

export function gameRoutes(ctx: Ctx) {
  const { db, loadChild } = ctx;
  const r = new Hono<Env>();

  const itemKey = (size: number, level: number, n: number) => `sudoku-${size}-${level}-${n}`;

  // ---- overview: grid size for this child's age, and how many puzzles are solved at each level
  r.get("/children/:childId/games/sudoku", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const spec = specFor(childBand(child));
    const rows = await db.all<{ key: string }>("SELECT puzzle_key AS key FROM games_solved WHERE child_id = ? AND game = 'sudoku'", [child.id]);
    const solved = new Set(rows.map((x) => x.key));
    const levels = LEVELS.map((level) => {
      // `solved` counts all finished puzzles at this level; `next` is the lowest-numbered one not finished yet
      const count = rows.filter((x) => x.key.startsWith(`sudoku-${spec.size}-${level}-`)).length;
      let next = 1;
      while (next < MAX_PUZZLE && solved.has(itemKey(spec.size, level, next))) next++;
      return { level, solved: count, next, clues: CLUES[spec.size]![level - 1]! };
    });
    return c.json({ size: spec.size, boxRows: spec.boxRows, boxCols: spec.boxCols, levels });
  });

  // ---- one puzzle: the clues only
  r.get("/children/:childId/games/sudoku/:n", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const n = N.parse(c.req.param("n"));
    const level = Level.parse(c.req.query("level")) as 1 | 2 | 3;
    const p = puzzleFor(child.id, childBand(child), level, n);
    const done = await db.get("SELECT 1 AS x FROM games_solved WHERE child_id = ? AND game = 'sudoku' AND puzzle_key = ?", [child.id, itemKey(p.spec.size, level, n)]);
    return c.json({ n, level, size: p.spec.size, boxRows: p.spec.boxRows, boxCols: p.spec.boxCols, givens: p.givens, solved: !!done });
  });

  // ---- check: which filled squares are wrong; records a finished puzzle
  r.post("/children/:childId/games/sudoku/:n/check", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const n = N.parse(c.req.param("n"));
    const level = Level.parse(c.req.query("level")) as 1 | 2 | 3;
    const p = puzzleFor(child.id, childBand(child), level, n);
    const { cells } = z.object({ cells: Cells(p.spec.size) }).parse(await c.req.json());
    // clues cannot be changed: whatever the app sends for them is ignored
    const board = cells.map((v, i) => (p.givens[i] ? p.givens[i]! : v));
    const wrong = board.map((v, i) => (v !== 0 && v !== p.solution[i] ? i : -1)).filter((i) => i >= 0);
    const filled = board.filter(Boolean).length;
    const solved = wrong.length === 0 && filled === board.length;
    if (solved) {
      const chains = await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM hints_seen WHERE child_id = ? AND item_id = ?", [child.id, itemKey(p.spec.size, level, n)]);
      await db.run("INSERT INTO games_solved (child_id, game, puzzle_key, solved_at, hint_chains) VALUES (?,?,?,?,?) ON CONFLICT (child_id, game, puzzle_key) DO NOTHING", [
        child.id,
        "sudoku",
        itemKey(p.spec.size, level, n),
        now(),
        chains?.n ?? 0,
      ]);
    }
    return c.json({ wrong, filled, solved });
  });

  // ---- hint ladder: technique, then where to look, then the number with the reason
  r.post("/children/:childId/games/sudoku/:n/hint", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const n = N.parse(c.req.param("n"));
    const level = Level.parse(c.req.query("level")) as 1 | 2 | 3;
    const p = puzzleFor(child.id, childBand(child), level, n);
    const b = z.object({ cells: Cells(p.spec.size), level: z.number().int().min(0).max(2) }).parse(await c.req.json());
    const board = b.cells.map((v, i) => (p.givens[i] ? p.givens[i]! : v));
    const wrongAt = board.findIndex((v, i) => v !== 0 && v !== p.solution[i]);
    const step = wrongAt >= 0 ? null : nextStep(board, p.spec, p.solution);
    if (wrongAt < 0 && !step) return c.json({ error: "nothing_to_hint", hint: null }, 400);

    // Each hint chain (technique, place, number) is one "question" in hints_seen. A new chain starts after the last one was finished.
    const item = itemKey(p.spec.size, level, n);
    const last = await db.get<{ q_index: number; level: number }>("SELECT q_index, level FROM hints_seen WHERE child_id = ? AND item_id = ? ORDER BY q_index DESC LIMIT 1", [child.id, item]);
    const chain = last ? (last.level >= 2 && b.level === 0 ? last.q_index + 1 : last.q_index) : 0;
    if (!(await ctx.openHint(child.id, item, chain, b.level))) return c.json({ error: "hint_out_of_order" }, 400);
    const texts = wrongAt >= 0 ? mistakeTexts(p.spec, wrongAt) : hintTexts(p.spec, step!);
    return c.json({ hint: texts[b.level], level: b.level, chain, isLast: b.level === 2 });
  });

  return r;
}
