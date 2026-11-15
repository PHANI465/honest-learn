// Lessons a parent adds for their own children ("Added by your family").
//
// They are private to the family: stored per parent, shown only to that parent's children, included in the data export and
// deleted with the account. They use the same lesson shape as the built-in lessons so every screen works unchanged, and the
// same rules for quiz answers: the correct option is stored first, the server shuffles options per child, and the answer and
// hints stay on the server until a child has earned them.
//
// They are not project content: they are never "reviewed", carry no sources, and the parent is responsible for what they say.
import { z } from "zod";
import { utf8Length } from "./bytes.ts";
import type { KnowledgeMap, Lesson } from "./content.ts";
import type { BandId } from "./security.ts";

export const FAMILY_LESSON_PREFIX = "fam-";
export const MAX_FAMILY_LESSONS = 100;
export const MAX_FAMILY_LESSON_BYTES = 20_000;

/** A lesson from a family, with the owner kept inside so a lesson can never be shown to another family's child. */
export type FamilyLesson = Lesson & { family: true; ownerId: string };
export const isFamilyLesson = (l: Lesson): l is FamilyLesson => (l as Partial<FamilyLesson>).family === true;

const text = (max: number) => z.string().trim().min(1).max(max);

export const FamilySection = z.object({
  type: z.enum(["text", "tryit", "fact", "parent"]),
  body: text(2000),
});

/** What the parent's form sends. `answer` is the position of the correct option in `options` as typed. */
export const FamilyQuestion = z
  .object({
    q: text(300),
    options: z.array(text(150)).min(2).max(5),
    answer: z.number().int().min(0),
    hints: z.array(text(300)).length(3),
    explain: z.string().trim().max(400).default(""),
  })
  .refine((q) => q.answer < q.options.length, { message: "answer must point at one of the options", path: ["answer"] })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length, { message: "options must all be different", path: ["options"] });

export const FamilyLessonInput = z.object({
  title: text(80),
  band: z.enum(["b1", "b2", "b3", "b4", "b5"]),
  subject: z.string().min(1).max(30),
  minutes: z.number().int().min(1).max(60).default(10),
  sections: z.array(FamilySection).min(1).max(12),
  quiz: z.array(FamilyQuestion).max(10).default([]),
});
export type FamilyLessonInput = z.infer<typeof FamilyLessonInput>;

export type FamilyLessonProblem = { field: string; message: string };

/** Checks that need the knowledge map: the subject must exist for that age group. */
export function checkSubject(map: KnowledgeMap, band: BandId, subject: string): FamilyLessonProblem | null {
  const s = map.subjects.find((x) => x.id === subject);
  if (!s) return { field: "subject", message: "choose a subject from the list" };
  if (s.bands && !s.bands.includes(band)) return { field: "subject", message: "that subject is not offered for this age group" };
  return null;
}

/**
 * Builds the stored lesson: the correct option moved to the front (`answer: 0`), a default explanation if none was typed,
 * and no sources, outcomes or review status because this is not project content.
 */
export function buildFamilyLesson(id: string, ownerId: string, input: FamilyLessonInput): FamilyLesson {
  return {
    id,
    title: input.title,
    band: input.band,
    subject: input.subject,
    outcomes: [],
    sensitive: null,
    minutes: input.minutes,
    status: "draft",
    reviewers: [],
    sources: [],
    sections: input.sections.map((s) => ({ type: s.type, body: s.body })),
    quiz: input.quiz.map((q) => {
      const correct = q.options[q.answer]!;
      return {
        q: q.q,
        options: [correct, ...q.options.filter((_, i) => i !== q.answer)],
        answer: 0,
        hints: q.hints,
        explain: q.explain || "Look back at the lesson to see why.",
      };
    }),
    family: true,
    ownerId,
  };
}

/** Things worth telling the parent about that do not stop the lesson from being saved. */
export function warningsFor(input: FamilyLessonInput): string[] {
  const out: string[] = [];
  input.quiz.forEach((q, i) => {
    const correct = q.options[q.answer]!.toLowerCase();
    if (correct.length >= 3 && q.hints.some((h) => h.toLowerCase().includes(correct))) {
      out.push(`Question ${i + 1}: a hint contains the correct answer. Hints should help without giving it away.`);
    }
    if (q.hints.some((h, k) => q.hints.findIndex((x) => x.toLowerCase() === h.toLowerCase()) !== k)) {
      out.push(`Question ${i + 1}: two hints are the same. The three hints should go from a small nudge to a worked example of a different problem.`);
    }
  });
  if (!input.quiz.length) out.push("This lesson has no quiz questions yet. Your child can read it but there is nothing to check.");
  return out;
}

/** What the app gets back for editing: the stored lesson turned back into form fields (the correct option is first). */
export function toFormShape(l: Lesson) {
  return {
    id: l.id,
    title: l.title,
    band: l.band,
    subject: l.subject,
    minutes: l.minutes,
    sections: l.sections.map((s) => ({ type: s.type, body: s.body })),
    quiz: l.quiz.map((q) => ({ q: q.q, options: q.options, answer: q.answer, hints: q.hints, explain: q.explain })),
  };
}

export const sizeOf = (l: unknown) => utf8Length(JSON.stringify(l));
