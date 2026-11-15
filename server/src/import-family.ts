// Reading a family's data download (GET /parent/export) back in (POST /parent/import): the validation, and nothing else.
//
// WHY: a family can move between "on this phone only" and a server, or restore a backup, without losing its children's progress. The file
// is UNTRUSTED INPUT (anyone can write one by hand), so every row is checked on its own, bad rows are dropped and counted instead of
// failing the whole import, nothing from the file is used as an id, and only what is safe to restore is read at all:
//
//   restored      children and their settings, lesson progress, spelling progress, finished games, Hoot chats (optional), the family's own lessons
//   NOT restored  hints opened and questions solved (they decide when an answer may be revealed: restoring them would let anyone who knows
//                 the PIN fabricate "earned" answers, see CLAUDE.md), daily minutes, reports to the team, the family's own AI model (its key
//                 is never exported), the parent's email, password and PIN
//
// The route that uses this is routes/parent-import.ts. The shapes mirror what routes/parent.ts exports.
import { z } from "zod";
import { SIGN_LANGUAGES } from "./content.ts";
import { AVATARS, BirthYear, TOPICS } from "./models.ts";

/** Largest import accepted (the biggest a Vercel function takes is 4.5 MB). A larger family is moved a few children at a time, or without chats. */
export const IMPORT_MAX_BYTES = 4 * 1024 * 1024;
/** Rows accepted per kind, for the whole file. More is refused: nothing here is cut off silently. */
export const IMPORT_MAX_ROWS = { children: 8, progress: 4000, messages: 6000, spelling: 8000, games: 6000, lessons: 100 } as const;
export const IMPORT_MAX_MESSAGE_CHARS = 4000;

const Iso = z.string().max(40).regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/, "not a time").refine((s) => Number.isFinite(Date.parse(s)), "not a time");
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "not a day").refine((s) => Number.isFinite(Date.parse(s + "T12:00:00Z")), "not a day");
const Id = z.string().min(1).max(100);

/** A child as the download shows them (childPublic). The nickname and birth year decide whether the child can be restored at all; settings fall back to defaults. */
export const ImportChild = z.object({
  id: Id,
  nickname: z.string().trim().min(1).max(30),
  birthYear: BirthYear,
  avatar: z.enum(AVATARS).catch("owl"),
  bandOverride: z.enum(["b1", "b2", "b3", "b4", "b5"]).nullable().catch(null),
  unlockedTopics: z.array(z.string()).max(20).catch([]),
  dailyMinutes: z.number().int().min(5).max(240).catch(30),
  textScale: z.union([z.literal(1), z.literal(1.15), z.literal(1.3)]).catch(1),
  dyslexiaFont: z.boolean().catch(false),
  highContrast: z.boolean().catch(false),
  readAloudAuto: z.boolean().catch(false),
  signLanguageChoice: z.enum(SIGN_LANGUAGES).nullable().catch(null),
});
export type ImportChild = z.infer<typeof ImportChild>;

export const ImportProgress = z
  .object({ child_id: Id, lesson_id: z.string().min(1).max(120), best_score: z.number().int().min(0).max(200), total: z.number().int().min(1).max(200), attempts: z.number().int().min(1).max(10_000), completed_at: Iso, review_due: Iso })
  .refine((p) => p.best_score <= p.total, "score above total");
export const ImportMessage = z.object({
  child_id: Id,
  lesson_id: z.string().min(1).max(120),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(IMPORT_MAX_MESSAGE_CHARS),
  flagged: z.enum(["personal_info", "wellbeing", "unsafe_reply", "answer_leak", "refusal", "error"]).nullable().catch(null),
  created_at: Iso,
});
export const ImportSpelling = z.object({ child_id: Id, word: z.string().regex(/^[a-z]{2,20}$/), box: z.number().int().min(0).max(10), due: Day, last_day: Day.nullable().catch(null) });
export const ImportGame = z.object({ child_id: Id, game: z.enum(["sudoku", "chess"]), puzzle_key: z.string().regex(/^[\w:.-]{1,80}$/), solved_at: Iso, hint_chains: z.number().int().min(0).max(10_000).catch(0) });
export const ImportLesson = z.object({ id: Id }).passthrough();

/** The file itself: an object with a list of children. Everything else is optional and checked row by row. */
export const ImportFile = z.object({
  format: z.literal("honest-learn-export").optional(),
  version: z.number().int().min(1).max(1).optional(),
  children: z.array(z.unknown()).max(IMPORT_MAX_ROWS.children),
  progress: z.array(z.unknown()).max(IMPORT_MAX_ROWS.progress).default([]),
  tutorMessages: z.array(z.unknown()).max(IMPORT_MAX_ROWS.messages).default([]),
  spellingProgress: z.array(z.unknown()).max(IMPORT_MAX_ROWS.spelling).default([]),
  gamesSolved: z.array(z.unknown()).max(IMPORT_MAX_ROWS.games).default([]),
  familyLessons: z.array(z.unknown()).max(IMPORT_MAX_ROWS.lessons).default([]),
});
export type ImportFile = z.infer<typeof ImportFile>;

/** Keeps the rows that pass `schema`; counts the rest. */
export function validRows<T>(rows: unknown[], schema: z.ZodType<T>): { rows: T[]; dropped: number } {
  const out: T[] = [];
  let dropped = 0;
  for (const r of rows) {
    const p = schema.safeParse(r);
    if (p.success) out.push(p.data);
    else dropped++;
  }
  return { rows: out, dropped };
}

/** A family's own topics, narrowed to the ones that exist. */
export const knownTopics = (topics: string[]): string[] => [...new Set(topics.filter((t): t is (typeof TOPICS)[number] => (TOPICS as readonly string[]).includes(t)))];

/** What the import tells the parent: what came across, what did not, and why. */
export interface ImportReport {
  imported: { sourceId: string; id: string; nickname: string; progress: number; spelling: number; games: number; chats: number }[];
  skipped: { sourceId: string | null; nickname: string | null; reason: "already_here" | "invalid" | "not_chosen" | "no_room" }[];
  lessons: { added: number; reused: number; skipped: number };
  /** Rows left out because they were damaged or refer to a lesson, word or game this version does not know. */
  dropped: { progress: number; chats: number; spelling: number; games: number };
  /** Things that were deliberately not brought over, in words a parent can read. */
  notes: string[];
}

export const NOT_RESTORED_NOTES = [
  "Hoot is switched off for the children you brought over. Turn it on in each child's settings once you have read about the AI helper this place uses.",
  "Questions your child had already answered start again, so that answers are earned here too.",
  "Your own AI model and key are not part of a download. Set them up again in Hoot's AI if you used one.",
];
