// Settings come from the platform (platform.ts): the environment variables on a server, what the app passes in on a phone.
import { pf } from "./platform.ts";

const ENV = pf().env;

function env(name: string, fallback?: string): string {
  const v = ENV[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

const isProd = ENV.NODE_ENV === "production";
/**
 * Pre-launch (the default until LAUNCH=true): the deployment works with zero settings for owners and
 * reviewers: draft lessons are shown, email verification is off and codes are written to the logs.
 * Set LAUNCH=true for the public launch to switch back to the strict defaults.
 */
const launched = ENV.LAUNCH === "true";
/** Vercel sets VERCEL=1 in its builds and functions. */
const isVercel = !!ENV.VERCEL;

export const config = {
  isProd,
  isVercel,
  launched,
  port: Number(env("PORT", "8787")),
  /** SQLite file path. Use ":memory:" for tests. */
  dbPath: env("DB_PATH", pf().defaultPaths.db),
  /** Postgres connection string. When set, it is used instead of SQLite. The Neon integration on Vercel sets these. */
  databaseUrl: ENV.DATABASE_URL || ENV.POSTGRES_URL || "",
  contentDir: env("CONTENT_DIR", pf().defaultPaths.content),
  /**
   * Secret used to sign session tokens. Set TOKEN_SECRET to control it. If it's missing in production or on
   * Vercel, a strong random secret is generated once and kept in the database (see ensureTokenSecret in app.ts).
   * The same happens in local development. Only automated tests (NODE_ENV=test or an in-memory database) use a
   * fixed secret, so a forgotten setting on a real host can never leave tokens signed with a public string.
   */
  tokenSecret:
    ENV.TOKEN_SECRET ||
    (ENV.NODE_ENV === "test" || ENV.DB_PATH === ":memory:" ? "test-only-secret-never-used-on-a-real-host" : ""),
  /**
   * Secret for encrypting families' own AI keys (see ai-settings.ts). Falls back to the token secret. Set it in the environment on a
   * real host: when the token secret is the auto-generated one, it lives in the database next to the encrypted keys.
   */
  aiKeySecret: ENV.AI_KEY_SECRET || "",
  /** Whether a family's own model may be on this machine or the local network (http://localhost, 192.168.x ...). Never on Vercel. */
  allowLocalLlm: isVercel ? false : env("ALLOW_LOCAL_LLM", "true") === "true",
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
    mode: env("TUTOR_MODE", ENV.ANTHROPIC_API_KEY ? "claude" : ENV.LLM_BASE_URL || ENV.LLM_MODEL ? "openai" : "mock") as
      | "claude"
      | "openai"
      | "mock",
    /** Settings for TUTOR_MODE=openai. The default address is Ollama on this computer. */
    openai: {
      baseUrl: env("LLM_BASE_URL", "http://localhost:11434/v1"),
      apiKey: ENV.LLM_API_KEY ?? "",
      model: env("LLM_MODEL", "llama3.2"),
      /** Model for the second safety check; defaults to the same model. A stronger one here is the best upgrade. */
      safetyModel: env("LLM_SAFETY_MODEL", ENV.LLM_MODEL ?? "llama3.2"),
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
    /**
     * Standalone mode only (the app on one phone): after this many lockouts in a row the PIN can only be reset with the password,
     * and the password only with the recovery phrase. On a phone the clock belongs to whoever holds it, so time-based lockouts
     * alone would let someone keep guessing by moving the clock forward. 2 lockouts = 10 wrong PINs or 16 wrong passwords.
     */
    deviceLockoutsBeforeReset: 2,
    familyTokenDays: 30,
    parentTokenMinutes: 10,
    codeMinutes: 15,
    codeMaxAttempts: 5,
    /** Requests per IP per window on /auth/* routes. */
    authRateLimit: Number(env("AUTH_RATE_LIMIT", "30")),
    authRateWindowMinutes: 10,
  },
};
