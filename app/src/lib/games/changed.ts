// "Which one changed?": two pictures that differ in exactly one place. Pure logic.

export type Band = "b1" | "b2" | "b3" | "b4" | "b5";

export const CHANGE_SYMBOLS = ["🍎", "🐱", "⭐", "🌙", "🚗", "🌳", "🐟", "🎈", "🔔", "🍌", "🦆", "🎸", "🍄", "🐢", "⚽", "🧩", "🦋", "🚲", "🍪", "🐘", "🏠", "🎩", "🍕", "🐶"];

/** Grid shape (columns, rows) for each age group. */
export const CHANGE_GRID: Record<Band, { cols: number; rows: number }> = {
  b1: { cols: 3, rows: 2 },
  b2: { cols: 3, rows: 3 },
  b3: { cols: 4, rows: 3 },
  b4: { cols: 4, rows: 4 },
  b5: { cols: 5, rows: 4 },
};

export interface Round {
  /** The first picture. */
  a: string[];
  /** The second picture: identical except at `changed`. */
  b: string[];
  changed: number;
}

/** A round with `cells` squares. All pictures in the first scene are different, so the change is always clear. */
export function makeRound(cells: number, rand: () => number = Math.random): Round {
  if (cells < 2 || cells >= CHANGE_SYMBOLS.length) throw new Error("cells out of range");
  const pool = [...CHANGE_SYMBOLS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const a = pool.slice(0, cells);
  const changed = Math.floor(rand() * cells);
  const b = [...a];
  b[changed] = pool[cells]!; // a picture that is not in the first scene at all
  return { a, b, changed };
}
