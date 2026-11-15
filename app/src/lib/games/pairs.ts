// Pairs (matching cards): pure logic, no screens and no server. Every game here runs on the device.

export type Band = "b1" | "b2" | "b3" | "b4" | "b5";

/** Pictures for the cards. Each is clearly different from the others, and none relies on colour alone. */
export const PAIR_SYMBOLS = ["🍎", "🐱", "⭐", "🌙", "🚗", "🌳", "🐟", "🎈", "🔔", "🍌", "🦆", "🎸", "🍄", "🐢", "⚽", "🧩", "🦋", "🚲", "🍪", "🐘"];

/** How many pairs for each age group: 3 pairs (6 cards) for the youngest, up to 10 pairs (20 cards) for teens. */
export const PAIR_COUNT: Record<Band, number> = { b1: 3, b2: 4, b3: 6, b4: 8, b5: 10 };

/** Columns in the card grid for each age group. */
export const PAIR_COLUMNS: Record<Band, number> = { b1: 3, b2: 4, b3: 4, b4: 4, b5: 5 };

export interface Card {
  /** Position in the grid, 0-based. */
  index: number;
  symbol: string;
}

/** A shuffled deck: `pairCount` different pictures, each exactly twice. */
export function makeDeck(pairCount: number, rand: () => number = Math.random): Card[] {
  if (pairCount < 1 || pairCount > PAIR_SYMBOLS.length) throw new Error("pairCount out of range");
  const pool = [...PAIR_SYMBOLS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const symbols = pool.slice(0, pairCount).flatMap((s) => [s, s]);
  for (let i = symbols.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [symbols[i], symbols[j]] = [symbols[j]!, symbols[i]!];
  }
  return symbols.map((symbol, index) => ({ index, symbol }));
}

/** Two different cards with the same picture. */
export const isMatch = (a: Card, b: Card) => a.index !== b.index && a.symbol === b.symbol;
