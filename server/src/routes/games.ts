// Games. Needs a family token (checked in app.ts for /children/*).
//
// Sudoku: the app gets only the clues. It asks the server whether what it has filled in is right (`check`, which names the
// wrong squares but never sends the solution) and for hints (`hint`, the same three-step ladder as quizzes, recorded in
// hints_seen so the app cannot skip ahead). A puzzle always has exactly one solution (see games/sudoku.ts).
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { now } from "../db.ts";
import { autoHints, CHESS_LEVELS, LEVEL_NAMES, playStep, positionAt, type ChessPuzzle } from "../games/chess.ts";
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

  // ================================================================ chess puzzles
  /** The puzzles this child may play: the levels offered for their age group, if the set is published (or drafts are shown). */
  const chessFor = (child: Parameters<typeof childBand>[0]) => {
    const out: { level: number; name: string; puzzles: ChessPuzzle[] }[] = [];
    for (const level of CHESS_LEVELS[childBand(child)]) {
      const set = ctx.content.chess.get(String(level));
      if (set && (set.status === "reviewed" || config.showDrafts)) out.push({ level, name: LEVEL_NAMES[level] ?? set.title, puzzles: set.puzzles as ChessPuzzle[] });
    }
    return out;
  };
  const findPuzzle = (child: Parameters<typeof childBand>[0], id: string) => {
    for (const l of chessFor(child)) {
      const p = l.puzzles.find((x) => x.id === id);
      if (p) return p;
    }
    return null;
  };

  r.get("/children/:childId/games/chess", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const solved = new Set((await db.all<{ key: string }>("SELECT puzzle_key AS key FROM games_solved WHERE child_id = ? AND game = 'chess'", [child.id])).map((x) => x.key));
    return c.json({
      available: chessFor(child).length > 0,
      levels: chessFor(child).map((l) => ({ level: l.level, name: l.name, solved: l.puzzles.filter((p) => solved.has(p.id)).length, puzzles: l.puzzles.map((p) => ({ id: p.id, theme: p.theme, solved: solved.has(p.id) })) })),
    });
  });

  r.get("/children/:childId/games/chess/:puzzleId", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const p = findPuzzle(child, c.req.param("puzzleId"));
    if (!p) return c.json({ error: "puzzle_not_found" }, 404);
    const done = await db.get("SELECT 1 AS x FROM games_solved WHERE child_id = ? AND game = 'chess' AND puzzle_key = ?", [child.id, p.id]);
    // the position and what to achieve: never the moves
    return c.json({ id: p.id, theme: p.theme, fen: p.fen, toMove: p.fen.split(" ")[1] === "b" ? "black" : "white", goal: p.goal, solverMoves: p.solverMoves, solved: !!done });
  });

  /** One move of the child's. A wrong move is just "wrong": it never says what the right move is. */
  r.post("/children/:childId/games/chess/:puzzleId/move", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const p = findPuzzle(child, c.req.param("puzzleId"));
    if (!p) return c.json({ error: "puzzle_not_found" }, 404);
    const b = z.object({
      step: z.number().int().min(0).max(8),
      from: z.string().regex(/^[a-h][1-8]$/),
      to: z.string().regex(/^[a-h][1-8]$/),
      promotion: z.enum(["q", "r", "b", "n"]).optional(),
    }).parse(await c.req.json());
    const r1 = playStep(p, b.step, b);
    if (!r1.ok) return c.json({ correct: false, reason: r1.reason });
    if (r1.done) {
      await db.run("INSERT INTO games_solved (child_id, game, puzzle_key, solved_at, hint_chains) VALUES (?,?,?,?,?) ON CONFLICT (child_id, game, puzzle_key) DO NOTHING", [
        child.id,
        "chess",
        p.id,
        now(),
        (await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM hints_seen WHERE child_id = ? AND item_id = ?", [child.id, `chess-${p.id}`]))?.n ?? 0,
      ]);
    }
    return c.json({
      correct: true,
      san: r1.san,
      reply: r1.reply ? { from: r1.reply.from, to: r1.reply.to, san: r1.reply.san } : null,
      done: r1.done,
      /** the position right after the child's move; `fenAfterReply` is the position once Black has replied */
      fen: r1.fen,
      fenAfterReply: r1.fenAfterReply,
      // shown only once solved: what happens next in a "win" puzzle, and why it works
      ...(r1.done ? { rest: r1.rest, explain: p.explain } : {}),
    });
  });

  /** Hint ladder for the move at `step`: the puzzle's own hints for the first move, then plain ones made from the line. */
  r.post("/children/:childId/games/chess/:puzzleId/hint", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const p = findPuzzle(child, c.req.param("puzzleId"));
    if (!p) return c.json({ error: "puzzle_not_found" }, 404);
    const b = z.object({ step: z.number().int().min(0).max(8), level: z.number().int().min(0).max(2) }).parse(await c.req.json());
    if (b.step % 2 !== 0 || b.step >= p.solution.length) return c.json({ error: "invalid_input", details: ["step is not one of your moves"] }, 400);
    if (!(await ctx.openHint(child.id, `chess-${p.id}`, b.step / 2, b.level))) return c.json({ error: "hint_out_of_order" }, 400);
    let text: string;
    if (b.step === 0) text = p.hints[b.level]!;
    else {
      const m = autoHints(p, b.step);
      text = [p.goal === "mate" ? "Look for the move that gives checkmate." : "Look for the move that finishes the job.", `Use your ${m.piece}.`, `Play ${m.san}.`][b.level]!;
    }
    return c.json({ hint: text, level: b.level, isLast: b.level === 2 });
  });

  return r;
}
