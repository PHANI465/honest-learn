// Content is read through the platform (platform.ts): the content/ folder on a server, a bundled copy in the phone app.
import { z } from "zod";
import { pf } from "./platform.ts";

export const SensitiveTopic = z.enum(["religion", "body", "politics"]);
export type SensitiveTopic = z.infer<typeof SensitiveTopic>;

export const QuizQuestion = z
  .object({
    q: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(5),
    answer: z.number().int().min(0),
    hints: z.array(z.string().min(1)).length(3),
    explain: z.string().min(1),
  })
  .refine((q) => q.answer < q.options.length, { message: "answer index out of range" });

export const Section = z
  .object({
    type: z.enum(["text", "tryit", "parent", "fact", "video"]),
    /** For video sections: a caption explaining why we picked this video. */
    body: z.string().min(1),
    /** YouTube video id, played through the privacy-enhanced (no-cookie) player. */
    videoId: z.string().regex(/^[\w-]{11}$/, "must be an 11-character YouTube id").optional(),
    /** Date a reviewer ran scripts/check-videos.mjs and confirmed made-for-kids/embeddable status. */
    videoCheckedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    videoMinutes: z.number().positive().max(20).optional(),
  })
  .refine((s) => s.type !== "video" || !!s.videoId, { message: "video sections need a videoId" });

export const Resource = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  url: z.string().url().startsWith("https://"),
  subjects: z.array(z.string()).min(1),
  bands: z.array(z.enum(["b1", "b2", "b3", "b4", "b5"])).min(1),
  description: z.string().min(1),
  cost: z.literal("free"),
  account: z.string(),
  lastChecked: z.string().nullable(),
});
export type Resource = z.infer<typeof Resource>;

/** Reasoning puzzles (IQ-style practice). Never turned into an IQ score. */
export const Puzzle = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    type: z.string().min(1),
    q: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(5),
    answer: z.number().int().min(0),
    hints: z.array(z.string().min(1)).length(3),
    explain: z.string().min(1),
  })
  .refine((p) => p.answer < p.options.length, { message: "answer index out of range" });
export const PuzzleSet = z.object({
  band: z.enum(["b1", "b2", "b3", "b4", "b5"]),
  status: z.enum(["draft", "reviewed"]),
  title: z.string().min(1),
  puzzles: z.array(Puzzle).min(1),
});
export type PuzzleSet = z.infer<typeof PuzzleSet>;

/**
 * Quick facts shown between activities. A fact holds no secrets, so it can be cached offline.
 * Every fact needs a source a reviewer can open: facts without one are rejected on load.
 */
export const Fact = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  subject: z.string().min(1),
  text: z.string().min(10).max(300),
  source: z.object({ title: z.string().min(1), url: z.string().url().startsWith("https://") }),
  /** Set if a parent must unlock the topic first; most facts leave this out. */
  sensitive: SensitiveTopic.nullable().optional(),
});
export const FactSet = z.object({
  band: z.enum(["b1", "b2", "b3", "b4", "b5"]),
  status: z.enum(["draft", "reviewed"]),
  facts: z.array(Fact).min(1),
});
export type Fact = z.infer<typeof Fact>;
export type FactSet = z.infer<typeof FactSet>;

/**
 * Daily spelling words. The spelling itself is only sent to the app after the child has tried, so the
 * meaning and sentence are what the child sees first. `word` is lower-case letters only.
 */
export const SpellingWord = z.object({
  word: z.string().regex(/^[a-z]{2,20}$/),
  level: z.number().int().min(1).max(3),
  meaning: z.string().min(3).max(160),
  /** A sentence that contains the word. The app shows it with the word blanked out. */
  sentence: z.string().min(5).max(200),
  tip: z.string().min(3).max(200).optional(),
  /** Picture clue for the youngest group. */
  emoji: z.string().max(8).optional(),
});
export const SpellingSet = z.object({
  band: z.enum(["b1", "b2", "b3", "b4", "b5"]),
  status: z.enum(["draft", "reviewed"]),
  /** Where the words come from and under what licence. */
  source: z.object({ title: z.string().min(1), url: z.string().url().startsWith("https://"), license: z.string().min(1) }),
  words: z.array(SpellingWord).min(1),
});
export type SpellingWord = z.infer<typeof SpellingWord>;
export type SpellingSet = z.infer<typeof SpellingSet>;

/**
 * Chess puzzles (see games/chess.ts for how each one is proven sound). `fen` is a position; `solution` is the main line in SAN,
 * starting with the move the child must find. The solution is never sent to the app before the child has earned it.
 */
export const ChessPuzzleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  fen: z.string().min(10),
  theme: z.string().min(1),
  goal: z.enum(["mate", "win"]),
  solverMoves: z.number().int().min(1).max(3),
  solution: z.array(z.string().min(2)).min(1).max(7),
  hints: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  explain: z.string().min(1),
});
export const ChessSet = z.object({
  level: z.number().int().min(1).max(3),
  status: z.enum(["draft", "reviewed"]),
  title: z.string().min(1),
  source: z.string().min(1),
  puzzles: z.array(ChessPuzzleSchema).min(1),
});
export type ChessSet = z.infer<typeof ChessSet>;

export const Lesson = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  band: z.enum(["b1", "b2", "b3", "b4", "b5"]),
  subject: z.string().min(1),
  outcomes: z.array(z.string()).min(1),
  sensitive: SensitiveTopic.nullable(),
  minutes: z.number().int().positive(),
  status: z.enum(["draft", "reviewed"]),
  reviewers: z.array(z.object({ initials: z.string(), role: z.string(), date: z.string() })),
  sources: z.array(z.object({ title: z.string(), url: z.string().url(), license: z.string() })),
  /** Wikipedia article for "Learn more" (ages 9+). Simple English Wikipedia is used for ages 9–11. */
  wikiTitle: z.string().min(1).optional(),
  sections: z.array(Section).min(1),
  quiz: z.array(QuizQuestion).min(1),
});
export type Lesson = z.infer<typeof Lesson>;

export interface KnowledgeMap {
  version: string;
  sensitiveTopics: Record<string, string>;
  bands: { id: string; name: string; ages: [number, number]; ai: string; sessionMinutes: number }[];
  subjects: { id: string; name: string; icon: string; bands?: string[] }[];
  cells: { band: string; subject: string; outcomes: { id: string; text: string; sensitive?: string }[] }[];
}

export interface ContentStore {
  map: KnowledgeMap;
  lessons: Map<string, Lesson>;
  resources: Resource[];
  puzzles: Map<string, PuzzleSet>;
  facts: Map<string, FactSet>;
  spelling: Map<string, SpellingSet>;
  /** Chess puzzle sets by level number ("1", "2", "3"). */
  chess: Map<string, ChessSet>;
}

/** Loads and validates all content. Throws with a readable list of problems. */
export function loadContent(contentDir: string): ContentStore {
  const src = pf().content;
  const read = (rel: string) => src.readJson(contentDir, rel);
  const label = (rel: string) => `${contentDir}/${rel}`;
  const map = read("knowledge-map.json") as KnowledgeMap;
  const outcomeIds = new Set(map.cells.flatMap((c) => c.outcomes.map((o) => o.id)));
  const subjectIds = new Set(map.subjects.map((s) => s.id));
  const lessons = new Map<string, Lesson>();
  const problems: string[] = [];

  for (const rel of src.listJson(contentDir, "lessons")) {
    const file = label(rel);
    const parsed = Lesson.safeParse(read(rel));
    if (!parsed.success) {
      problems.push(`${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    const l = parsed.data;
    if (lessons.has(l.id)) problems.push(`${file}: duplicate lesson id ${l.id}`);
    if (!subjectIds.has(l.subject)) problems.push(`${file}: unknown subject ${l.subject}`);
    for (const o of l.outcomes) if (!outcomeIds.has(o)) problems.push(`${file}: unknown outcome ${o}`);
    for (const o of l.outcomes) {
      if (!o.startsWith(l.band + "-")) problems.push(`${file}: outcome ${o} is not in band ${l.band}`);
    }
    if (l.status === "reviewed" && l.reviewers.length < 2) problems.push(`${file}: reviewed lessons need 2 reviewers`);
    if ((l.band === "b1" || l.band === "b2") && !l.sections.some((s) => s.type === "parent")) {
      problems.push(`${file}: ${l.band} lessons need a 'parent' section`);
    }
    for (const s of l.sections) {
      if (s.type === "video" && l.status === "reviewed" && !s.videoCheckedOn) {
        problems.push(`${file}: reviewed lessons can only include videos with a videoCheckedOn date (run scripts/check-videos.mjs)`);
      }
    }
    lessons.set(l.id, l);
  }
  const resources: Resource[] = [];
  if (src.exists(contentDir, "resources.json")) {
    const raw = read("resources.json") as { resources: unknown[] };
    const ids = new Set<string>();
    for (const r of raw.resources) {
      const parsed = Resource.safeParse(r);
      if (!parsed.success) {
        problems.push(`resources.json: ${JSON.stringify((r as { id?: string }).id)} ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
        continue;
      }
      if (ids.has(parsed.data.id)) problems.push(`resources.json: duplicate id ${parsed.data.id}`);
      ids.add(parsed.data.id);
      for (const subj of parsed.data.subjects) if (!subjectIds.has(subj)) problems.push(`resources.json: ${parsed.data.id} has unknown subject ${subj}`);
      resources.push(parsed.data);
    }
  }

  const puzzles = new Map<string, PuzzleSet>();
  if (src.exists(contentDir, "puzzles")) {
    for (const rel of src.listJson(contentDir, "puzzles")) {
      const file = label(rel);
      const parsed = PuzzleSet.safeParse(read(rel));
      if (!parsed.success) {
        problems.push(`${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
        continue;
      }
      if (puzzles.has(parsed.data.band)) problems.push(`${file}: second puzzle set for ${parsed.data.band}`);
      const ids = new Set<string>();
      for (const p of parsed.data.puzzles) {
        if (ids.has(p.id)) problems.push(`${file}: duplicate puzzle id ${p.id}`);
        ids.add(p.id);
      }
      puzzles.set(parsed.data.band, parsed.data);
    }
  }

  const facts = new Map<string, FactSet>();
  if (src.exists(contentDir, "facts")) {
    // b1.json to b5.json only: the folder also holds keywords.json, the key words used by scripts/check-fact-sources.mjs.
    for (const rel of src.listJson(contentDir, "facts").filter((f) => /\/b[1-5]\.json$/.test(f))) {
      const file = label(rel);
      const parsed = FactSet.safeParse(read(rel));
      if (!parsed.success) {
        problems.push(`${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
        continue;
      }
      if (facts.has(parsed.data.band)) problems.push(`${file}: second fact set for ${parsed.data.band}`);
      const ids = new Set<string>();
      for (const f of parsed.data.facts) {
        if (ids.has(f.id)) problems.push(`${file}: duplicate fact id ${f.id}`);
        ids.add(f.id);
        if (!subjectIds.has(f.subject)) problems.push(`${file}: ${f.id} has unknown subject ${f.subject}`);
      }
      facts.set(parsed.data.band, parsed.data);
    }
  }

  const spelling = new Map<string, SpellingSet>();
  if (src.exists(contentDir, "spelling")) {
    for (const rel of src.listJson(contentDir, "spelling")) {
      const file = label(rel);
      const parsed = SpellingSet.safeParse(read(rel));
      if (!parsed.success) {
        problems.push(`${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
        continue;
      }
      if (spelling.has(parsed.data.band)) problems.push(`${file}: second spelling set for ${parsed.data.band}`);
      const seenWords = new Set<string>();
      for (const w of parsed.data.words) {
        if (seenWords.has(w.word)) problems.push(`${file}: duplicate word ${w.word}`);
        seenWords.add(w.word);
        // The sentence must contain the word (so it can be blanked) and the meaning must not (it would give the word away).
        if (!new RegExp(`\\b${w.word}\\b`, "i").test(w.sentence)) problems.push(`${file}: the sentence for "${w.word}" does not contain it`);
        if (new RegExp(`\\b${w.word}\\b`, "i").test(w.meaning)) problems.push(`${file}: the meaning of "${w.word}" contains the word`);
      }
      spelling.set(parsed.data.band, parsed.data);
    }
  }

  const chess = new Map<string, ChessSet>();
  if (src.exists(contentDir, "chess")) {
    const seenIds = new Set<string>();
    for (const rel of src.listJson(contentDir, "chess")) {
      const file = label(rel);
      const parsed = ChessSet.safeParse(read(rel));
      if (!parsed.success) {
        problems.push(`${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
        continue;
      }
      if (chess.has(String(parsed.data.level))) problems.push(`${file}: second chess set for level ${parsed.data.level}`);
      for (const p of parsed.data.puzzles) {
        if (seenIds.has(p.id)) problems.push(`${file}: duplicate chess puzzle id ${p.id}`);
        seenIds.add(p.id);
      }
      chess.set(String(parsed.data.level), parsed.data);
    }
  }

  if (problems.length) throw new Error("Content problems:\n- " + problems.join("\n- "));
  return { map, lessons, resources, puzzles, facts, spelling, chess };
}

/**
 * Lesson without quiz answers, hints or explanations: what the app receives before answering.
 * `orderFor(i)` gives the display order of question i's options (see shuffle.ts).
 */
export function publicLesson(l: Lesson, orderFor: (question: number, count: number) => number[] = (_q, n) => [...Array(n).keys()]) {
  // a family lesson carries its owner inside the server; that never goes to the app
  const { ownerId: _owner, ...rest } = l as Lesson & { ownerId?: string };
  return {
    ...rest,
    quiz: l.quiz.map(({ q, options }, i) => ({ q, options: orderFor(i, options.length).map((o) => options[o]!) })),
  };
}

export function lessonSummary(l: Lesson) {
  const { id, title, band, subject, sensitive, minutes, status } = l;
  return { id, title, band, subject, sensitive, minutes, status, questions: l.quiz.length, family: (l as { family?: boolean }).family === true };
}
