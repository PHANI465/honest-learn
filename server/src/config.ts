import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  isProd,
  port: Number(env("PORT", "8787")),
  /** SQLite file path. Use ":memory:" for tests. */
  dbPath: env("DB_PATH", resolve(here, "../data/honest-learn.db")),
  contentDir: env("CONTENT_DIR", resolve(here, "../../content")),
  /** Secret used to sign session tokens. MUST be set in production. */
  tokenSecret: isProd ? env("TOKEN_SECRET") : env("TOKEN_SECRET", "dev-only-insecure-secret-change-me"),
  /** Show lessons with status "draft". Never enable in production for the public. */
  showDrafts: env("SHOW_DRAFTS", isProd ? "false" : "true") === "true",
  corsOrigins: env("CORS_ORIGINS", "*").split(",").map((s) => s.trim()),

  tutor: {
    /** "claude" calls the Claude API; "mock" uses the lesson's pre-written hints (for dev/tests). */
    mode: env("TUTOR_MODE", process.env.ANTHROPIC_API_KEY ? "claude" : "mock") as "claude" | "mock",
    model: env("TUTOR_MODEL", "claude-opus-5-5"),
    /** Model used to double-check every tutor reply for safety and answer leaks. */
    safetyModel: env("TUTOR_SAFETY_MODEL", "claude-opus-5-5"),
    effort: env("TUTOR_EFFORT", "low") as "low" | "medium" | "high",
    dailyMessageLimit: Number(env("TUTOR_DAILY_LIMIT", "40")),
    maxMessageChars: 500,
  },

  security: {
    pinMaxAttempts: 5,
    pinLockMinutes: 15,
    loginMaxAttempts: 8,
    loginLockMinutes: 15,
    familyTokenDays: 30,
    parentTokenMinutes: 10,
  },
};
