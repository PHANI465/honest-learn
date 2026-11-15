// Daily spelling and vocabulary. Needs a family token (checked in app.ts for /children/*).
//
// The child sees the meaning and a sentence with the word blanked out. The spelling itself is compared on the server and is
// only shown after the try, right or wrong. One exception, chosen by the owner: `say` carries the word so the phone can read
// it aloud (hearing the word is the point of spelling practice). The app never shows `say` on screen. See docs/SECURITY.md.
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { now } from "../db.ts";
import { childBand, childSpellingVariant, Day, plausibleDay, type ChildRow } from "../models.ts";
import { activityFor, blankSentence, distractors, gapPattern, nextState, normalise, otherSpelling, pickDay, scramble, sentenceFor, spellingOf, usableWords, WORDS_PER_DAY, type Activity } from "../spelling.ts";
import { seededShuffle } from "../shuffle.ts";
import type { Ctx, Env } from "../context.ts";

export function spellingRoutes(ctx: Ctx) {
  const { db, content, loadChild } = ctx;
  const r = new Hono<Env>();

  const setFor = (child: ChildRow) => {
    const set = content.spelling.get(childBand(child));
    return set && (set.status === "reviewed" || config.showDrafts) ? set : null;
  };

  /**
   * The words this child can be asked: the whole list, except that a word spelled differently in British and American English
   * is left out until the family's spelling is known (its choice, or its country's default). Keys are the American spelling.
   */
  const usableFor = (child: ChildRow) => {
    const set = setFor(child)!;
    return { ...set, words: usableWords(set, childSpellingVariant(child)) };
  };

  /** The words chosen for this child today: chosen once, then kept. */
  async function dayWords(child: ChildRow, day: string): Promise<string[]> {
    const set = usableFor(child);
    const saved = await db.get<{ words: string }>("SELECT words FROM spelling_days WHERE child_id = ? AND day = ?", [child.id, day]);
    if (saved) return JSON.parse(saved.words) as string[];
    const progress = await db.all<{ word: string; box: number; due: string }>("SELECT word, box, due FROM spelling_progress WHERE child_id = ?", [child.id]);
    const words = pickDay(set, childBand(child), child.id, day, progress);
    await db.run("INSERT INTO spelling_days (child_id, day, words) VALUES (?,?,?) ON CONFLICT (child_id, day) DO NOTHING", [child.id, day, JSON.stringify(words)]);
    const again = await db.get<{ words: string }>("SELECT words FROM spelling_days WHERE child_id = ? AND day = ?", [child.id, day]);
    return JSON.parse(again!.words) as string[];
  }

  /** Today's words that can still be asked. Items and checks both count positions in this list, so they always agree. */
  async function todaysWords(child: ChildRow, day: string): Promise<string[]> {
    const ok = new Set(usableFor(child).words.map((w) => w.word));
    return (await dayWords(child, day)).filter((w) => ok.has(w));
  }

  r.get("/children/:childId/spelling/today", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const day = Day.parse(c.req.query("day"));
    if (!plausibleDay(day)) return c.json({ error: "invalid_input", details: ["day is not today"] }, 400);
    const set = setFor(child);
    if (!set) return c.json({ available: false });
    const band = childBand(child);
    const variant = childSpellingVariant(child);
    const byWord = new Map(set.words.map((w) => [w.word, w]));
    const words = await todaysWords(child, day);
    const rows = await db.all<{ word: string; box: number; last_day: string | null }>("SELECT word, box, last_day FROM spelling_progress WHERE child_id = ?", [child.id]);
    const state = new Map(rows.map((p) => [p.word, p]));
    const items = words.map((word, index) => {
      const w = byWord.get(word)!;
      const spelled = spellingOf(w, variant);
      const other = otherSpelling(w, variant);
      const activity: Activity = activityFor(band, child.id, day, index, spelled, other);
      const seed = `${child.id}:${day}:${index}`;
      const p = state.get(word);
      const done = p?.last_day === day;
      const item: Record<string, unknown> = {
        index,
        activity,
        meaning: w.meaning,
        sentence: blankSentence(sentenceFor(w, variant), spelled),
        emoji: w.emoji ?? null,
        say: done ? null : spelled, // audio only: never shown on screen (see the note at the top of this file)
        done,
      };
      if (!done) {
        if (activity === "choose") item.options = seededShuffle(`${seed}:opts`, [spelled, ...distractors(spelled, seed, other ? [other] : [])]);
        if (activity === "unscramble") item.letters = [...scramble(spelled, seed)];
        if (activity === "fill") item.pattern = gapPattern(spelled, seed);
      } else {
        item.result = { correct: (p?.box ?? 0) > 0, word: spelled, tip: w.tip ?? null };
      }
      return item;
    });
    return c.json({ available: true, day, perDay: WORDS_PER_DAY[band], source: set.source, items, doneCount: items.filter((i) => i.done).length });
  });

  r.post("/children/:childId/spelling/check", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const b = z.object({ day: Day, index: z.number().int().min(0).max(50), typed: z.string().max(40) }).parse(await c.req.json());
    if (!plausibleDay(b.day)) return c.json({ error: "invalid_input", details: ["day is not today"] }, 400);
    const set = setFor(child);
    if (!set) return c.json({ error: "not_found" }, 404);
    const word = (await todaysWords(child, b.day))[b.index];
    const entry = set.words.find((w) => w.word === word);
    if (!word || !entry) return c.json({ error: "word_not_found" }, 404);
    const variant = childSpellingVariant(child);
    const spelled = spellingOf(entry, variant);
    const other = otherSpelling(entry, variant);
    const prev = await db.get<{ box: number; last_day: string | null }>("SELECT box, last_day FROM spelling_progress WHERE child_id = ? AND word = ?", [child.id, word]);
    if (prev?.last_day === b.day) {
      // Already tried today: the box is not changed again, so a word cannot be promoted twice in one day.
      return c.json({ correct: prev.box > 0, word: spelled, tip: entry.tip ?? null, already: true });
    }
    const typed = normalise(b.typed);
    const correct = typed === spelled;
    const next = nextState(prev?.box ?? 0, correct, b.day);
    await db.run(
      `INSERT INTO spelling_progress (child_id, word, box, due, last_day) VALUES (?,?,?,?,?)
       ON CONFLICT (child_id, word) DO UPDATE SET box = excluded.box, due = excluded.due, last_day = excluded.last_day`,
      [child.id, word, next.box, next.due, b.day],
    );
    // The other country's spelling is not a slip, so say what is going on: the family chose how its children spell this word.
    const tip = !correct && other && typed === other ? `That is how ${variant === "uk" ? "Americans" : "British people"} spell it. Your family uses ${variant === "uk" ? "British" : "American"} spelling.` : entry.tip ?? null;
    return c.json({ correct, word: spelled, tip, already: false, checkedAt: now() });
  });

  return r;
}
