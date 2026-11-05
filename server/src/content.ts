import { readFileSync, readdirSync, statSync } from "node:fs";
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
  sections: z
    .array(z.object({ type: z.enum(["text", "tryit", "parent", "fact"]), body: z.string().min(1) }))
    .min(1),
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
    lessons.set(l.id, l);
  }
  if (problems.length) throw new Error("Content problems:\n- " + problems.join("\n- "));
  return { map, lessons };
}

/** Lesson without quiz answers/explanations — what the app receives before answering. */
export function publicLesson(l: Lesson) {
  return {
    ...l,
    quiz: l.quiz.map(({ q, options }) => ({ q, options })),
  };
}

export function lessonSummary(l: Lesson) {
  const { id, title, band, subject, sensitive, minutes, status } = l;
  return { id, title, band, subject, sensitive, minutes, status, questions: l.quiz.length };
}
