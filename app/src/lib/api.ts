// Thin typed client for the Honest Learn API (see server/src/app.ts).

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

export type BandId = "b1" | "b2" | "b3" | "b4" | "b5";
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
  questions: number;
  progress?: { best_score: number; total: number } | null;
}

export interface Lesson extends Omit<LessonSummary, "questions" | "progress"> {
  outcomes: string[];
  sources: { title: string; url: string; license: string }[];
  sections: { type: "text" | "tryit" | "parent" | "fact"; body: string }[];
  quiz: { q: string; options: string[] }[];
}

export interface ContentMap {
  version: string;
  bands: Band[];
  subjects: { id: string; name: string; icon: string; bands?: string[] }[];
  sensitiveTopics: Record<Topic, string>;
  consentVersion: string;
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
    wrong_pin: `Wrong PIN. ${err.body.attemptsLeft ?? 0} tries left.`,
    parent_pin_required: "A parent needs to enter their PIN.",
    needs_parent_permission: "This lesson needs a parent's permission.",
    ai_not_available_for_age: "Hoot the helper is for ages 6 and up.",
    ai_turned_off_by_parent: "Hoot is switched off. Ask a parent.",
    daily_limit_reached: "You've asked Hoot lots today! Try again tomorrow. 🌙",
    not_signed_in: "Please sign in again.",
    too_many_children: "You can add up to 8 children.",
    answer_every_question: "Answer every question first.",
  };
  return map[err.code] ?? "Something went wrong. Please try again.";
}

export async function api<T>(method: string, path: string, token?: string | null, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
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
