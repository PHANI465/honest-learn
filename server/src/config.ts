import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === "production";
/**
 * Pre-launch (the default until LAUNCH=true): the deployment works with zero settings for owners and
 * reviewers: draft lessons are shown, email verification is off and codes are written to the logs.
 * Set LAUNCH=true for the public launch to switch back to the strict defaults.
 */
const launched = process.env.LAUNCH === "true";
/** Vercel sets VERCEL=1 in its builds and functions. */
const isVercel = !!process.env.VERCEL;

export const config = {
  isProd,
  isVercel,
  launched,
  port: Number(env("PORT", "8787")),
  /** SQLite file path. Use ":memory:" for tests. */
  dbPath: env("DB_PATH", resolve(here, "../data/honest-learn.db")),
  /** Postgres connection string. When set, it is used instead of SQLite. The Neon integration on Vercel sets these. */
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
  contentDir: env("CONTENT_DIR", resolve(here, "../../content")),
  /**
   * Secret used to sign session tokens. Set TOKEN_SECRET to control it. If it's missing in production or on
   * Vercel, a strong random secret is generated once and kept in the database (see ensureTokenSecret in app.ts).
   * Local development falls back to a fixed dev secret.
   */
  tokenSecret: process.env.TOKEN_SECRET || (isProd || isVercel ? "" : "dev-only-insecure-secret-change-me"),
  /** Show lessons with status "draft". On before launch (everything is a draft); off after LAUNCH=true. */
  showDrafts: env("SHOW_DRAFTS", launched ? "false" : "true") === "true",
  corsOrigins: env("CORS_ORIGINS", "*").split(",").map((s) => s.trim()),
  /** Parents must verify their email before adding children. On by default in production. */
  requireEmailVerification: env("REQUIRE_EMAIL_VERIFICATION", launched ? "true" : "false") === "true",
  /** Trust X-Forwarded-For (only behind a reverse proxy you control). Vercel sets it to the real client IP. */
  trustProxy: env("TRUST_PROXY", isVercel ? "true" : "false") === "true",
  /** Hoot chats are deleted after this many days. */
  chatRetentionDays: Number(env("CHAT_RETENTION_DAYS", "365")),

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
    codeMinutes: 15,
    codeMaxAttempts: 5,
    /** Requests per IP per window on /auth/* routes. */
    authRateLimit: Number(env("AUTH_RATE_LIMIT", "30")),
    authRateWindowMinutes: 10,
  },
};
