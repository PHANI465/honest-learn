// Checks every YouTube video used in lessons against the YouTube Data API.
//
//   YOUTUBE_API_KEY=... node scripts/check-videos.mjs          # report only
//   YOUTUBE_API_KEY=... node scripts/check-videos.mjs --write  # also stamp videoCheckedOn + videoMinutes on passing videos
//
// Rules (a video FAILS if any is broken):
//   - the video exists, is public and embeddable
//   - it is not age-restricted
//   - for ages 3–12 (bands b1–b3) it must be marked "made for kids" by its creator
//   - it is at most 20 minutes long
// Passing this script is necessary but NOT sufficient: a reviewer must still watch the whole video.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = process.env.YOUTUBE_API_KEY;
const write = process.argv.includes("--write");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : n.endsWith(".json") ? [p] : [];
  });
}

/** "PT1H2M3S" → minutes */
export function isoMinutes(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return Infinity;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => Number(x ?? 0));
  return d * 1440 + h * 60 + min + s / 60;
}

const uses = []; // { file, lesson, section, band }
for (const file of walk(join(root, "content/lessons"))) {
  const lesson = JSON.parse(readFileSync(file, "utf8"));
  lesson.sections.forEach((s, i) => s.type === "video" && uses.push({ file, lesson, index: i, band: lesson.band, id: s.videoId }));
}

if (!uses.length) {
  console.log("No videos in lessons yet. Nothing to check.");
  process.exit(0);
}
if (!key) {
  console.error(`Found ${uses.length} video(s). Set YOUTUBE_API_KEY to check them (Google Cloud Console → YouTube Data API v3).`);
  process.exit(1);
}

const ids = [...new Set(uses.map((u) => u.id))];
const info = new Map();
for (let i = 0; i < ids.length; i += 50) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails,snippet&id=${ids.slice(i, i + 50).join(",")}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  for (const item of (await res.json()).items ?? []) info.set(item.id, item);
}

const today = new Date().toISOString().slice(0, 10);
let failed = 0;
const touched = new Map();
for (const u of uses) {
  const v = info.get(u.id);
  const problems = [];
  if (!v) problems.push("not found (deleted or private)");
  else {
    if (v.status.privacyStatus !== "public") problems.push(`privacy is ${v.status.privacyStatus}`);
    if (!v.status.embeddable) problems.push("embedding disabled");
    if (v.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") problems.push("age-restricted");
    if (["b1", "b2", "b3"].includes(u.band) && v.status.madeForKids !== true) problems.push("not marked 'made for kids' (required for ages 3–11)");
    if (isoMinutes(v.contentDetails.duration) > 20) problems.push(`too long (${Math.round(isoMinutes(v.contentDetails.duration))} min)`);
  }
  const label = `${u.lesson.id} → ${u.id}${v ? ` "${v.snippet.title}" (${v.snippet.channelTitle})` : ""}`;
  if (problems.length) {
    failed++;
    console.log(`✗ ${label}\n    ${problems.join("; ")}`);
  } else {
    console.log(`✓ ${label}`);
    if (write) {
      const lesson = touched.get(u.file) ?? u.lesson;
      lesson.sections[u.index].videoCheckedOn = today;
      lesson.sections[u.index].videoMinutes = Math.round(isoMinutes(v.contentDetails.duration) * 10) / 10;
      touched.set(u.file, lesson);
    }
  }
}
for (const [file, lesson] of touched) writeFileSync(file, JSON.stringify(lesson, null, 2) + "\n");
console.log(`\n${uses.length - failed}/${uses.length} passed.${write ? ` Updated ${touched.size} lesson file(s).` : ""}`);
process.exit(failed ? 1 : 0);
