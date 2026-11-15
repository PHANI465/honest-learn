// Shared shapes for the API: database rows, input validation and small pure helpers.
import { z } from "zod";
import { ageFromBirthYear, bandForAge, type BandId } from "./security.ts";
import { defaultSignLanguage, defaultSpellingVariant, SIGN_LANGUAGES, SPELLING_VARIANTS, type ContentStore, type Lesson, type SignLanguage, type SpellingVariant } from "./content.ts";

/** Bump when the privacy notice changes: sign-up must accept the current version. */
export const CONSENT_VERSION = "2026-11-v1";

export interface ParentRow {
  id: string;
  email: string;
  password_hash: string;
  pin_hash: string;
  pin_failed: number;
  pin_locked_until: string | null;
  login_failed: number;
  login_locked_until: string | null;
  email_verified_at: string | null;
  country: string | null;
  /** "uk" or "us", or null for "decided by the country" (see content.ts defaultSpellingVariant). */
  spelling_variant?: string | null;
  token_version: number | null;
  /** Standalone mode only: hash of the recovery phrase. */
  recovery_hash?: string | null;
  /** Lockouts in a row (no correct PIN or password since). */
  pin_lock_level?: number;
  login_lock_level?: number;
  consent_at: string;
  created_at: string;
}

export interface ChildRow {
  id: string;
  parent_id: string;
  nickname: string;
  birth_year: number;
  avatar: string;
  band_override: string | null;
  unlocked_topics: string;
  ai_enabled: number;
  daily_minutes: number;
  text_scale: number;
  dyslexia_font: number;
  high_contrast: number;
  read_aloud_auto: number;
  /** When the parent last confirmed seeing this child's wellbeing alerts. */
  wellbeing_seen_at?: string | null;
  /** The sign language the parent chose, or null for "decided by the family's country". */
  sign_language?: string | null;
  /** The parent's country, joined in when a child is loaded (ctx.getChild, ctx.listChildren). */
  parent_country?: string | null;
  /** The parent's spelling choice, joined in the same way. */
  parent_spelling_variant?: string | null;
  /** The child's id in the data download this child was imported from (routes/parent-import.ts), if any. */
  imported_from?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------- input rules
export const Email = z.string().trim().toLowerCase().email().max(200);
export const Pin = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");
/** ISO 3166-1 alpha-2 country code, e.g. "IN", "US", "GB". */
export const Country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choose a country from the list");
export const Password = z.string().min(8, "Password must be at least 8 characters").max(200);
/** A recovery phrase as typed: spaces, dashes and lower case are fine (see normaliseRecoveryPhrase). */
export const RecoveryPhrase = z.string().trim().min(10, "Type the whole recovery phrase").max(100);
/** A password or PIN being checked (not set): bounded so huge inputs never reach the hash function. */
export const Secret = z.string().max(200);
export const Code = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");
export const AVATARS = ["owl", "fox", "cat", "dog", "panda", "turtle", "rabbit", "lion"] as const;
export const TOPICS = ["religion", "body", "politics"] as const;

const thisYear = () => new Date().getFullYear();
export const BirthYear = z
  .number()
  .int()
  .refine((y) => {
    const age = thisYear() - y;
    return age >= 3 && age <= 18;
  }, "Honest Learn is for ages 3–18");

export const ChildCreate = z.object({
  nickname: z.string().trim().min(1).max(30),
  birthYear: BirthYear,
  avatar: z.enum(AVATARS).default("owl"),
});
export const ChildPatch = z.object({
  nickname: z.string().trim().min(1).max(30).optional(),
  birthYear: BirthYear.optional(),
  avatar: z.enum(AVATARS).optional(),
  bandOverride: z.enum(["b1", "b2", "b3", "b4", "b5"]).nullable().optional(),
  unlockedTopics: z.array(z.enum(TOPICS)).max(TOPICS.length * 2).optional(),
  aiEnabled: z.boolean().optional(),
  dailyMinutes: z.number().int().min(5).max(240).optional(),
  /** Reading and display: text size 1, 1.15 or 1.3 times, dyslexia-friendly font, high contrast, read lessons aloud. */
  textScale: z.union([z.literal(1), z.literal(1.15), z.literal(1.3)]).optional(),
  dyslexiaFont: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  readAloudAuto: z.boolean().optional(),
  /** The sign language this child learns; null goes back to "decided by the family's country". */
  signLanguage: z.enum(SIGN_LANGUAGES).nullable().optional(),
});

/** A quiz answer list: one on-screen position per question. */
export const Choices = z.array(z.number().int()).max(100);

export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "day must be YYYY-MM-DD");
/** The child's local date may be up to a day either side of UTC. */
export function plausibleDay(day: string): boolean {
  const diff = Math.abs(Date.parse(day + "T12:00:00Z") - Date.now());
  return Number.isFinite(diff) && diff <= 1.6 * 86_400_000;
}

// ---------------------------------------------------------------- children
export function childBand(c: ChildRow): BandId {
  return (c.band_override as BandId | null) ?? bandForAge(ageFromBirthYear(c.birth_year));
}

/** The sign language this child sees lessons in: the parent's choice, else the one the family's country suggests, else none. */
export function childSignLanguage(c: ChildRow): SignLanguage | null {
  const chosen = (SIGN_LANGUAGES as readonly string[]).includes(c.sign_language ?? "") ? (c.sign_language as SignLanguage) : null;
  return chosen ?? defaultSignLanguage(c.parent_country);
}

/** The spelling a family uses: the parent's choice, else the one the family's country suggests, else null (words that differ are left out). */
export function spellingVariantFor(choice: string | null | undefined, country: string | null | undefined): SpellingVariant | null {
  const chosen = (SPELLING_VARIANTS as readonly string[]).includes(choice ?? "") ? (choice as SpellingVariant) : null;
  return chosen ?? defaultSpellingVariant(country);
}
export const childSpellingVariant = (c: ChildRow): SpellingVariant | null => spellingVariantFor(c.parent_spelling_variant, c.parent_country);

/** What the app sees about a child (never the parent id or raw flags). */
export function childPublic(c: ChildRow) {
  const band = childBand(c);
  return {
    id: c.id,
    nickname: c.nickname,
    birthYear: c.birth_year,
    age: ageFromBirthYear(c.birth_year),
    avatar: c.avatar,
    band,
    bandOverride: c.band_override,
    unlockedTopics: JSON.parse(c.unlocked_topics) as string[],
    // Chat is never available to the youngest band, whatever the setting.
    aiEnabled: c.ai_enabled === 1 && band !== "b1",
    aiAllowedForAge: band !== "b1",
    dailyMinutes: c.daily_minutes,
    textScale: c.text_scale ?? 1,
    dyslexiaFont: c.dyslexia_font === 1,
    highContrast: c.high_contrast === 1,
    readAloudAuto: c.read_aloud_auto === 1,
    /** What lessons use now (the choice, or the country's default, or null), and the choice itself (null = automatic). */
    signLanguage: childSignLanguage(c),
    signLanguageChoice: (SIGN_LANGUAGES as readonly string[]).includes(c.sign_language ?? "") ? c.sign_language : null,
  };
}

/** Days until a finished lesson should come back for a quick review (spaced repetition). */
export function reviewIntervalDays(score: number, total: number, attempts: number): number {
  if (score < total) return 1;
  return Math.min(3 * 2 ** (attempts - 1), 30);
}

// ---------------------------------------------------------------- what a child knows
export type OutcomeStatus = "not_started" | "practising" | "strong";

/**
 * Where a child stands on every knowledge-map outcome for their age group, from lesson progress.
 * Only lessons visible to the child count (so locked sensitive lessons never show up), and outcomes
 * tagged with a sensitive topic are left out until a parent unlocks that topic.
 *  - strong: a lesson covering it was finished with every question right on the first try
 *  - practising: a lesson covering it was attempted, but none with a perfect score yet
 *  - not_started: no visible lesson covering it has been attempted
 */
export function outcomeStatuses(
  content: ContentStore,
  child: ChildRow,
  progress: { lesson_id: string; best_score: number; total: number }[],
  visibleTo: (child: ChildRow, lesson: Lesson) => boolean,
) {
  const band = childBand(child);
  const unlocked = JSON.parse(child.unlocked_topics) as string[];
  const done = new Map(progress.map((p) => [p.lesson_id, p]));
  const status = new Map<string, OutcomeStatus>();
  const lessonCount = new Map<string, number>();
  for (const l of content.lessons.values()) {
    if (!visibleTo(child, l)) continue;
    const p = done.get(l.id);
    const s: OutcomeStatus | null = !p ? null : p.total > 0 && p.best_score >= p.total ? "strong" : "practising";
    for (const o of l.outcomes) {
      lessonCount.set(o, (lessonCount.get(o) ?? 0) + 1);
      if (s && status.get(o) !== "strong") status.set(o, s);
    }
  }
  const subjectName = new Map(content.map.subjects.map((s) => [s.id, s.name]));
  const outcomes = content.map.cells
    .filter((cell) => cell.band === band)
    .flatMap((cell) =>
      cell.outcomes
        .filter((o) => !o.sensitive || unlocked.includes(o.sensitive))
        .map((o) => ({
          id: o.id,
          text: o.text,
          subject: cell.subject,
          subjectName: subjectName.get(cell.subject) ?? cell.subject,
          status: status.get(o.id) ?? ("not_started" as OutcomeStatus),
          lessons: lessonCount.get(o.id) ?? 0,
        })),
    );
  return { outcomes, status };
}
