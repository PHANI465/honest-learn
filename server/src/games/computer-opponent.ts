// Playing chess against the computer (task T5d). Pure game logic, no screens: app/src/app/learn/[childId]/games/computer.tsx uses it.
//
// Where it runs: ON THE DEVICE, in the app, like the memory games (T5c). There are no secret answers to protect, a search is real
// CPU work (a server answering every move of every child would be a load and a denial-of-service risk), and standalone mode has
// no server. The app imports this file by relative path, as it does the API code (docs/STANDALONE.md); a test here runs it.
//
// The engine is js-chess-engine (MIT licence, no dependencies, plain JavaScript, about 400 KB), chosen by the owner on
// 15 Nov 2026 over Stockfish (GPL-3.0, WebAssembly, which Hermes in the phone app probably cannot run) and over writing one.
// chess.js stays the only judge of the rules: the engine only SUGGESTS a move, and a suggestion that is not a legal move in
// chess.js is thrown away for a random legal move, so the game can never be corrupted by an engine mistake.
import { Chess, type Move } from "chess.js";
import { Game } from "js-chess-engine";

export interface Level {
  /** js-chess-engine's AI level (1 to 5; 5 is left out: it reserves 20 to 40 MB and searches 12 plies, too much for a phone). */
  id: 1 | 2 | 3 | 4;
  name: string;
  blurb: string;
}

export const LEVELS: readonly Level[] = [
  { id: 1, name: "Beginner", blurb: "Plays fast and often misses things" },
  { id: 2, name: "Easy", blurb: "Looks a few moves ahead" },
  { id: 3, name: "Medium", blurb: "A fair game for a club player" },
  { id: 4, name: "Hard", blurb: "Looks well ahead and rarely blunders" },
];

/** The levels a child of this age group can choose (the easiest is always first and the default). */
export const levelsForBand = (band: string): Level[] => LEVELS.filter((l) => l.id <= (band === "b4" || band === "b5" ? 4 : 3));

export type Side = "w" | "b";

export interface Reply {
  from: string;
  to: string;
  /** Always a queen when a pawn reaches the last rank (the board has no promotion menu, as in the puzzles). */
  promotion?: "q";
  /** "fallback": the engine failed or suggested an illegal move, so a random legal move was played instead. */
  source: "engine" | "fallback";
}

/** What asks the engine for a move: a FEN and a level in, a from and to square out (or anything else if it fails). */
export type EngineFn = (fen: string, level: number) => unknown;

/** js-chess-engine, asked for a move without playing it. Squares come back upper case ("E2"). */
export const defaultEngine: EngineFn = (fen, level) => {
  const result = new Game(fen).ai({ level, play: false });
  const [from, to] = Object.entries(result.move)[0] ?? [];
  return from && to ? { from: from.toLowerCase(), to: to.toLowerCase() } : null;
};

/**
 * The computer's reply in this position, or null if the game is over. Never throws and never returns an illegal move.
 * `random` (0 to 1) only matters for the fallback; tests pass a seeded one.
 */
export function chooseReply(chess: Chess, level: number, opts: { engine?: EngineFn; random?: () => number } = {}): Reply | null {
  if (chess.isGameOver()) return null;
  const legal = chess.moves({ verbose: true });
  if (!legal.length) return null;
  const toReply = (m: Move, source: Reply["source"]): Reply => ({ from: m.from, to: m.to, ...(m.promotion ? { promotion: "q" as const } : {}), source });

  try {
    const suggestion = (opts.engine ?? defaultEngine)(chess.fen(), level) as { from?: unknown; to?: unknown } | null;
    if (suggestion && typeof suggestion.from === "string" && typeof suggestion.to === "string") {
      // a pawn promotion is several legal moves (q, r, b, n) with the same squares: take the queen
      const match = legal.filter((m) => m.from === suggestion.from && m.to === suggestion.to);
      const pick = match.find((m) => !m.promotion || m.promotion === "q");
      if (pick) return toReply(pick, "engine");
    }
  } catch {
    /* the engine failed: play a random legal move below */
  }
  const random = opts.random ?? Math.random;
  const queens = legal.filter((m) => !m.promotion || m.promotion === "q");
  return toReply(queens[Math.min(queens.length - 1, Math.floor(random() * queens.length))]!, "fallback");
}

export type Outcome =
  | { over: false }
  | { over: true; kind: "checkmate"; winner: Side }
  | { over: true; kind: "stalemate" | "draw"; winner: null; reason: "stalemate" | "insufficient material" | "threefold repetition" | "fifty moves" };

/** Whether the game has ended and how. A checkmate is won by the side that did NOT have to move. */
export function gameOutcome(chess: Chess): Outcome {
  if (chess.isCheckmate()) return { over: true, kind: "checkmate", winner: chess.turn() === "w" ? "b" : "w" };
  if (chess.isStalemate()) return { over: true, kind: "stalemate", winner: null, reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { over: true, kind: "draw", winner: null, reason: "insufficient material" };
  if (chess.isThreefoldRepetition()) return { over: true, kind: "draw", winner: null, reason: "threefold repetition" };
  if (chess.isDrawByFiftyMoves()) return { over: true, kind: "draw", winner: null, reason: "fifty moves" };
  return { over: false };
}

/** Kind, honest words for the end of a game, from the point of view of the child's colour. No scores, no ranks. */
export function outcomeMessage(outcome: Outcome, mine: Side): { title: string; body: string } {
  if (!outcome.over) return { title: "", body: "" };
  if (outcome.kind === "checkmate") {
    return outcome.winner === mine
      ? { title: "Checkmate! You win 🎉", body: "The computer's king has nowhere to go. Well played." }
      : { title: "Checkmate. The computer wins this time", body: "Your king was trapped. Everyone loses games while they learn. Want to try again, or try an easier level?" };
  }
  const why: Record<string, string> = {
    stalemate: "Stalemate: the side to move has no legal move but is not in check. It counts as a draw.",
    "insufficient material": "Neither side has enough pieces left to checkmate.",
    "threefold repetition": "The same position came up three times.",
    "fifty moves": "Fifty moves went by with no capture and no pawn move.",
  };
  return { title: "A draw", body: why[outcome.reason]! };
}

const PIECE_NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" } as const;

/** A move in words, for the screen reader and for children who do not read chess notation: "Knight from g8 to f6, capturing a pawn". */
export function describeMove(move: Move): string {
  const name = PIECE_NAME[move.piece];
  let text: string;
  if (move.flags.includes("k")) text = "Castles on the king's side";
  else if (move.flags.includes("q")) text = "Castles on the queen's side";
  else text = `${name[0]!.toUpperCase()}${name.slice(1)} from ${move.from} to ${move.to}`;
  if (move.captured) text += `, capturing a ${PIECE_NAME[move.captured]}`;
  if (move.promotion) text += `, and becomes a ${PIECE_NAME[move.promotion]}`;
  if (move.san.endsWith("#")) text += ". Checkmate";
  else if (move.san.endsWith("+")) text += ". Check";
  return text;
}

/**
 * Takes back the child's last move and everything after it (the computer's reply), so it is the child's turn again.
 * Returns false when the child has made no move yet.
 */
export function takeBack(chess: Chess, mine: Side): boolean {
  const history = chess.history({ verbose: true });
  let lastMine = -1;
  history.forEach((m, i) => {
    if (m.color === mine) lastMine = i;
  });
  if (lastMine < 0) return false;
  for (let n = history.length - lastMine; n > 0; n--) chess.undo();
  return true;
}

// ---------------------------------------------------------------- saving a game in progress
// A game is just its list of moves, so saving is writing that list down (app/src/lib/games/saved-chess.ts keeps it on the device, never
// on a server) and resuming is playing it back through chess.js. What is read back is untrusted (storage can be edited or damaged),
// so every move is replayed and checked: one illegal move, or anything unexpected, and the whole saved game is ignored.

/** A move as kept in a game: the squares, and a queen when a pawn reached the last rank. */
export interface Entry {
  from: string;
  to: string;
  promotion?: "q";
}
export interface SavedGame {
  level: number;
  /** The child's colour. */
  mine: Side;
  moves: Entry[];
}
/** More than any real game against a beginner (a very long game is about 200 moves, 400 plies). */
export const MAX_SAVED_MOVES = 600;
const SQUARE = /^[a-h][1-8]$/;

/** The game after these moves, or null if any of them is not legal (or there are too many). */
export function replayMoves(moves: readonly Entry[]): Chess | null {
  if (moves.length > MAX_SAVED_MOVES) return null;
  const chess = new Chess();
  try {
    for (const m of moves) chess.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
  } catch {
    return null;
  }
  return chess;
}

export const entriesOf = (chess: Chess): Entry[] => chess.history({ verbose: true }).map((m) => ({ from: m.from, to: m.to, ...(m.promotion ? { promotion: "q" as const } : {}) }));

/**
 * A saved game as read back from storage (text or already parsed), or null when it cannot be used: not a game, a level this age
 * group cannot choose, an illegal move, or a game that is already over (a finished game is not resumed).
 */
export function readSavedGame(raw: unknown, allowedLevels: readonly number[] = LEVELS.map((l) => l.id)): SavedGame | null {
  try {
    const x = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<SavedGame> | null;
    if (!x || typeof x !== "object" || !Number.isInteger(x.level) || !allowedLevels.includes(x.level!) || (x.mine !== "w" && x.mine !== "b") || !Array.isArray(x.moves)) return null;
    if (x.moves.length === 0 || x.moves.length > MAX_SAVED_MOVES) return null;
    const moves: Entry[] = [];
    for (const m of x.moves as unknown[]) {
      const e = m as Partial<Entry> | null;
      if (!e || typeof e !== "object" || typeof e.from !== "string" || typeof e.to !== "string" || !SQUARE.test(e.from) || !SQUARE.test(e.to)) return null;
      if (e.promotion !== undefined && e.promotion !== "q") return null;
      moves.push({ from: e.from, to: e.to, ...(e.promotion ? { promotion: "q" as const } : {}) });
    }
    const chess = replayMoves(moves);
    if (!chess || gameOutcome(chess).over) return null;
    return { level: x.level!, mine: x.mine, moves };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- hints that point at a piece
// A hint never says where to move. Stage 1 is about safety: a king in check, or a piece that could be captured. Stage 2 points at ONE
// piece worth thinking about (the piece the engine would move) and says nothing about where it goes or what it takes. There is no
// penalty for asking and nothing is recorded: no score, no count.

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 } as const;
const NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" } as const;
const SQUARES = "abcdefgh".split("").flatMap((f) => "12345678".split("").map((r) => `${f}${r}`));

export interface PieceHint {
  stage: 1 | 2;
  /** The square to mark on the board, or null when there is nothing to point at. */
  square: string | null;
  text: string;
}

/** The side's most valuable piece that could be captured for nothing, or captured by a cheaper piece. Kings are handled by "check". */
function pieceInDanger(chess: Chess, side: Side): { square: string; type: keyof typeof NAMES } | null {
  const foe = side === "w" ? "b" : "w";
  let worst: { square: string; type: keyof typeof NAMES; value: number } | null = null;
  for (const square of SQUARES) {
    const piece = chess.get(square as never);
    if (!piece || piece.color !== side || piece.type === "k") continue;
    const attackers = chess.attackers(square as never, foe);
    if (!attackers.length) continue;
    const cheapest = Math.min(...attackers.map((a) => VALUE[chess.get(a as never)!.type]));
    const defended = chess.attackers(square as never, side).length > 0;
    if (defended && cheapest >= VALUE[piece.type]) continue; // a fair trade at worst
    const value = VALUE[piece.type];
    if (!worst || value > worst.value) worst = { square, type: piece.type, value };
  }
  return worst && { square: worst.square, type: worst.type };
}

/**
 * A hint for the side to move (the child). Stage 1 looks for danger; stage 2 points at a piece to think about. Never throws, never
 * names a destination, never changes the game.
 */
export function pieceHint(chess: Chess, side: Side, stage: 1 | 2, opts: { engine?: EngineFn; level?: number } = {}): PieceHint {
  if (chess.isGameOver() || chess.turn() !== side) return { stage, square: null, text: "Hints are for your move." };
  if (stage === 1) {
    if (chess.inCheck()) {
      const king = SQUARES.find((s) => {
        const p = chess.get(s as never);
        return p?.type === "k" && p.color === side;
      })!;
      return { stage, square: king, text: "Your king is in check! You can move it, block the attack, or capture the piece giving check." };
    }
    const danger = pieceInDanger(chess, side);
    if (danger) return { stage, square: danger.square, text: `Your ${NAMES[danger.type]} on ${danger.square} could be captured. Can you keep it safe?` };
    return { stage, square: null, text: "None of your pieces looks in danger. Press Hint again to think about what to do next." };
  }
  const idea = chooseReply(chess, opts.level ?? 3, { engine: opts.engine });
  if (!idea || idea.source !== "engine") return { stage, square: null, text: "No clear idea this time. Look for a piece you can capture safely, or one that could attack something." };
  const piece = chess.get(idea.from as never)!;
  return { stage, square: idea.from, text: `Think about your ${NAMES[piece.type]} on ${idea.from}. What could it do?` };
}
