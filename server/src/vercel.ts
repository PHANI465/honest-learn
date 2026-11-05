// The API as one Vercel Function, served under /api on the same domain as the web app.
// Entry point: api/index.ts at the repository root (see vercel.json and docs/DEPLOYMENT.md).
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { config } from "./config.ts";
import { purgeOld } from "./db.ts";
import { openConfiguredDb } from "./open-db.ts";
import { loadContent } from "./content.ts";
import { createTutor } from "./tutor.ts";
import { createApp } from "./app.ts";

// Created once per cold start; the database schema is applied (once) on the first query.
const content = loadContent(config.contentDir);
const db = openConfiguredDb();
const api = createApp({ db, content, tutor: createTutor() });

export const app = new Hono().basePath("/api");

// Data retention: there is no long-running process, so each instance purges at most once a day.
let lastPurge = 0;
app.use("*", async (_c, next) => {
  if (Date.now() - lastPurge > 24 * 60 * 60 * 1000) {
    lastPurge = Date.now();
    try {
      const n = await purgeOld(db, config.chatRetentionDays);
      if (n) console.log(`retention: removed ${n} old rows`);
    } catch (e) {
      lastPurge = 0;
      console.error("retention purge failed", e);
    }
  }
  await next();
});

app.route("/", api);
app.notFound((c) => c.json({ error: "not_found" }, 404));

/** Web-standard handler (Request → Response) for Vercel's Node.js runtime. */
export const handler = handle(app);
