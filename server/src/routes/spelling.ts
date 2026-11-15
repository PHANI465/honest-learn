// Daily spelling and vocabulary. Needs a family token (checked in app.ts for /children/*).
//
// The child sees the meaning and a sentence with the word blanked out. The spelling itself is compared on the server and is
// only shown after the try, right or wrong. One exception, chosen by the owner: `say` carries the word so the phone can read
// it aloud (hearing the word is the point of spelling practice). The app never shows `say` on screen. See docs/SECURITY.md.
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { now } from "../db.ts";
import { childBand, Day, plausibleDay, type ChildRow } from "../models.ts";
import { activityFor, blankSentence, distractors, gapPattern, nextState, normalise, pickDay, scramble, WORDS_PER_DAY, type Activity } from "../spelling.ts";
import { seededShuffle } from "../shuffle.ts";
import type { Ctx, Env } from "../context.ts";

export function spellingRoutes(ctx: Ctx) {
  const { db, content, loadChild } = ctx;
  const r = new Hono<Env>();

  const setFor = (child: ChildRow) => {
    const set = content.spelling.get(childBand(child));
    return set && (set.status === "reviewed" || config.showDrafts) ? set : null;
  };

  /** The words chosen for this child today: chosen once, then kept. */
  async function dayWords(child: ChildRow, day: string): Promise<string[]> {
    const set = setFor(child)!;
    const saved = await db.get<{ words: string }>("SELECT words FROM spelling_days WHERE child_id = ? AND day = ?", [child.id, day]);
    if (saved) return JSON.parse(saved.words) as string[];
    const progress = await db.all<{ word: string; box: number; due: string }>("SELECT word, box, due FROM spelling_progress WHERE child_id = ?", [child.id]);
    const words = pickDay(set, childBand(child), child.id, day, progress);
    await db.run("INSERT INTO spelling_days (child_id, day, words) VALUES (?,?,?) ON CONFLICT (child_id, day) DO NOTHING", [child.id, day, JSON.stringify(words)]);
    const again = await db.get<{ words: string }>("SELECT words FROM spelling_days WHERE child_id = ? AND day = ?", [child.id, day]);
    return JSON.parse(again!.words) as string[];
  }

  r.get("/children/:childId/spelling/today", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const day = Day.parse(c.req.query("day"));
    if (!plausibleDay(day)) return c.json({ error: "invalid_input", details: ["day is not today"] }, 400);
    const set = setFor(child);
    if (!set) return c.json({ available: false });
    const band = childBand(child);
    const byWord = new Map(set.words.map((w) => [w.word, w]));
    const words = (await dayWords(child, day)).filter((w) => byWord.has(w));
    const rows = await db.all<{ word: string; box: number; last_day: string | null }>("SELECT word, box, last_day FROM spelling_progress WHERE child_id = ?", [child.id]);
    const state = new Map(rows.map((p) => [p.word, p]));
    const items = words.map((word, index) => {
      const w = byWord.get(word)!;
      const activity: Activity = activityFor(band, child.id, day, index, word);
      const seed = `${child.id}:${day}:${index}`;
      const p = state.get(word);
      const done = p?.last_day === day;
      const item: Record<string, unknown> = {
        index,
        activity,
        meaning: w.meaning,
        sentence: blankSentence(w.sentence, word),
        emoji: w.emoji ?? null,
        say: done ? null : word, // audio only: never shown on screen (see the note at the top of this file)
        done,
      };
      if (!done) {
        if (activity === "choose") item.options = seededShuffle(`${seed}:opts`, [word, ...distractors(word, seed)]);
        if (activity === "unscramble") item.letters = [...scramble(word, seed)];
        if (activity === "fill") item.pattern = gapPattern(word, seed);
      } else {
        item.result = { correct: (p?.box ?? 0) > 0, word, tip: w.tip ?? null };
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
    const word = (await dayWords(child, b.day))[b.index];
    const entry = set.words.find((w) => w.word === word);
    if (!word || !entry) return c.json({ error: "word_not_found" }, 404);
    const prev = await db.get<{ box: number; last_day: string | null }>("SELECT box, last_day FROM spelling_progress WHERE child_id = ? AND word = ?", [child.id, word]);
    if (prev?.last_day === b.day) {
      // Already tried today: the box is not changed again, so a word cannot be promoted twice in one day.
      return c.json({ correct: prev.box > 0, word, tip: entry.tip ?? null, already: true });
    }
    const correct = normalise(b.typed) === word;
    const next = nextState(prev?.box ?? 0, correct, b.day);
    await db.run(
      `INSERT INTO spelling_progress (child_id, word, box, due, last_day) VALUES (?,?,?,?,?)
       ON CONFLICT (child_id, word) DO UPDATE SET box = excluded.box, due = excluded.due, last_day = excluded.last_day`,
      [child.id, word, next.box, next.due, b.day],
    );
    return c.json({ correct, word, tip: entry.tip ?? null, already: false, checkedAt: now() });
  });

  return r;
}
