// Nonograms (picture logic puzzles) for teens: the numbers beside each row and above each column tell how long the runs of filled
// squares are. Pure logic. Every generated puzzle has exactly ONE solution, checked with a solver, so it can always be solved by
// reasoning and never needs guessing between two answers.

export type Band = "b1" | "b2" | "b3" | "b4" | "b5";

/** Grid size for each age group (not offered below age 12). */
export const NONO_SIZE: Record<Band, number | null> = { b1: null, b2: null, b3: null, b4: 5, b5: 7 };

/** The run lengths of filled squares in a line, e.g. [1, 1, 0, 1, 1, 1] gives [2, 3]. An empty line gives []. */
export function cluesOf(line: readonly number[]): number[] {
  const runs: number[] = [];
  let cur = 0;
  for (const v of line) {
    if (v) cur++;
    else {
      if (cur) runs.push(cur);
      cur = 0;
    }
  }
  if (cur) runs.push(cur);
  return runs;
}

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Whether the first cells of a column could still be completed to match its clue in `n` cells. */
function prefixOk(prefix: readonly number[], clue: readonly number[], n: number): boolean {
  const runs: number[] = [];
  let cur = 0;
  for (const v of prefix) {
    if (v) cur++;
    else {
      if (cur) runs.push(cur);
      cur = 0;
    }
  }
  const open = cur; // a run that touches the end of the prefix and may continue
  const k = runs.length;
  if (k > clue.length) return false;
  for (let i = 0; i < k; i++) if (runs[i] !== clue[i]) return false;
  let need: number;
  if (open) {
    if (k >= clue.length || open > clue[k]!) return false;
    need = clue[k]! - open;
    for (let i = k + 1; i < clue.length; i++) need += 1 + clue[i]!;
  } else {
    need = 0;
    for (let i = k; i < clue.length; i++) need += (i > k ? 1 : 0) + clue[i]!;
  }
  return need <= n - prefix.length;
}

/** Every way to fill a row of `n` squares so its runs match `clue`. */
function rowPatterns(clue: readonly number[], n: number): number[][] {
  const out: number[][] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const line = Array.from({ length: n }, (_, i) => (mask >> i) & 1);
    if (same(cluesOf(line), clue)) out.push(line);
  }
  return out;
}

/** Counts the grids that fit the clues, stopping at `limit` (2 is enough to tell "exactly one" from "several"). */
export function countSolutions(rows: readonly (readonly number[])[], cols: readonly (readonly number[])[], limit = 2): number {
  const n = rows.length;
  const patterns = rows.map((c) => rowPatterns(c, n));
  const prefixes: number[][] = Array.from({ length: n }, () => []);
  let count = 0;
  const search = (r: number): void => {
    if (count >= limit) return;
    if (r === n) {
      if (prefixes.every((p, c) => same(cluesOf(p), cols[c]!))) count++;
      return;
    }
    for (const pattern of patterns[r]!) {
      for (let c = 0; c < n; c++) prefixes[c]!.push(pattern[c]!);
      if (prefixes.every((p, c) => prefixOk(p, cols[c]!, n))) search(r + 1);
      for (let c = 0; c < n; c++) prefixes[c]!.pop();
      if (count >= limit) return;
    }
  };
  search(0);
  return count;
}

export interface Nonogram {
  size: number;
  /** The picture, row by row: 1 = filled. */
  solution: number[];
  rows: number[][];
  cols: number[][];
}

export function cluesFor(solution: readonly number[], n: number): { rows: number[][]; cols: number[][] } {
  const rows = Array.from({ length: n }, (_, r) => cluesOf(solution.slice(r * n, r * n + n)));
  const cols = Array.from({ length: n }, (_, c) => cluesOf(Array.from({ length: n }, (_, r) => solution[r * n + c]!)));
  return { rows, cols };
}

/** A random puzzle with exactly one solution and no empty row or column. */
export function generate(n: number, rand: () => number = Math.random): Nonogram {
  for (let attempt = 0; attempt < 500; attempt++) {
    const solution = Array.from({ length: n * n }, () => (rand() < 0.55 ? 1 : 0));
    const { rows, cols } = cluesFor(solution, n);
    if (rows.some((c) => c.length === 0) || cols.some((c) => c.length === 0)) continue;
    if (countSolutions(rows, cols, 2) === 1) return { size: n, solution, rows, cols };
  }
  throw new Error("could not make a nonogram");
}

/** Which row and column clues the player's filled squares already satisfy (for gentle feedback). */
export function satisfied(filled: readonly number[], n: number, rows: readonly (readonly number[])[], cols: readonly (readonly number[])[]) {
  const got = cluesFor(filled, n);
  return { rows: got.rows.map((c, i) => same(c, rows[i]!)), cols: got.cols.map((c, i) => same(c, cols[i]!)) };
}

/** True when the filled squares match the clues (any grid that fits the clues is the answer, and there is only one). */
export function isComplete(filled: readonly number[], n: number, rows: readonly (readonly number[])[], cols: readonly (readonly number[])[]): boolean {
  const s = satisfied(filled, n, rows, cols);
  return s.rows.every(Boolean) && s.cols.every(Boolean);
}
