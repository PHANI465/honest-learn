// Sliding-tile puzzle (3x3 "8-puzzle" and 4x4 "15-puzzle"). Pure logic. Puzzles are made by sliding tiles from the solved
// board, so every puzzle can be solved. 0 is the empty square.

export type Band = "b1" | "b2" | "b3" | "b4" | "b5";

/** Side length for each age group (not offered to ages 3 to 5). */
export const SLIDE_SIZE: Record<Band, number> = { b1: 3, b2: 3, b3: 3, b4: 4, b5: 4 };

export function solvedBoard(n: number): number[] {
  return Array.from({ length: n * n }, (_, i) => (i === n * n - 1 ? 0 : i + 1));
}

export function isSolved(board: readonly number[], n: number): boolean {
  const goal = solvedBoard(n);
  return board.every((v, i) => v === goal[i]);
}

/** Squares next to `index` (up, down, left, right). */
export function neighbours(index: number, n: number): number[] {
  const r = Math.floor(index / n);
  const c = index % n;
  const out: number[] = [];
  if (r > 0) out.push(index - n);
  if (r < n - 1) out.push(index + n);
  if (c > 0) out.push(index - 1);
  if (c < n - 1) out.push(index + 1);
  return out;
}

/** Slides the tile at `index` into the empty square if it is next to it. Returns a new board, or null if the tile cannot move. */
export function slideTile(board: readonly number[], n: number, index: number): number[] | null {
  const empty = board.indexOf(0);
  if (!neighbours(empty, n).includes(index)) return null;
  const next = [...board];
  next[empty] = board[index]!;
  next[index] = 0;
  return next;
}

/** A shuffled board reached by `moves` random legal slides from the solved board (never a solved board). */
export function shuffleBoard(n: number, moves: number, rand: () => number = Math.random): number[] {
  for (let attempt = 0; attempt < 20; attempt++) {
    let board = solvedBoard(n);
    let last = -1;
    for (let i = 0; i < moves; i++) {
      const empty = board.indexOf(0);
      const options = neighbours(empty, n).filter((x) => x !== last);
      const pick = options[Math.floor(rand() * options.length)]!;
      last = empty;
      board = slideTile(board, n, pick)!;
    }
    if (!isSolved(board, n)) return board;
  }
  throw new Error("could not shuffle");
}

/** True when the board can be solved (the classic parity rule). */
export function isSolvable(board: readonly number[], n: number): boolean {
  const tiles = board.filter((v) => v !== 0);
  let inversions = 0;
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (tiles[i]! > tiles[j]!) inversions++;
  if (n % 2 === 1) return inversions % 2 === 0;
  const rowFromBottom = n - Math.floor(board.indexOf(0) / n);
  return (inversions + rowFromBottom) % 2 === 1;
}
