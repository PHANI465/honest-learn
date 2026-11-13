// The API as one Vercel Function, served under /api on the same domain as the web app.
// Entry point: api/index.ts at the repository root (see vercel.json and docs/DEPLOYMENT.md).
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { config } from "./config.ts";
import { createCronRoutes } from "./cron.ts";
import { openConfiguredDb } from "./open-db.ts";
import { loadContent } from "./content.ts";
import { createTutor } from "./tutor.ts";
import { createApp } from "./app.ts";

// Created once per cold start; the database schema is applied (once) on the first query.
const content = loadContent(config.contentDir);
const db = openConfiguredDb();
const api = createApp({ db, content, tutor: createTutor() });

export const app = new Hono().basePath("/api");

// Data retention: there is no long-running process, so Vercel Cron calls GET /api/cron/retention
// daily (see vercel.json "crons"). It is protected by CRON_SECRET; see src/cron.ts.
app.route("/", createCronRoutes(db));
app.route("/", api);
app.notFound((c) => c.json({ error: "not_found" }, 404));

/** Web-standard handler (Request → Response) for Vercel's Node.js runtime. */
export const handler = handle(app);
