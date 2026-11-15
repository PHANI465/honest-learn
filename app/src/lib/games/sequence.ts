// Sequence recall (a growing pattern to repeat, like the classic "Simon" game). Pure logic. No timer pressure and no game over:
// a wrong tap just shows the same pattern again.

export type Band = "b1" | "b2" | "b3" | "b4" | "b5";

/** A button is told apart by its picture AND its colour, so it never depends on colour alone. */
export interface SeqButton {
  symbol: string;
  name: string;
  color: string;
}

export const SEQ_BUTTONS: SeqButton[] = [
  { symbol: "🔺", name: "triangle", color: "#C22E2A" },
  { symbol: "🔷", name: "diamond", color: "#2767C2" },
  { symbol: "⭐", name: "star", color: "#8A6200" },
  { symbol: "🟢", name: "circle", color: "#1F7A4C" },
  { symbol: "🟣", name: "purple dot", color: "#6B4FC8" },
  { symbol: "🟠", name: "orange dot", color: "#A05817" },
];

/** How many buttons for each age group. */
export const SEQ_BUTTON_COUNT: Record<Band, number> = { b1: 3, b2: 4, b3: 4, b4: 5, b5: 6 };
/** How long the first pattern is. It grows by one each time the child gets it right. */
export const SEQ_START_LENGTH: Record<Band, number> = { b1: 2, b2: 2, b3: 3, b4: 3, b5: 4 };

/** A starting pattern of `length` presses over `buttons` buttons. */
export function newSequence(length: number, buttons: number, rand: () => number = Math.random): number[] {
  return Array.from({ length }, () => Math.floor(rand() * buttons));
}

/** The same pattern with one more press on the end. */
export function extend(seq: readonly number[], buttons: number, rand: () => number = Math.random): number[] {
  return [...seq, Math.floor(rand() * buttons)];
}

export type TapResult = { kind: "right"; progress: number } | { kind: "done" } | { kind: "wrong" };

/** What a tap means: `progress` is how many presses were already repeated correctly. */
export function tap(seq: readonly number[], progress: number, pressed: number): TapResult {
  if (seq[progress] !== pressed) return { kind: "wrong" };
  return progress + 1 === seq.length ? { kind: "done" } : { kind: "right", progress: progress + 1 };
}
