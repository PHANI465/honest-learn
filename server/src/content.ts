import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

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
}

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

/** Loads and validates all content. Throws with a readable list of problems. */
export function loadContent(contentDir: string): ContentStore {
  const map = JSON.parse(readFileSync(join(contentDir, "knowledge-map.json"), "utf8")) as KnowledgeMap;
  const outcomeIds = new Set(map.cells.flatMap((c) => c.outcomes.map((o) => o.id)));
  const subjectIds = new Set(map.subjects.map((s) => s.id));
  const lessons = new Map<string, Lesson>();
  const problems: string[] = [];

  for (const file of walk(join(contentDir, "lessons"))) {
    const parsed = Lesson.safeParse(JSON.parse(readFileSync(file, "utf8")));
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
  const resFile = join(contentDir, "resources.json");
  if (existsSync(resFile)) {
    const raw = JSON.parse(readFileSync(resFile, "utf8")) as { resources: unknown[] };
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
  const puzzleDir = join(contentDir, "puzzles");
  if (existsSync(puzzleDir)) {
    for (const file of walk(puzzleDir)) {
      const parsed = PuzzleSet.safeParse(JSON.parse(readFileSync(file, "utf8")));
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

  if (problems.length) throw new Error("Content problems:\n- " + problems.join("\n- "));
  return { map, lessons, resources, puzzles };
}

/**
 * Lesson without quiz answers, hints or explanations: what the app receives before answering.
 * `orderFor(i)` gives the display order of question i's options (see shuffle.ts).
 */
export function publicLesson(l: Lesson, orderFor: (question: number, count: number) => number[] = (_q, n) => [...Array(n).keys()]) {
  return {
    ...l,
    quiz: l.quiz.map(({ q, options }, i) => ({ q, options: orderFor(i, options.length).map((o) => options[o]!) })),
  };
}

export function lessonSummary(l: Lesson) {
  const { id, title, band, subject, sensitive, minutes, status } = l;
  return { id, title, band, subject, sensitive, minutes, status, questions: l.quiz.length };
}
