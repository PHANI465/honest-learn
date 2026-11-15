// Daily spelling: pure helpers (no database), so the rules are easy to test.
//
// Words move through Leitner boxes. A correct spelling moves the word up a box and it comes back after 1, 3, 7 or 16 days.
// A miss sends it back to box 0 and it comes back tomorrow. A day's words are chosen once and then kept, so reloading
// never changes the set. No streaks: a missed day is never mentioned.
import type { SpellingSet, SpellingWord } from "./content.ts";
import type { BandId } from "./security.ts";
import { seededShuffle } from "./shuffle.ts";

export const WORDS_PER_DAY: Record<BandId, number> = { b1: 3, b2: 4, b3: 6, b4: 8, b5: 10 };
/** Days until a word is due again after a correct answer that lands it in box 1, 2, 3 or 4. */
export const BOX_DAYS = [1, 3, 7, 16] as const;
export const MAX_BOX = BOX_DAYS.length;
/** A level is "known" when this share of its words are in box 2 or higher; then new words come from the next level. */
export const LEVEL_UP_SHARE = 0.8;

export type Activity = "type" | "choose" | "unscramble" | "fill";

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The new box and due day after an answer. */
export function nextState(box: number, correct: boolean, day: string): { box: number; due: string } {
  if (!correct) return { box: 0, due: addDays(day, 1) };
  const b = Math.min(box + 1, MAX_BOX);
  return { box: b, due: addDays(day, BOX_DAYS[b - 1]!) };
}

/** What a word's answer is compared against: trimmed and lower-case. */
export const normalise = (s: string) => s.trim().toLowerCase();

export interface ProgressRow {
  word: string;
  box: number;
  due: string;
}

/** The level new words come from: the first level that is not yet 80% in box 2 or higher (3 at most). */
export function currentLevel(words: readonly SpellingWord[], boxes: ReadonlyMap<string, number>): 1 | 2 | 3 {
  for (const level of [1, 2, 3] as const) {
    const inLevel = words.filter((w) => w.level === level);
    if (!inLevel.length) continue;
    const known = inLevel.filter((w) => (boxes.get(w.word) ?? -1) >= 2).length;
    if (known / inLevel.length < LEVEL_UP_SHARE) return level;
  }
  return 3;
}

/** Today's words: words that are due first (oldest first), then new words from the current level, then other levels. */
export function pickDay(set: SpellingSet, band: BandId, childId: string, day: string, progress: readonly ProgressRow[]): string[] {
  const count = WORDS_PER_DAY[band];
  const inSet = new Set(set.words.map((w) => w.word));
  const known = new Map(progress.filter((p) => inSet.has(p.word)).map((p) => [p.word, p]));
  const due = [...known.values()].filter((p) => p.due <= day).sort((a, b) => (a.due === b.due ? a.word.localeCompare(b.word) : a.due.localeCompare(b.due)));
  const picked = due.slice(0, count).map((p) => p.word);
  if (picked.length >= count) return picked;
  const level = currentLevel(set.words, new Map([...known.values()].map((p) => [p.word, p.box])));
  const order = [level, ...[1, 2, 3].filter((l) => l > level), ...[1, 2, 3].filter((l) => l < level)];
  for (const l of order) {
    const fresh = set.words.filter((w) => w.level === l && !known.has(w.word)).map((w) => w.word);
    for (const w of seededShuffle(`${childId}:${day}:${l}`, fresh)) {
      if (picked.length >= count) return picked;
      picked.push(w);
    }
  }
  return picked;
}

/** Which kind of exercise a word gets today. Short words and the youngest group only get the easy kinds. */
export function activityFor(band: BandId, childId: string, day: string, index: number, word: string): Activity {
  const kinds: Activity[] = band === "b1" ? ["choose", "unscramble"] : word.length < 4 ? ["type", "choose"] : ["type", "choose", "unscramble", "fill"];
  return seededShuffle(`${childId}:${day}:${index}:kind`, kinds)[0]!;
}

/** The sentence with the word replaced by a blank. */
export function blankSentence(sentence: string, word: string): string {
  return sentence.replace(new RegExp(`\\b${word}\\b`, "gi"), "_____");
}

/** Two wrong spellings that look plausible: swapped letters, a doubled or single letter, a changed vowel. */
export function distractors(word: string, seed: string): [string, string] {
  const out: string[] = [];
  const add = (w: string) => w !== word && w.length >= 2 && !out.includes(w) && out.push(w);
  const swaps: string[] = [];
  for (let i = 1; i < word.length - 1; i++) {
    if (word[i] !== word[i + 1]) swaps.push(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  }
  const doubles: string[] = [];
  for (let i = 1; i < word.length; i++) {
    doubles.push(word[i] === word[i - 1] ? word.slice(0, i) + word.slice(i + 1) : word.slice(0, i) + word[i] + word.slice(i));
  }
  const vowels: string[] = [];
  const next: Record<string, string> = { a: "e", e: "a", i: "y", o: "u", u: "o", y: "i" };
  for (let i = 1; i < word.length; i++) if (next[word[i]!]) vowels.push(word.slice(0, i) + next[word[i]!] + word.slice(i + 1));
  const pools = [seededShuffle(seed + "s", swaps), seededShuffle(seed + "d", doubles), seededShuffle(seed + "v", vowels)];
  for (const pool of seededShuffle(seed + "p", pools)) for (const w of pool) add(w);
  for (const pool of pools) for (const w of pool) add(w);
  // very short words: fall back to changing the last letter
  for (const c of "aeiloust") add(word.slice(0, -1) + c);
  return [out[0]!, out[1]!];
}

/** The word's letters in a different order (never the right order, when the word allows it). */
export function scramble(word: string, seed: string): string {
  const letters = [...word];
  if (new Set(letters).size < 2) return word;
  for (let n = 0; n < 8; n++) {
    const s = seededShuffle(`${seed}:${n}`, letters).join("");
    if (s !== word) return s;
  }
  return [...letters].reverse().join("");
}

/** The word with some letters hidden, e.g. "b_c_use". The first letter always shows. */
export function gapPattern(word: string, seed: string): string {
  const idx = seededShuffle(seed, [...word].map((_, i) => i).slice(1));
  const hide = new Set(idx.slice(0, Math.max(1, Math.round((word.length - 1) * 0.4))));
  return [...word].map((c, i) => (hide.has(i) ? "_" : c)).join("");
}
