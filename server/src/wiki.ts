// "Learn more" summaries from Wikipedia, chosen per age:
//   ages 9–11  → Simple English Wikipedia (simple.wikipedia.org)
//   ages 12–18 → English Wikipedia
//   under 9    → not offered (lessons are written for them instead)
// Only article titles listed in reviewed lesson files are ever fetched — children can't search Wikipedia here.

import type { BandId } from "./security.ts";

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
  source: "Simple English Wikipedia" | "Wikipedia";
  license: "CC BY-SA 4.0";
  thumbnail: string | null;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const USER_AGENT = "HonestLearn/0.1 (education app for children; https://github.com/PHANI465/honest-learn)";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CHARS = 1200;

export function wikiHostFor(band: BandId): string | null {
  if (band === "b1" || band === "b2") return null;
  return band === "b3" ? "simple.wikipedia.org" : "en.wikipedia.org";
}

export class WikiClient {
  private cache = new Map<string, { at: number; value: WikiSummary | null }>();

  constructor(private fetcher: Fetcher = fetch) {}

  /** Returns null when there's no suitable article (missing, disambiguation page, or fetch error). */
  async summary(band: BandId, title: string): Promise<WikiSummary | null> {
    const host = wikiHostFor(band);
    if (!host) return null;
    const key = `${host}/${title}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    let value: WikiSummary | null = null;
    try {
      const res = await this.fetcher(`https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, {
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const j = (await res.json()) as {
          type?: string;
          title?: string;
          extract?: string;
          content_urls?: { desktop?: { page?: string } };
          thumbnail?: { source?: string };
        };
        if (j.type !== "disambiguation" && j.extract && j.title) {
          const extract = j.extract.length > MAX_CHARS ? j.extract.slice(0, j.extract.lastIndexOf(". ", MAX_CHARS) + 1) || j.extract.slice(0, MAX_CHARS) : j.extract;
          value = {
            title: j.title,
            extract,
            url: j.content_urls?.desktop?.page ?? `https://${host}/wiki/${encodeURIComponent(title)}`,
            source: host.startsWith("simple") ? "Simple English Wikipedia" : "Wikipedia",
            license: "CC BY-SA 4.0",
            thumbnail: j.thumbnail?.source ?? null,
          };
        }
      }
    } catch {
      return null; // network problem: don't cache, try again next time
    }
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }
}

/** The article for a lesson: its explicit wikiTitle, else its first Wikipedia source. */
export function lessonWikiTitle(lesson: { wikiTitle?: string; sources: { url: string }[] }): string | null {
  if (lesson.wikiTitle) return lesson.wikiTitle;
  for (const s of lesson.sources) {
    const m = s.url.match(/^https:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)$/);
    if (m) return decodeURIComponent(m[1]!);
  }
  return null;
}
