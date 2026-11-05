import { serve } from "@hono/node-server";
import { config } from "./config.ts";
import { purgeOld } from "./db.ts";
import { openConfiguredDb } from "./open-db.ts";
import { loadContent } from "./content.ts";
import { createTutor } from "./tutor.ts";
import { createApp } from "./app.ts";

const content = loadContent(config.contentDir);
const db = openConfiguredDb();
const app = createApp({ db, content, tutor: createTutor() });

// Data retention: run now and then once a day.
const purge = async () => {
  try {
    const n = await purgeOld(db, config.chatRetentionDays);
    if (n) console.log(`retention: removed ${n} old rows`);
  } catch (e) {
    console.error("retention purge failed", e);
  }
};
await purge();
setInterval(purge, 24 * 60 * 60 * 1000).unref();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `Honest Learn API on http://localhost:${info.port} — ${content.lessons.size} lessons, tutor: ${config.tutor.mode}, db: ${db.dialect}` +
      (config.showDrafts ? " (showing DRAFT lessons)" : ""),
  );
});
