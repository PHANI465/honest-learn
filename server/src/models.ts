// Shared shapes for the API: database rows, input validation and small pure helpers.
import { z } from "zod";
import { ageFromBirthYear, bandForAge, type BandId } from "./security.ts";

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
  token_version: number | null;
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
  created_at: string;
}

// ---------------------------------------------------------------- input rules
export const Email = z.string().trim().toLowerCase().email().max(200);
export const Pin = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");
/** ISO 3166-1 alpha-2 country code, e.g. "IN", "US", "GB". */
export const Country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choose a country from the list");
export const Password = z.string().min(8, "Password must be at least 8 characters").max(200);
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
  };
}

/** Days until a finished lesson should come back for a quick review (spaced repetition). */
export function reviewIntervalDays(score: number, total: number, attempts: number): number {
  if (score < total) return 1;
  return Math.min(3 * 2 ** (attempts - 1), 30);
}
