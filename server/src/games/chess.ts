// Chess puzzles: move checking (one move at a time) and the verifier that proves each puzzle is sound.
//
// A puzzle is a position (FEN) and a main line in SAN, starting with the move the child must find. Two goals:
//  - "mate": the child must give checkmate in `solverMoves` moves. The opponent's replies in the line are played for them.
//  - "win":  the child finds ONE move that wins material by force; the rest of the line is only shown afterwards.
// Every puzzle must have exactly one first move that achieves its goal (no alternative solutions), checked by exhaustive search
// in `verifyPuzzle`. Rules of chess come from chess.js, so nothing here re-implements them.
import { Chess, type Move, type PieceSymbol } from "chess.js";
import type { BandId } from "../security.ts";

export type Goal = "mate" | "win";

export interface ChessPuzzle {
  id: string;
  fen: string;
  theme: string;
  goal: Goal;
  /** How many moves the child plays: 1 for "win" puzzles, 1 to 3 for "mate". */
  solverMoves: number;
  /** The main line in SAN, starting with the child's move. Replies are at odd positions. */
  solution: string[];
  hints: [string, string, string];
  explain: string;
}

/** Levels offered by age group. Chess is not offered to ages 3 to 5. */
export const CHESS_LEVELS: Record<BandId, number[]> = { b1: [], b2: [1], b3: [1, 2], b4: [1, 2, 3], b5: [1, 2, 3] };
export const LEVEL_NAMES: Record<number, string> = { 1: "Checkmate in one", 2: "Winning tactics", 3: "Checkmate in two" };

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const PIECE_NAMES: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
export const pieceName = (t: PieceSymbol) => PIECE_NAMES[t];

/** Material balance from White's point of view. */
export function material(chess: Chess): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const sq of row) if (sq) total += (sq.color === "w" ? 1 : -1) * VALUE[sq.type];
  }
  return total;
}

// ---------------------------------------------------------------- move checking
export interface MoveInput {
  from: string;
  to: string;
  promotion?: string;
}

/** The position after the first `plies` moves of the main line. */
export function positionAt(p: ChessPuzzle, plies: number): Chess {
  const chess = new Chess(p.fen);
  for (let i = 0; i < plies; i++) chess.move(p.solution[i]!);
  return chess;
}

export type StepResult =
  | { ok: false; reason: "illegal" | "wrong" }
  | { ok: true; san: string; reply: Move | null; done: boolean; fen: string; fenAfterReply: string | null; rest: string[] };

/**
 * Checks one move of the child's at main-line position `step` (0, 2, 4 ...). A legal move that is not the main-line move is
 * "wrong" and says nothing about what the right move is. A right move returns the opponent's reply (for mate puzzles) and
 * whether the puzzle is finished. `rest` is what happens afterwards in a "win" puzzle, for showing once it is solved.
 */
export function playStep(p: ChessPuzzle, step: number, input: MoveInput): StepResult {
  if (step % 2 !== 0 || step < 0 || step >= p.solution.length) return { ok: false, reason: "illegal" };
  const chess = positionAt(p, step);
  let attempt: Move;
  try {
    attempt = chess.move({ from: input.from, to: input.to, promotion: input.promotion ?? "q" });
  } catch {
    return { ok: false, reason: "illegal" };
  }
  const expected = positionAt(p, step);
  const want = expected.move(p.solution[step]!);
  const solverMovesDone = step / 2 + 1;
  const done = solverMovesDone >= p.solverMoves;
  if (p.goal === "mate" && done) {
    // the last move of a mate puzzle: any move that gives checkmate is right, not only the one in the stored line
    if (!chess.isCheckmate()) return { ok: false, reason: "wrong" };
    return { ok: true, san: attempt.san, reply: null, done: true, fen: chess.fen(), fenAfterReply: null, rest: [] };
  }
  if (attempt.from !== want.from || attempt.to !== want.to || (attempt.promotion ?? "") !== (want.promotion ?? "")) return { ok: false, reason: "wrong" };
  if (p.goal === "win" || done) {
    return { ok: true, san: want.san, reply: null, done: true, fen: chess.fen(), fenAfterReply: null, rest: p.solution.slice(step + 1) };
  }
  const fenAfterMove = chess.fen(); // the position right after the child's move, before Black replies
  const reply = chess.move(p.solution[step + 1]!);
  return { ok: true, san: want.san, reply, done: false, fen: fenAfterMove, fenAfterReply: chess.fen(), rest: [] };
}

// ---------------------------------------------------------------- verifying a puzzle
/** All first moves (SAN) for the side to move, from the position. */
const legal = (chess: Chess) => chess.moves({ verbose: true }) as Move[];

/** Can the side to move force checkmate within `n` of its own moves? */
export function canMate(chess: Chess, n: number): boolean {
  for (const m of legal(chess)) {
    chess.move(m);
    let wins: boolean;
    if (chess.isCheckmate()) wins = true;
    else if (n <= 1 || chess.isGameOver()) wins = false;
    else {
      const replies = legal(chess);
      wins = replies.length > 0 && replies.every((r) => {
        chess.move(r);
        const ok = canMate(chess, n - 1);
        chess.undo();
        return ok;
      });
    }
    chess.undo();
    if (wins) return true;
  }
  return false;
}

/** Every first move that forces mate within `n` moves. */
export function mateFirstMoves(fen: string, n: number): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const m of legal(chess)) {
    chess.move(m);
    let wins: boolean;
    if (chess.isCheckmate()) wins = true;
    else if (n <= 1 || chess.isGameOver()) wins = false;
    else {
      const replies = legal(chess);
      wins = replies.length > 0 && replies.every((r) => {
        chess.move(r);
        const ok = canMate(chess, n - 1);
        chess.undo();
        return ok;
      });
    }
    chess.undo();
    if (wins) out.push(m.san);
  }
  return out;
}

/** Minimax on material, `depth` plies, from White's point of view. Checkmate counts as a huge win. */
function search(chess: Chess, depth: number, alpha: number, beta: number): number {
  if (chess.isCheckmate()) return chess.turn() === "w" ? -1000 : 1000;
  if (chess.isDraw() || chess.isStalemate()) return 0;
  if (depth === 0) return material(chess);
  const moves = legal(chess);
  // look at captures first: better pruning
  moves.sort((a, b) => Number(!!b.captured) - Number(!!a.captured));
  if (chess.turn() === "w") {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      best = Math.max(best, search(chess, depth - 1, alpha, beta));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    chess.move(m);
    best = Math.min(best, search(chess, depth - 1, alpha, beta));
    chess.undo();
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

/** Each legal first move with its material result after `depth` plies of best play (positive is good for the mover). */
export function scoreFirstMoves(fen: string, depth: number): { san: string; score: number }[] {
  const chess = new Chess(fen);
  const sign = chess.turn() === "w" ? 1 : -1;
  return legal(chess).map((m) => {
    chess.move(m);
    const s = search(chess, depth - 1, -Infinity, Infinity) * sign;
    chess.undo();
    return { san: m.san, score: s };
  });
}

export interface Verdict {
  ok: boolean;
  problems: string[];
}

/**
 * Proves a puzzle is sound: the FEN is a legal position, the whole main line is legal, the goal really happens, the child's
 * first move is the ONLY move that achieves it, and (for "win") the material gain is real against best defence.
 */
export function verifyPuzzle(p: ChessPuzzle): Verdict {
  const problems: string[] = [];
  let chess: Chess;
  try {
    chess = new Chess(p.fen);
  } catch {
    return { ok: false, problems: ["the FEN is not valid"] };
  }
  if (chess.isGameOver()) problems.push("the position is already over");
  const mover = chess.turn();
  try {
    const line = new Chess(p.fen);
    for (const san of p.solution) line.move(san);
    if (p.goal === "mate") {
      if (!line.isCheckmate()) problems.push("the main line does not end in checkmate");
      if (p.solution.length !== 2 * p.solverMoves - 1) problems.push(`a mate in ${p.solverMoves} needs ${2 * p.solverMoves - 1} moves in the line`);
    }
  } catch {
    problems.push("the main line contains an illegal move");
    return { ok: false, problems };
  }
  if (p.goal === "mate") {
    const first = mateFirstMoves(p.fen, p.solverMoves);
    if (!first.includes(p.solution[0]!)) problems.push(`${p.solution[0]} does not force mate in ${p.solverMoves}`);
    if (first.length !== 1) problems.push(`mate in ${p.solverMoves} has ${first.length} first moves (${first.join(", ")}): the solution must be unique`);
    if (p.solverMoves > 1 && mateFirstMoves(p.fen, p.solverMoves - 1).length > 0) problems.push(`it is really a faster mate (in ${p.solverMoves - 1})`);
    // the line's replies must be the defence that lasts longest
    if (p.solverMoves > 1) {
      const after = new Chess(p.fen);
      after.move(p.solution[0]!);
      const longest = legal(after).filter((r) => {
        after.move(r);
        // a reply is "slowest" when mate cannot come one move sooner than the main line needs (always true for a mate in 2)
        const slower = !after.isCheckmate() && (p.solverMoves - 2 <= 0 ? true : !canMate(after, p.solverMoves - 2));
        after.undo();
        return slower;
      });
      if (longest.length && !longest.some((r) => r.san === p.solution[1])) problems.push("the reply in the line is not the best defence");
    }
  } else {
    if (p.solverMoves !== 1) problems.push('"win" puzzles have one solver move');
    const scores = scoreFirstMoves(p.fen, 4);
    const base = (mover === "w" ? 1 : -1) * material(new Chess(p.fen));
    const best = Math.max(...scores.map((s) => s.score));
    const mine = scores.find((s) => s.san === p.solution[0]);
    if (!mine) problems.push("the first move is not legal");
    else {
      if (mine.score !== best) problems.push(`${p.solution[0]} is not the best first move (best score ${best}, this one ${mine.score})`);
      if (mine.score - base < 2) problems.push(`${p.solution[0]} wins only ${mine.score - base} of material by force`);
      const others = scores.filter((s) => s.san !== p.solution[0]);
      const second = others.length ? Math.max(...others.map((s) => s.score)) : -Infinity;
      if (second > mine.score - 2) problems.push(`another first move nearly as good exists (${others.find((s) => s.score === second)?.san}); the solution must stand out`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** Text for hints that can be made from the line itself. */
export function autoHints(p: ChessPuzzle, step: number): { piece: string; san: string } {
  const chess = positionAt(p, step);
  const mv = chess.move(p.solution[step]!);
  return { piece: pieceName(mv.piece), san: mv.san };
}
