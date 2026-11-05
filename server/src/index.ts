import { serve } from "@hono/node-server";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { loadContent } from "./content.ts";
import { createTutor } from "./tutor.ts";
import { createApp } from "./app.ts";

const content = loadContent(config.contentDir);
const db = openDb(config.dbPath);
const app = createApp({ db, content, tutor: createTutor() });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `Honest Learn API on http://localhost:${info.port} — ${content.lessons.size} lessons, tutor: ${config.tutor.mode}` +
      (config.showDrafts ? " (showing DRAFT lessons)" : ""),
  );
});
