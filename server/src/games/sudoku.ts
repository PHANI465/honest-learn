// Sudoku: puzzle generation, a solver that counts solutions, and the step finder behind the hint ladder.
//
// Everything is deterministic from a seed (child id + size + level + puzzle number), so the same child gets the same puzzle
// every time and nothing about a puzzle needs storing. Every puzzle has exactly ONE solution: cells are only removed while a
// solver confirms the solution stays unique.
//
// Grids are flat arrays of size*size numbers, row by row. 0 means empty.
import { seeded, seededShuffle } from "../shuffle.ts";
import type { BandId } from "../security.ts";

export interface Spec {
  size: number;
  /** Height and width of one box (2 x 2 for 4x4, 2 x 3 for 6x6, 3 x 3 for 9x9). */
  boxRows: number;
  boxCols: number;
}

export const SPEC_4: Spec = { size: 4, boxRows: 2, boxCols: 2 };
export const SPEC_6: Spec = { size: 6, boxRows: 2, boxCols: 3 };
export const SPEC_9: Spec = { size: 9, boxRows: 3, boxCols: 3 };

/** Grid size by age group: 4x4 for ages 3 to 8, 6x6 for 9 to 11, 9x9 for 12 and up. */
export function specFor(band: BandId): Spec {
  return band === "b1" || band === "b2" ? SPEC_4 : band === "b3" ? SPEC_6 : SPEC_9;
}

/** Clues left in the puzzle for difficulty levels 1, 2, 3. The generator stops removing cells at this number (or earlier if the solution would stop being unique). */
export const CLUES: Record<number, [number, number, number]> = { 4: [9, 7, 6], 6: [22, 18, 15], 9: [38, 32, 27] };
export const LEVELS = [1, 2, 3] as const;

// ---------------------------------------------------------------- geometry
interface Geometry {
  units: number[][]; // every row, column and box as a list of cell indices
  rows: number[][];
  cols: number[][];
  boxes: number[][];
  peers: number[][]; // for each cell, the other cells that share a row, column or box
  boxOf: number[];
}
const cache = new Map<string, Geometry>();

export function geometry(spec: Spec): Geometry {
  const key = `${spec.size}:${spec.boxRows}x${spec.boxCols}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { size, boxRows, boxCols } = spec;
  const rows = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => r * size + c));
  const cols = Array.from({ length: size }, (_, c) => Array.from({ length: size }, (_, r) => r * size + c));
  const boxCount = size;
  const boxesAcross = size / boxCols;
  const boxes: number[][] = Array.from({ length: boxCount }, () => []);
  const boxOf: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const b = Math.floor(r / boxRows) * boxesAcross + Math.floor(c / boxCols);
      boxes[b]!.push(r * size + c);
      boxOf[r * size + c] = b;
    }
  }
  const peers = Array.from({ length: size * size }, (_, i) => {
    const r = Math.floor(i / size);
    const c = i % size;
    return [...new Set([...rows[r]!, ...cols[c]!, ...boxes[boxOf[i]!]!])].filter((j) => j !== i);
  });
  const g = { units: [...rows, ...cols, ...boxes], rows, cols, boxes, peers, boxOf };
  cache.set(key, g);
  return g;
}

const bit = (v: number) => 1 << v;
const popcount = (m: number) => {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
};
const valuesOf = (m: number, size: number) => {
  const out: number[] = [];
  for (let v = 1; v <= size; v++) if (m & bit(v)) out.push(v);
  return out;
};

/** Bitmask of the numbers that can still go in cell i (bit v set = v possible). */
export function candidateMask(grid: readonly number[], spec: Spec, i: number): number {
  const { peers } = geometry(spec);
  let used = 0;
  for (const p of peers[i]!) if (grid[p]) used |= bit(grid[p]!);
  let all = 0;
  for (let v = 1; v <= spec.size; v++) all |= bit(v);
  return all & ~used;
}

// ---------------------------------------------------------------- solving
interface SolveResult {
  count: number;
  first: number[] | null;
}

/** Counts solutions up to `limit` (2 is enough to tell "unique" from "not unique"). Picks the emptiest-choice cell first. */
export function countSolutions(start: readonly number[], spec: Spec, limit = 2, rand?: () => number): SolveResult {
  const grid = [...start];
  let count = 0;
  let first: number[] | null = null;
  const search = (): void => {
    if (count >= limit) return;
    let best = -1;
    let bestMask = 0;
    let bestN = 99;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i]) continue;
      const m = candidateMask(grid, spec, i);
      const n = popcount(m);
      if (n < bestN) {
        best = i;
        bestMask = m;
        bestN = n;
        if (n <= 1) break;
      }
    }
    if (best === -1) {
      count++;
      if (!first) first = [...grid];
      return;
    }
    if (bestN === 0) return;
    const vals = valuesOf(bestMask, spec.size);
    const order = rand ? seededOrder(vals, rand) : vals;
    for (const v of order) {
      grid[best] = v;
      search();
      if (count >= limit) break;
    }
    grid[best] = 0;
  };
  search();
  return { count, first };
}

function seededOrder<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A complete valid grid, different for each seed. */
export function randomSolution(spec: Spec, seed: string): number[] {
  const rand = seeded(seed + ":fill");
  const r = countSolutions(new Array(spec.size * spec.size).fill(0), spec, 1, rand);
  return r.first!;
}

export interface Puzzle {
  spec: Spec;
  givens: number[];
  solution: number[];
}

/** The puzzle for a seed and a difficulty level (1 easiest). Always exactly one solution. */
export function generate(spec: Spec, level: 1 | 2 | 3, seed: string): Puzzle {
  const solution = randomSolution(spec, seed);
  const target = CLUES[spec.size]![level - 1]!;
  const givens = [...solution];
  let left = givens.length;
  for (const i of seededShuffle(seed + ":remove", givens.map((_, k) => k))) {
    if (left <= target) break;
    const kept = givens[i]!;
    givens[i] = 0;
    if (countSolutions(givens, spec, 2).count === 1) left--;
    else givens[i] = kept;
  }
  return { spec, givens, solution };
}

// ---------------------------------------------------------------- hints
export interface Unit {
  type: "row" | "column" | "box";
  /** 0-based index of the row, column or box. */
  index: number;
}
export type Step =
  | { kind: "naked"; cell: number; value: number }
  | { kind: "hidden"; cell: number; value: number; unit: Unit }
  | { kind: "other"; cell: number; value: number };

/**
 * The simplest next move on the board as it stands:
 *  - naked single: a cell where only one number fits;
 *  - hidden single: a number that fits in only one place in a row, column or box;
 *  - otherwise (harder puzzles): the empty cell with the fewest options, with its value taken from the solution.
 * The board must not contain wrong numbers (the caller checks that first).
 */
export function nextStep(grid: readonly number[], spec: Spec, solution: readonly number[]): Step | null {
  const geo = geometry(spec);
  const masks = grid.map((v, i) => (v ? 0 : candidateMask(grid, spec, i)));
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] && popcount(masks[i]!) === 1) return { kind: "naked", cell: i, value: valuesOf(masks[i]!, spec.size)[0]! };
  }
  const unitTypes: Unit["type"][] = [];
  const groups: number[][] = [];
  for (const u of geo.rows) { unitTypes.push("row"); groups.push(u); }
  for (const u of geo.cols) { unitTypes.push("column"); groups.push(u); }
  for (const u of geo.boxes) { unitTypes.push("box"); groups.push(u); }
  const indexInType = (n: number) => n % spec.size;
  for (let g = 0; g < groups.length; g++) {
    const cells = groups[g]!;
    for (let v = 1; v <= spec.size; v++) {
      if (cells.some((c) => grid[c] === v)) continue;
      const spots = cells.filter((c) => !grid[c] && (masks[c]! & bit(v)));
      if (spots.length === 1) return { kind: "hidden", cell: spots[0]!, value: v, unit: { type: unitTypes[g]!, index: indexInType(g) } };
    }
  }
  let best = -1;
  let bestN = 99;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]) continue;
    const n = popcount(masks[i]!);
    if (n < bestN) {
      best = i;
      bestN = n;
    }
  }
  return best === -1 ? null : { kind: "other", cell: best, value: solution[best]! };
}

const BOX_ROW_NAMES: Record<number, string[]> = { 2: ["top", "bottom"], 3: ["top", "middle", "bottom"] };
const BOX_COL_NAMES: Record<number, string[]> = { 2: ["left", "right"], 3: ["left", "middle", "right"] };

/** "row 3", "column 5" or "the top-left box". Rows and columns are counted from 1, from the top and from the left. */
export function describeUnit(spec: Spec, u: Unit): string {
  if (u.type === "row") return `row ${u.index + 1}`;
  if (u.type === "column") return `column ${u.index + 1}`;
  const across = spec.size / spec.boxCols;
  const down = spec.size / spec.boxRows;
  const br = Math.floor(u.index / across);
  const bc = u.index % across;
  const rowName = BOX_ROW_NAMES[down]?.[br] ?? `box row ${br + 1}`;
  const colName = BOX_COL_NAMES[across]?.[bc] ?? `box column ${bc + 1}`;
  return `the ${rowName}-${colName} box`;
}

export const cellName = (spec: Spec, i: number) => `row ${Math.floor(i / spec.size) + 1}, column ${(i % spec.size) + 1}`;

/** The three hints for a step: which technique, where to look, then the number with the reason. */
export function hintTexts(spec: Spec, step: Step): [string, string, string] {
  const where = cellName(spec, step.cell);
  const row = Math.floor(step.cell / spec.size);
  if (step.kind === "naked") {
    return [
      "Look for an empty square where only one number can fit. Check which numbers are already in its row, its column and its box.",
      `Look at row ${row + 1}. One of its empty squares has only one number left that fits.`,
      `${capital(where)} must be ${step.value}. Every other number already appears in its row, its column or its box.`,
    ];
  }
  if (step.kind === "hidden") {
    const u = describeUnit(spec, step.unit);
    return [
      "Pick a number and look for the only place it can go in a row, a column or a box. A number with just one place left must go there.",
      `Look at ${u}. One number has only one square left where it can go.`,
      `${step.value} can only go in ${where}, because every other empty square in ${u} cannot take ${step.value}. So that square is ${step.value}.`,
    ];
  }
  return [
    "There is no quick move here. Choose an empty square with only a few possible numbers and write them in small notes, then cross out the ones that clash.",
    `Look at ${cellName(spec, step.cell)}. Write the numbers that could go there in small notes.`,
    `${capital(where)} is ${step.value}. The other numbers lead to a clash later, which is how you can tell.`,
  ];
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** When the board already has a wrong number, the hints send the child to fix it first, without saying what it should be. */
export function mistakeTexts(spec: Spec, cell: number): [string, string, string] {
  return [
    "Something on the board is not right. Use Check to see which squares need another look before you go on.",
    `Look at ${cellName(spec, cell)}. A number there does not fit.`,
    `The number in ${cellName(spec, cell)} is not right. Clear it and think again about which number can go there.`,
  ];
}
