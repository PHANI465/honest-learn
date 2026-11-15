// Thin typed client for the Honest Learn API (see server/src/app.ts).

import { localRequest } from "./local-backend";
import { apiBase, isDeviceMode } from "./server";

/** The server address: chosen on a phone (see lib/server.ts), built in, or localhost for the website and development. */
export { apiBase };

export type BandId = "b1" | "b2" | "b3" | "b4" | "b5";
/** Sign languages the app can teach (task T9). Lessons exist only once a person has chosen and approved the videos. */
export type SignLanguageId = "asl" | "bsl" | "isl" | "lsm";
export const SIGN_LANGUAGE_NAMES: Record<SignLanguageId, string> = {
  asl: "American Sign Language (ASL)",
  bsl: "British Sign Language (BSL)",
  isl: "Indian Sign Language (ISL)",
  lsm: "Mexican Sign Language (LSM)",
};
export type Topic = "religion" | "body" | "politics";

export interface Child {
  id: string;
  nickname: string;
  birthYear: number;
  age: number;
  avatar: string;
  band: BandId;
  bandOverride: BandId | null;
  unlockedTopics: Topic[];
  aiEnabled: boolean;
  aiAllowedForAge: boolean;
  dailyMinutes: number;
  /** Reading and display (parent chooses): see lib/theme.ts. */
  textScale: number;
  dyslexiaFont: boolean;
  highContrast: boolean;
  readAloudAuto: boolean;
  /** The sign language this child's lessons use now (the parent's choice, else the family's country's default, else none). */
  signLanguage: SignLanguageId | null;
  /** The parent's own choice; null means "decided by the family's country". */
  signLanguageChoice: SignLanguageId | null;
}

export interface Band {
  id: BandId;
  name: string;
  ages: [number, number];
  ai: string;
  sessionMinutes: number;
}

export interface Subject {
  id: string;
  name: string;
  icon: string;
  lessonCount: number;
  completed: number;
}

export interface LessonSummary {
  id: string;
  title: string;
  band: BandId;
  subject: string;
  sensitive: Topic | null;
  minutes: number;
  status: "draft" | "reviewed";
  /** A lesson the family added themselves (private to them, never reviewed). */
  family?: boolean;
  questions: number;
  progress?: { best_score: number; total: number } | null;
}

/** A lesson the home screen gently suggests ("Try next"). */
export interface SuggestedLesson extends LessonSummary {
  reason: "review" | "new" | "practise";
}

export type OutcomeStatus = "not_started" | "practising" | "strong";

/** Parent view of what a child knows: one knowledge-map outcome and where they are with it. */
export interface OutcomeItem {
  id: string;
  text: string;
  subject: string;
  subjectName: string;
  status: OutcomeStatus;
  lessons: number;
}

export interface OutcomesResponse {
  band: BandId;
  subjects: { id: string; name: string; strong: number; practising: number; notStarted: number }[];
  outcomes: OutcomeItem[];
}

export interface Lesson extends Omit<LessonSummary, "questions" | "progress"> {
  outcomes: string[];
  sources: { title: string; url: string; license: string }[];
  sections: { type: "text" | "tryit" | "parent" | "fact" | "video"; body: string; videoId?: string; videoMinutes?: number }[];
  /** A video of this whole lesson in sign language, when one exists. */
  signVideoId?: string;
  quiz: { q: string; options: string[] }[];
}

export interface FreeResource {
  id: string;
  name: string;
  url: string;
  description: string;
  subjects: string[];
  account: string;
}

export type LearnMore =
  | { available: false; reason: string }
  | { available: true; title: string; extract: string; url: string; source: string; license: string; opensWithParentPin: boolean };

export interface ContentMap {
  version: string;
  bands: Band[];
  subjects: { id: string; name: string; icon: string; bands?: string[] }[];
  sensitiveTopics: Record<Topic, string>;
  consentVersion: string;
  /** Sign languages that have at least one lesson. The sign language setting is shown only when this is not empty. */
  signLanguages?: SignLanguageId[];
  /** false on test sites where emails only go to the server log. */
  emailSending?: boolean;
  launched?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  flagged: string | null;
  created_at: string;
  lessonTitle?: string;
  lesson_id?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public body: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** Friendly, honest messages for every error code the API can return. */
export function friendly(err: unknown): string {
  if (!(err instanceof ApiError)) return "We couldn't reach Honest Learn. Check your internet connection and try again.";
  const map: Record<string, string> = {
    invalid_input: ((err.body.details as string[] | undefined) ?? ["Please check the form."]).join(" "),
    email_taken: "An account with this email already exists. Try signing in.",
    wrong_email_or_password: "That email and password don't match.",
    too_many_attempts: "Too many tries. Please wait 15 minutes and try again.",
    wrong_password: "That password isn't right.",
    too_many_reports: "You've sent a lot of reports today. Thank you. Please try again tomorrow.",
    wrong_pin: `Wrong PIN. ${err.body.attemptsLeft ?? 0} tries left.`,
    parent_pin_required: "A parent needs to enter their PIN.",
    needs_parent_permission: "This lesson needs a parent's permission.",
    ai_not_available_for_age: "Hoot the helper is for ages 6 and up.",
    ai_turned_off_by_parent: "Hoot is switched off. Ask a parent.",
    daily_limit_reached: "You've asked Hoot lots today! Try again tomorrow. 🌙",
    not_signed_in: "Please sign in again.",
    too_many_children: "You can add up to 8 children.",
    answer_every_question: "Answer every question first.",
    wrong_code: "That code isn't right. Check the latest email from us.",
    code_expired: "That code has expired. Ask for a new one.",
    email_not_verified: "Please verify your email first (check your inbox for a 6-digit code).",
    wait_a_minute: "We just sent a code. Please wait a minute before asking again.",
    not_found: "We couldn't find that.",
    hint_out_of_order: "Open the hints one at a time, starting with the first.",
    too_large: "That's too big to send in one go. When moving a family, choose one child at a time, or leave out the Hoot chats.",
    wrong_recovery_phrase: "That email and recovery phrase don't match.",
    not_on_this_device: "This needs email, which the app doesn't use when it runs on this phone only.",
    pin_reset_needed: "Too many wrong PINs. Tap \"Forgot your PIN?\" and use your account password to set a new one.",
    password_reset_needed: "Too many wrong passwords. Use \"Forgot password?\" and your recovery phrase to set a new one.",
    phone_has_family: "This phone already has a family account. Sign in instead. To start again, delete the old account in the parent area (it needs the password).",
    device_storage_error: "The app couldn't read its own storage on this phone. Close the app and open it again.",
    not_a_download: "That is not a Honest Learn data download. Use the file from \"Download all our data\".",
    file_too_big: "That file holds more than a family can have, so nothing was added.",
  };
  return map[err.code] ?? "Something went wrong. Please try again.";
}

type ReachabilityListener = (reachable: boolean) => void;
const reachability = new Set<ReachabilityListener>();
/** Called after every request with whether the API could be reached (used by offline mode). */
export function onReachability(fn: ReachabilityListener): () => void {
  reachability.add(fn);
  return () => reachability.delete(fn);
}
const report = (reachable: boolean) => reachability.forEach((fn) => fn(reachable));

export async function api<T>(method: string, path: string, token?: string | null, body?: unknown): Promise<T> {
  let res: Response;
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  if (isDeviceMode()) {
    // Standalone mode: the API inside the app answers (lib/local-backend.native.ts). There is no network to lose.
    try {
      res = await localRequest(path, init);
    } catch (e) {
      console.error("the app's own database could not answer", e);
      throw new ApiError(500, "device_storage_error", {});
    }
    report(true);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new ApiError(res.status, String(json.error ?? "server_error"), json);
    return json as T;
  }
  try {
    res = await fetch(apiBase() + path, init);
  } catch {
    report(false);
    throw new Error("network");
  }
  // A gateway error means the server itself is unreachable (e.g. a proxy in front of it is up but the API isn't).
  report(res.status !== 502 && res.status !== 503 && res.status !== 504);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(json.error ?? "server_error"), json);
  return json as T;
}

/**
 * One request to a particular server, whatever the app itself is using (a phone that keeps its data on the device, or another
 * server). Used only by the transfer screen (app/parent/transfer.tsx) to move a family between two places. Nothing is remembered:
 * the caller holds the sign-in for the length of the transfer and then drops it.
 */
export async function apiAt<T>(base: string, method: string, path: string, token?: string | null, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("network");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(json.error ?? "server_error"), json);
  return json as T;
}
