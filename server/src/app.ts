// The Honest Learn API. createApp() wires shared protections and the route modules together:
//
//   routes/public.ts   /health, /content/*                       no sign-in
//   routes/auth.ts     /auth/*                                   sign up, sign in, codes, PIN unlock
//   routes/learn.ts    /family, /children/:id/lessons, quizzes  family token (the signed-in device)
//   routes/puzzles.ts  /children/:id/puzzles/*                   family token
//   routes/spelling.ts /children/:id/spelling/*                  family token
//   routes/games.ts    /children/:id/games/*                     family token
//   routes/usage.ts    /children/:id/usage*                      family token
//   routes/tutor.ts    /children/:id/tutor/*, /reports           family token
//   routes/parent.ts   /parent/*                                 parent token (from the PIN, 10 minutes)
//   routes/parent-ai.ts /parent/ai*                              parent token; saving also needs the account password
//
// Shared helpers (sign-in checks, hint ladder, attempt limits, email codes) live in context.ts.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { toBase64 } from "./bytes.ts";
import { config } from "./config.ts";
import { pf } from "./platform.ts";
import type { DB } from "./db.ts";
import type { ContentStore } from "./content.ts";
import type { TutorProvider } from "./tutor.ts";
import { WikiClient } from "./wiki.ts";
import { createMailer, NoMailer, type Mailer } from "./mailer.ts";
import { createContext, type Env } from "./context.ts";
import { publicRoutes } from "./routes/public.ts";
import { authRoutes } from "./routes/auth.ts";
import { learnRoutes } from "./routes/learn.ts";
import { puzzleRoutes } from "./routes/puzzles.ts";
import { spellingRoutes } from "./routes/spelling.ts";
import { gameRoutes } from "./routes/games.ts";
import { usageRoutes } from "./routes/usage.ts";
import { tutorRoutes } from "./routes/tutor.ts";
import { parentRoutes } from "./routes/parent.ts";
import { parentAiRoutes } from "./routes/parent-ai.ts";

export { CONSENT_VERSION, reviewIntervalDays } from "./models.ts";

/** Largest request body accepted (the biggest real one, a Hoot message or report, is well under 4 KB). */
const MAX_BODY_BYTES = 32 * 1024;

export function createApp(deps: {
  db: DB;
  content: ContentStore;
  tutor: TutorProvider;
  wiki?: WikiClient;
  mailer?: Mailer;
  /**
   * True when the API runs inside the app itself (standalone mode, task T8): requests come from the same program, never from
   * another website, so there is no cross-origin access to control and CORS is left out.
   */
  device?: boolean;
}) {
  // Standalone mode has no email: verification, password reset and the wellbeing email are replaced (routes/auth.ts, the parent-area notice).
  const ctx = createContext({ ...deps, wiki: deps.wiki ?? new WikiClient(), mailer: deps.mailer ?? (deps.device ? new NoMailer() : createMailer()) });
  const { db } = ctx;
  const app = new Hono<Env>();

  // ---------------------------------------------------------------- shared protections
  // Middleware must not touch c.res before next() or call c.header() after it: Hono then rebuilds the response from
  // response.body, a stream React Native's Response does not have, and the body is lost on a phone (found by T8a's proof).
  if (!deps.device) app.use("*", cors({ origin: config.corsOrigins.includes("*") ? "*" : config.corsOrigins }));
  app.use(
    "*",
    secureHeaders({
      // JSON only: nothing here should ever run as a page, be framed or be sniffed as another type.
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      crossOriginResourcePolicy: false, // the native apps and local development call the API cross-origin
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("cache-control", "no-store"); // family data must never sit in shared or browser caches
  });
  app.use("*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "too_large" }, 413) }));

  // No TOKEN_SECRET configured (zero-config deploy): generate one once and keep it in the database,
  // so sign-ins survive restarts and every instance agrees. Race-safe: first writer wins.
  let secretReady: Promise<void> | null = null;
  const ensureTokenSecret = () =>
    (secretReady ??= (async () => {
      if (config.tokenSecret) return;
      await db.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      await db.run("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT DO NOTHING", [
        "token_secret",
        toBase64(pf().randomBytes(48)),
      ]);
      const row = await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", ["token_secret"]);
      if (!row?.value) throw new Error("could not create a token secret");
      config.tokenSecret = row.value;
    })().catch((e) => {
      secretReady = null;
      throw e;
    }));
  app.use("*", async (_c, next) => {
    await ensureTokenSecret();
    await next();
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    if (err instanceof z.ZodError) return c.json({ error: "invalid_input", details: err.issues.map((i) => i.message) }, 400);
    if (err instanceof SyntaxError) return c.json({ error: "invalid_input", details: ["The request body isn't valid JSON."] }, 400);
    console.error(err);
    return c.json({ error: "server_error" }, 500);
  });

  // ---------------------------------------------------------------- who may call what
  const family = ctx.requireScope("family");
  app.use("/family", family);
  app.use("/children/*", family);
  app.use("/reports", family);
  app.use("/parent/*", ctx.requireScope("parent"));

  // ---------------------------------------------------------------- routes
  app.route("/", publicRoutes(ctx));
  app.route("/auth", authRoutes(ctx));
  app.route("/", learnRoutes(ctx));
  app.route("/", puzzleRoutes(ctx));
  app.route("/", spellingRoutes(ctx));
  app.route("/", gameRoutes(ctx));
  app.route("/", usageRoutes(ctx));
  app.route("/", tutorRoutes(ctx));
  app.route("/parent", parentRoutes(ctx));
  app.route("/parent", parentAiRoutes(ctx));
  return app;
}
