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
   * The same happens in local development. Only automated tests (NODE_ENV=test or an in-memory database) use a
   * fixed secret, so a forgotten setting on a real host can never leave tokens signed with a public string.
   */
  tokenSecret:
    process.env.TOKEN_SECRET ||
    (process.env.NODE_ENV === "test" || process.env.DB_PATH === ":memory:" ? "test-only-secret-never-used-on-a-real-host" : ""),
  /** Show lessons with status "draft". On before launch (everything is a draft); off after LAUNCH=true. */
  showDrafts: env("SHOW_DRAFTS", launched ? "false" : "true") === "true",
  /** Other websites allowed to call the API. Open before launch; after LAUNCH=true only the origins you list (none by default: the website and API share one address). */
  corsOrigins: env("CORS_ORIGINS", launched ? "" : "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Parents must verify their email before adding children. On by default in production. */
  requireEmailVerification: env("REQUIRE_EMAIL_VERIFICATION", launched ? "true" : "false") === "true",
  /** Trust X-Forwarded-For (only behind a reverse proxy you control). Vercel sets it to the real client IP. */
  trustProxy: env("TRUST_PROXY", isVercel ? "true" : "false") === "true",
  /** Hoot chats are deleted after this many days. */
  chatRetentionDays: Number(env("CHAT_RETENTION_DAYS", "365")),

  tutor: {
    /**
     * "claude" calls the Claude API (ANTHROPIC_API_KEY). "openai" calls any OpenAI-compatible server: a free local
     * model in Ollama or LM Studio, or a hosted one (LLM_BASE_URL, LLM_MODEL, optional LLM_API_KEY; see
     * docs/FREE_AGENTS.md). "mock" uses the lesson's pre-written hints and needs no AI at all.
     */
    mode: env("TUTOR_MODE", process.env.ANTHROPIC_API_KEY ? "claude" : process.env.LLM_BASE_URL || process.env.LLM_MODEL ? "openai" : "mock") as
      | "claude"
      | "openai"
      | "mock",
    /** Settings for TUTOR_MODE=openai. The default address is Ollama on this computer. */
    openai: {
      baseUrl: env("LLM_BASE_URL", "http://localhost:11434/v1"),
      apiKey: process.env.LLM_API_KEY ?? "",
      model: env("LLM_MODEL", "llama3.2"),
      /** Model for the second safety check; defaults to the same model. A stronger one here is the best upgrade. */
      safetyModel: env("LLM_SAFETY_MODEL", process.env.LLM_MODEL ?? "llama3.2"),
      /** Local models on a laptop can be slow: wait up to this long for each call. */
      timeoutMs: Number(env("LLM_TIMEOUT_MS", "60000")),
    },
    model: env("TUTOR_MODEL", "claude-sonnet-5-5"),
    /** Model used to double-check every tutor reply for safety and answer leaks. */
    safetyModel: env("TUTOR_SAFETY_MODEL", "claude-opus-5-5"),
    effort: env("TUTOR_EFFORT", "low") as "low" | "medium" | "high",
    dailyMessageLimit: Number(env("TUTOR_DAILY_LIMIT", "40")),
    maxMessageChars: 500,
    /** Replies are at most ~120 words; the safety verdict is a short JSON object. Generous caps, far below the old 16000. */
    maxReplyTokens: Number(env("TUTOR_MAX_REPLY_TOKENS", "1000")),
    maxCheckTokens: Number(env("TUTOR_MAX_CHECK_TOKENS", "400")),
  },

  security: {
    pinMaxAttempts: 5,
    pinLockMinutes: 15,
    loginMaxAttempts: 8,
    loginLockMinutes: 15,
    /** Repeated lockouts last longer: the Nth lockout in a row lasts (lock minutes × this step). A successful sign-in or PIN resets it. 15 min, 1 h, 6 h, 24 h. */
    lockEscalation: [1, 4, 24, 96],
    familyTokenDays: 30,
    parentTokenMinutes: 10,
    codeMinutes: 15,
    codeMaxAttempts: 5,
    /** Requests per IP per window on /auth/* routes. */
    authRateLimit: Number(env("AUTH_RATE_LIMIT", "30")),
    authRateWindowMinutes: 10,
  },
};
