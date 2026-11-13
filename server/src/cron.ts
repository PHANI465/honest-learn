// Scheduled jobs for the Vercel deployment (see vercel.json "crons" and docs/DEPLOYMENT.md).
// Kept separate from vercel.ts so tests can mount it with an in-memory database.
import { Hono } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";
import { purgeOld, type DB } from "./db.ts";

export interface CronOptions {
  /** The shared secret. Defaults to the CRON_SECRET environment variable (read per request). */
  secret?: string;
  /** Refuse requests when no secret is set. Defaults to true on Vercel, false for local development. */
  requireSecret?: boolean;
  /** How long Hoot chats are kept. Defaults to config.chatRetentionDays. */
  chatRetentionDays?: number;
}

/** Constant-time string comparison (hashes first so the lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * `GET /cron/retention` (mounted under /api): deletes expired data and returns `{ removed }`.
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET variable is set.
 */
export function createCronRoutes(db: DB, opts: CronOptions = {}): Hono {
  const routes = new Hono();
  routes.get("/cron/retention", async (c) => {
    const secret = opts.secret ?? process.env.CRON_SECRET ?? "";
    const requireSecret = opts.requireSecret ?? !!process.env.VERCEL;
    if (secret) {
      const header = c.req.header("authorization") ?? "";
      const given = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!safeEqual(given, secret)) return c.json({ error: "unauthorized" }, 401);
    } else if (requireSecret) {
      // No secret configured: never let anonymous callers trigger the job.
      return c.json({ error: "unauthorized" }, 401);
    }
    const days = opts.chatRetentionDays ?? config.chatRetentionDays;
    try {
      const removed = await purgeOld(db, days);
      if (removed) console.log(`retention: removed ${removed} old rows`);
      return c.json({ removed });
    } catch (e) {
      console.error("retention purge failed", e);
      return c.json({ error: "retention_failed" }, 500);
    }
  });
  return routes;
}
