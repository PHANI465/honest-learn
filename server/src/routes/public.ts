// Routes anyone can call without signing in: health check, the curriculum map and the country list.
import { Hono } from "hono";
import { config } from "../config.ts";
import { ConsoleMailer } from "../mailer.ts";
import { loadHelplines } from "../tutor.ts";
import { CONSENT_VERSION } from "../models.ts";
import type { Ctx, Env } from "../context.ts";

export function publicRoutes(ctx: Ctx) {
  const { db, content, mailer } = ctx;
  const r = new Hono<Env>();

  r.get("/health", (c) => c.json({ ok: true, lessons: content.lessons.size, tutor: config.tutor.mode, demo: db.demo }));

  /** Countries with verified helpline info, for the optional country picker at sign-up. */
  r.get("/content/countries", (c) => {
    try {
      const h = loadHelplines();
      const countries = Object.entries(h.countries)
        .map(([code, v]) => ({ code, name: v.name }))
        .sort((x, y) => x.name.localeCompare(y.name));
      return c.json({ countries });
    } catch {
      return c.json({ countries: [] });
    }
  });

  r.get("/content/map", (c) =>
    c.json({
      version: content.map.version,
      bands: content.map.bands,
      subjects: content.map.subjects,
      sensitiveTopics: content.map.sensitiveTopics,
      consentVersion: CONSENT_VERSION,
      // false on test/pre-launch sites where emails are only written to the server log
      emailSending: !(mailer instanceof ConsoleMailer),
      launched: config.launched,
    }),
  );

  return r;
}
