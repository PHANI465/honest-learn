// One-process preview: serves the built web app (app/dist) and the API under /api on one port,
// the same layout as the Vercel deployment. Used by `npm run dev` at the repository root
// (v0 previews, quick demos). Data goes to SQLite (DB_PATH) or, with DATABASE_URL set, Postgres.
//
//   npm run dev            # from the repo root: installs, builds the web app, starts on PORT (default 3000)
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.ts";
import { purgeOld } from "./db.ts";
import { openConfiguredDb } from "./open-db.ts";
import { loadContent } from "./content.ts";
import { createTutor } from "./tutor.ts";
import { createApp } from "./app.ts";
import { WEB_SECURITY_HEADERS } from "./web-headers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "../../app/dist");
const port = Number(process.env.PORT ?? 3000);

const content = loadContent(config.contentDir);
const db = openConfiguredDb();
purgeOld(db, config.chatRetentionDays).catch((e) => console.error("retention purge failed", e));

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

const root = new Hono();
root.route("/api", createApp({ db, content, tutor: createTutor() }));
root.use("*", async (c, next) => {
  await next();
  if (new URL(c.req.url).pathname.startsWith("/api")) return; // the API sets its own headers
  for (const [k, v] of Object.entries(WEB_SECURITY_HEADERS)) c.header(k, v);
});
root.get("*", async (c) => {
  // static files from app/dist, falling back to index.html for app routes (/parent, /learn/…)
  let rel: string;
  try {
    rel = normalize(decodeURIComponent(new URL(c.req.url).pathname));
  } catch {
    return c.text("Bad address", 400); // malformed %-escapes
  }
  let file = resolve(dist, "." + rel);
  if (file !== dist && !file.startsWith(dist + sep)) file = join(dist, "index.html"); // never outside app/dist
  try {
    if (!(await stat(file)).isFile()) throw new Error("not a file");
  } catch {
    file = join(dist, "index.html");
  }
  try {
    const body = await readFile(file);
    return c.body(body, 200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  } catch {
    return c.text("The web app isn't built yet. Run `npm run dev` from the repository root.", 503);
  }
});

serve({ fetch: root.fetch, port }, (info) => {
  console.log(`Honest Learn preview on http://localhost:${info.port} (website + API at /api, ${content.lessons.size} lessons)`);
});
