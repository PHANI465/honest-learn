// Composes the chess puzzles in content/chess/*.json. Run:  cd server && npm run compose:chess
//
// The positions are NOT taken from real games or from any puzzle database. Each is built from a named pattern (back-rank mate,
// knight fork, skewer ...) with squares chosen by a seeded random generator, then PROVEN sound by games/chess.ts using chess.js:
// legal position, legal main line, the goal really happens, and the child's first move is the only one that achieves it. A
// candidate that fails is thrown away. Running it again with the same seed gives the same files.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess, type Move, type Square } from "chess.js";
import { seeded } from "../shuffle.ts";
import { material, mateFirstMoves, pieceName, scoreFirstMoves, verifyPuzzle, type ChessPuzzle } from "./chess.ts";

const materialOf = (fen: string) => material(new Chess(fen));

const FILES = "abcdefgh";
type Pieces = Record<string, string>; // square -> "wK", "bq" style code: colour letter + piece letter (upper case for readability)

const sqName = (f: number, r: number) => FILES[f]! + (r + 1);
const coords = (s: string) => [FILES.indexOf(s[0]!), Number(s[1]) - 1] as const;
const onBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;

function fenOf(p: Pieces, turn: "w" | "b" = "w"): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const code = p[sqName(f, r)];
      if (!code) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += code[0] === "w" ? code[1]!.toUpperCase() : code[1]!.toLowerCase();
    }
    rows.push(row + (empty || ""));
  }
  return `${rows.join("/")} ${turn} - - 0 1`;
}

/** The position is legal: both kings exist and are not touching, and the side NOT to move is not in check. */
function legalPosition(p: Pieces): boolean {
  const kings = Object.entries(p).filter(([, c]) => c[1] === "K");
  if (kings.length !== 2) return false;
  const [a, b] = kings.map(([s]) => coords(s));
  if (Math.abs(a![0] - b![0]) <= 1 && Math.abs(a![1] - b![1]) <= 1) return false;
  if (Object.entries(p).some(([s, c]) => c[1] === "P" && (s[1] === "1" || s[1] === "8"))) return false;
  try {
    const c = new Chess(fenOf(p, "b"));
    if (c.isCheck()) return false; // black to move would be in check: so white left it that way, illegal for white to move
    const w = new Chess(fenOf(p, "w"));
    return !w.isGameOver();
  } catch {
    return false;
  }
}

export function compose(seed = "honest-learn-chess-1", levels: number[] = [1, 2, 3]) {
  const rand = seeded(seed);
  const int = (n: number) => Math.floor(rand() * n);
  const pick = <T,>(a: readonly T[]): T => a[int(a.length)]!;
  const free = (p: Pieces, s: string) => !p[s];
  const randomSquare = (p: Pieces, rowMin = 0, rowMax = 7) => {
    for (let k = 0; k < 200; k++) {
      const s = sqName(int(8), rowMin + int(rowMax - rowMin + 1));
      if (free(p, s)) return s;
    }
    throw new Error("no free square");
  };

  const out: { level: 1 | 2 | 3; puzzle: ChessPuzzle }[] = [];
  const seen = new Set<string>();
  let counter = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;

  const add = (level: 1 | 2 | 3, theme: string, build: (m: { piece: string; san: string }) => Omit<ChessPuzzle, "id" | "theme" | "fen">, p: Pieces, solution: string[], goal: "mate" | "win", solverMoves: number): boolean => {
    const fen = fenOf(p);
    if (seen.has(fen)) return false;
    const first = new Chess(fen).move(solution[0]!);
    const meta = build({ piece: pieceName(first.piece), san: first.san });
    const puzzle: ChessPuzzle = { id: `l${level}-${String(counter[level] + 1).padStart(2, "0")}`, fen, theme, ...meta, goal, solverMoves, solution };
    const v = verifyPuzzle(puzzle);
    if (!v.ok) return false;
    seen.add(fen);
    counter[level]++;
    console.log(`  level ${level}: ${puzzle.id} ${theme} ${fen} ${solution.join(' ')}`);
    out.push({ level, puzzle });
    return true;
  };

  /** Mate in one: the child's single move gives checkmate. */
  const mateInOne = (theme: string, explain: string, p: Pieces): boolean => {
    if (!legalPosition(p)) return false;
    const firsts = mateFirstMoves(fenOf(p), 1);
    if (firsts.length !== 1) return false;
    return add(1, theme, (m) => ({
      goal: "mate",
      solverMoves: 1,
      solution: [m.san],
      hints: ["Look for a move that gives check and leaves the king nowhere to go.", `Use your ${m.piece}.`, `Play ${m.san}.`],
      explain,
    }), p, [firsts[0]!], "mate", 1);
  };

  // ---------------------------------------------------------------- level 1: checkmate in one
  const wantL1 = { back: 4, queen: 3, rook: 3, smother: 2, ladder: 2 };
  let got = { back: 0, queen: 0, rook: 0, smother: 0, ladder: 0 };
  for (let attempt = 0; levels.includes(1) && attempt < 40000 && Object.entries(wantL1).some(([k, n]) => got[k as keyof typeof got] < n); attempt++) {
    const p: Pieces = {};
    const family = pick(Object.keys(wantL1).filter((k) => got[k as keyof typeof got] < wantL1[k as keyof typeof wantL1])) as keyof typeof got;
    if (family === "back") {
      const kf = pick([0, 1, 6, 7, 5, 2]);
      p[sqName(kf, 7)] = "bK";
      for (const f of [kf - 1, kf, kf + 1]) if (onBoard(f, 6) && rand() < 0.9) p[sqName(f, 6)] = "bP";
      const rf = int(8);
      const rr = int(6);
      p[sqName(rf, rr)] = "wR";
      if (rand() < 0.35) p[sqName(pick([0, 1, 2, 3, 4, 5, 6, 7]), 7)] ??= "bR";
      p[randomSquare(p, 0, 3)] = "wK";
      if (!mateInOne("Back-rank mate", "The king is shut in by its own pawns, so it has no square to run to. The rook gives check along the back rank and nothing can block it or capture it. This is called a back-rank mate.", p)) continue;
    } else if (family === "queen") {
      p[randomSquare(p)] = "bK";
      p[randomSquare(p)] = "wK";
      p[randomSquare(p)] = "wQ";
      if (!mateInOne("Queen and king mate", "The queen gives check, and every square the king could go to is either attacked or blocked. The queen is protected, so the king cannot capture her. That is checkmate.", p)) continue;
    } else if (family === "rook") {
      p[sqName(pick([0, 7]), int(8))] = "bK";
      p[randomSquare(p)] = "wK";
      p[randomSquare(p)] = "wR";
      if (!mateInOne("Rook and king mate", "The rook gives check along the edge of the board while White's king guards the squares in front of the black king. The black king has no way out, so it is checkmate.", p)) continue;
    } else if (family === "smother") {
      const flip = rand() < 0.5;
      const f = (x: number) => (flip ? 7 - x : x);
      p[sqName(f(7), 7)] = "bK";
      p[sqName(f(6), 7)] = "bR";
      p[sqName(f(6), 6)] = "bP";
      p[sqName(f(7), 6)] = "bP";
      p[sqName(pick([f(6), f(4), f(3), f(7)]) as number, pick([4, 5, 5, 7])) as string] ??= "wN";
      p[randomSquare(p, 0, 3)] = "wK";
      if (Object.values(p).filter((c) => c === "wN").length !== 1) continue;
      if (!mateInOne("Smothered mate", "The black king is surrounded by its own rook and pawns, so it cannot move. The knight gives check, and a knight's check cannot be blocked. This is called a smothered mate.", p)) continue;
    } else {
      p[sqName(int(8), 7)] = "bK";
      p[randomSquare(p, 0, 5)] = "wR";
      p[sqName(int(8), 6)] ??= "wR";
      p[randomSquare(p, 0, 2)] = "wK";
      if (!mateInOne("Two-rook mate", "One rook controls the seventh rank so the king cannot step off the back rank. The other rook gives check along the back rank. There is no escape: checkmate.", p)) continue;
    }
    got[family]++;
  }

  // ---------------------------------------------------------------- level 2: forks and skewers (win material)
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]] as const;
  const winPuzzle = (theme: string, explainFor: (info: { piece: string; targets: string }) => string, p: Pieces, needsSkewer = false): boolean => {
    if (!legalPosition(p)) return false;
    const fen = fenOf(p);
    // a quick 3-ply look first (cheap); only a promising position gets the full 4-ply proof in verifyPuzzle
    const scores = scoreFirstMoves(fen, 3);
    const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
    const base = (new Chess(fen).turn() === "w" ? 1 : -1) * materialOf(fen);
    if (best.score - base < 3) return false;
    if (scores.some((x) => x.san !== best.san && x.score > best.score - 2)) return false;
    const chess = new Chess(fen);
    const mv = chess.move(best.san);
    // a tactic puzzle's first move is a quiet move that makes the threat, not a capture
    if (mv.captured) return false;
    if (needsSkewer && !skewersKing(chess, mv.to)) return false;
    // name what the moved piece now attacks (for the explanation)
    const names: string[] = [];
    for (const [s, c] of Object.entries(p)) {
      if (c[0] !== "b" || s === mv.from || s === mv.to) continue;
      const t = chess.get(s as Square);
      // the king is named separately (as the check), so it is not listed again here
      if (t && t.color === "b" && t.type !== "k" && chess.attackers(s as Square, "w").includes(mv.to)) names.push(pieceName(t.type));
    }
    if (names.length === 0 && !chess.isCheck()) return false;
    const targets = (chess.isCheck() ? ["king", ...names] : names).join(" and the ");
    // the line shown once the puzzle is solved: Black's best reply, then White's winning capture
    const line = [best.san];
    const next = new Chess(fen);
    next.move(best.san);
    const replies = scoreFirstMoves(next.fen(), 2);
    if (replies.length) {
      const reply = replies.reduce((a, b) => (b.score > a.score ? b : a));
      line.push(reply.san);
      next.move(reply.san);
      const wins = scoreFirstMoves(next.fen(), 1);
      if (wins.length) line.push(wins.reduce((a, b) => (b.score > a.score ? b : a)).san);
    }
    return add(2, theme, (m) => ({
      goal: "win",
      solverMoves: 1,
      solution: line,
      hints: [theme === "Knight fork" ? "Look for a knight move that attacks two valuable pieces at once." : "Look for a check that lines the king up in front of a more valuable piece.", `Use your ${m.piece}.`, `Play ${m.san}.`],
      explain: explainFor({ piece: m.piece, targets }),
    }), p, line, "win", 1);
  };

  /** The piece on `from` gives check along a line and a black rook or queen stands behind the king on that line. */
  const skewersKing = (chess: Chess, from: string): boolean => {
    const king = chess.board().flat().find((x) => x && x.type === "k" && x.color === "b");
    if (!king || !chess.isCheck()) return false;
    const [ff, fr] = coords(from);
    const [kf, kr] = coords(king.square);
    const df = Math.sign(kf - ff);
    const dr = Math.sign(kr - fr);
    if ((kf - ff !== 0 && kr - fr !== 0 && Math.abs(kf - ff) !== Math.abs(kr - fr))) return false;
    for (let f = kf + df, r = kr + dr; onBoard(f, r); f += df, r += dr) {
      const t = chess.get(sqName(f, r) as Square);
      if (t) return t.color === "b" && (t.type === "q" || t.type === "r");
    }
    return false;
  };
  const wantL2 = { fork: 5, skewer: 4 };
  const got2 = { fork: 0, skewer: 0 };
  for (let attempt = 0; levels.includes(2) && attempt < 30000 && (got2.fork < wantL2.fork || got2.skewer < wantL2.skewer); attempt++) {
    const p: Pieces = {};
    if (got2.fork < wantL2.fork && (got2.skewer >= wantL2.skewer || rand() < 0.55)) {
      const F: [number, number] = [1 + int(6), 1 + int(6)];
      const attacked = KNIGHT.map(([df, dr]) => [F[0] + df, F[1] + dr] as const).filter(([f, r]) => onBoard(f, r));
      if (attacked.length < 2) continue;
      const a = pick(attacked);
      const b = pick(attacked.filter((x) => x !== a));
      p[sqName(...a)] = rand() < 0.6 ? "bK" : "bQ";
      p[sqName(...b)] = p[sqName(...a)] === "bK" ? pick(["bQ", "bR", "bR"]) : "bK";
      if (!Object.values(p).includes("bK")) continue;
      const from = pick(KNIGHT.map(([df, dr]) => [F[0] + df, F[1] + dr] as const).filter(([f, r]) => onBoard(f, r) && !p[sqName(f, r)]));
      if (!from) continue;
      p[sqName(...from)] = "wN";
      p[randomSquare(p)] = "wK";
      if (rand() < 0.5) p[randomSquare(p, 1, 6)] = "bP";
      if (winPuzzle("Knight fork", ({ targets }) => `A knight move that attacks two pieces at once is called a fork. This one attacks the ${targets}. Black can only deal with one of them, so White wins the other.`, p)) got2.fork++;
    } else if (got2.skewer < wantL2.skewer) {
      const diagonal = rand() < 0.5;
      const dirs = diagonal ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = pick(dirs);
      const start: [number, number] = [int(8), int(8)];
      // the king stands two or three squares from the attacker's landing square, so it cannot simply capture the attacker
      const away = 2 + int(2);
      const k: [number, number] = [start[0] + d[0]! * away, start[1] + d[1]! * away];
      const gap = 1 + int(2);
      const behind: [number, number] = [k[0] + d[0]! * gap, k[1] + d[1]! * gap];
      if (![start, k, behind].every(([f, r]) => onBoard(f, r))) continue;
      if (p[sqName(...start)]) continue;
      p[sqName(...k)] = "bK";
      p[sqName(...behind)] = rand() < 0.7 ? "bQ" : "bR";
      // the attacker comes from a square on a different line, one move away from the start square
      const attackerType = diagonal ? pick(["wB", "wQ"]) : pick(["wR", "wQ"]);
      const lines = attackerType === "wB" ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : attackerType === "wR" ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [...dirs, [1, 0], [0, 1]];
      const l = pick(lines);
      const dist = 1 + int(5);
      const from: [number, number] = [start[0] + l[0]! * dist, start[1] + l[1]! * dist];
      if (!onBoard(...from) || (l[0] === d[0] && l[1] === d[1]) || (l[0] === -d[0]! && l[1] === -d[1]!)) continue;
      if (p[sqName(...from)]) continue;
      p[sqName(...from)] = attackerType;
      p[randomSquare(p)] = "wK";
      if (winPuzzle("Skewer", ({ piece }) => `The ${piece} gives check along a line, and the black king stands in front of a more valuable piece. The king must move out of the way, and then the ${piece} captures what was behind it. This is called a skewer.`, p, true)) got2.skewer++;
    }
  }

  // ---------------------------------------------------------------- level 3: checkmate in two
  const wantL3 = { queen: 4, rooks: 3, rookqueen: 2 };
  const got3 = { queen: 0, rooks: 0, rookqueen: 0 };
  for (let attempt = 0; levels.includes(3) && attempt < 30000 && Object.entries(wantL3).some(([k, n]) => got3[k as keyof typeof got3] < n); attempt++) {
    const family = pick(Object.keys(wantL3).filter((k) => got3[k as keyof typeof got3] < wantL3[k as keyof typeof wantL3])) as keyof typeof got3;
    const p: Pieces = {};
    p[rand() < 0.5 ? sqName(pick([0, 7]), int(8)) : sqName(int(8), pick([0, 7]))] = "bK";
    p[randomSquare(p)] = "wK";
    if (family === "queen") p[randomSquare(p)] = "wQ";
    else if (family === "rooks") {
      p[randomSquare(p)] = "wR";
      p[randomSquare(p)] = "wR";
    } else {
      p[randomSquare(p)] = "wR";
      p[randomSquare(p)] = "wQ";
    }
    if (rand() < 0.4) p[randomSquare(p, 1, 6)] = "bP";
    if (!legalPosition(p)) continue;
    const fen = fenOf(p);
    if (mateFirstMoves(fen, 1).length > 0) continue;
    const firsts = mateFirstMoves(fen, 2);
    if (firsts.length !== 1) continue;
    // build the main line: first move, a defence that does not allow a faster mate, then a mating move
    const chess = new Chess(fen);
    chess.move(firsts[0]!);
    const reply = (chess.moves({ verbose: true }) as Move[])[0];
    if (!reply) continue;
    chess.move(reply);
    const mating = (chess.moves({ verbose: true }) as Move[]).filter((m) => {
      chess.move(m);
      const mate = chess.isCheckmate();
      chess.undo();
      return mate;
    });
    if (!mating.length) continue;
    const line = [firsts[0]!, reply.san, mating[0]!.san];
    const theme = family === "queen" ? "Queen and king: mate in two" : family === "rooks" ? "Two rooks: mate in two" : "Rook and queen: mate in two";
    const ok = add(3, theme, (m) => ({
      goal: "mate",
      solverMoves: 2,
      solution: line,
      hints: ["Look for a move that does not give check yet, but takes away the king's squares so that any reply allows mate next move.", `Use your ${m.piece}.`, `Play ${m.san}.`],
      explain: `After ${m.san}, the black king is trapped: whatever Black plays, White has checkmate on the next move. For example ${line[0]} ${line[1]} ${line[2]}.`,
    }), p, line, "mate", 2);
    if (ok) got3[family]++;
  }

  return { puzzles: out, counts: { level1: counter[1], level2: counter[2], level3: counter[3] } };
}

// ---------------------------------------------------------------- write the files
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // usage: npm run compose:chess [-- <seed> [levels, e.g. 1,2]]
  const seed = process.argv[2] ?? "honest-learn-chess-1";
  const levels = (process.argv[3] ?? "1,2,3").split(",").map(Number);
  const started = Date.now();
  const { puzzles, counts } = compose(seed, levels);
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../content/chess");
  mkdirSync(dir, { recursive: true });
  const titles: Record<number, string> = { 1: "Checkmate in one", 2: "Winning tactics: forks and skewers", 3: "Checkmate in two" };
  for (const level of levels as (1 | 2 | 3)[]) {
    const doc = {
      level,
      status: "draft",
      title: titles[level],
      source: "Original positions composed for this project by games/compose-chess.ts and verified with chess.js (not taken from any game or puzzle database).",
      puzzles: puzzles.filter((x) => x.level === level).map((x) => x.puzzle),
    };
    writeFileSync(join(dir, `l${level}.json`), JSON.stringify(doc, null, 2) + "\n");
  }
  console.log(`wrote content/chess/ for levels ${levels.join(", ")}`, counts, `${Math.round((Date.now() - started) / 1000)} s`);
}
