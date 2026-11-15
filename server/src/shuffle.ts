import { utf8 } from "./bytes.ts";
import { pf } from "./platform.ts";

// Lesson files always store the correct answer first (answer: 0) for easy authoring.
// Each child sees each question's options in a stable, child-specific order, so the right answer
// isn't always in the same place, and the order doesn't change when they come back.

export function seeded(seed: string): () => number {
  // mulberry32 seeded from the first 4 bytes of a SHA-256 hash
  const h = pf().sha256(utf8(seed));
  let a = (h[0]! | (h[1]! << 8) | (h[2]! << 16) | (h[3]! << 24)) >>> 0; // little-endian, like Buffer.readUInt32LE(0)
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** order[displayIndex] = original option index */
export function optionOrder(childId: string, lessonId: string, question: number, count: number): number[] {
  const rand = seeded(`${childId}:${lessonId}:${question}`);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** A repeatable shuffle: the same seed always gives the same order. */
export function seededShuffle<T>(seed: string, items: readonly T[]): T[] {
  const rand = seeded(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
