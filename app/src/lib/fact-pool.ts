// The quick facts a child has already been shown, kept on the device so the "Did you know?" card still works without the internet.
// Pure functions only (no React Native imports), so they are tested from server/test/fact-pool.test.ts. The saving itself is in
// lib/facts.ts and the card in components/FactCard.tsx.
//
// What is kept, and why that is safe: a fact is public text with a source link; it holds no secret (unlike a quiz answer). Two rules:
//  - a fact tied to a sensitive topic (religion, body, politics) is NEVER kept, because a parent can lock the topic again and a saved
//    copy would keep showing it. It is shown online only, while the server says the parent has unlocked it.
//  - the pool belongs to one child and one age group: if the child's group changes, the old facts are thrown away.
// What comes back from storage is untrusted (it can be damaged or edited), so every fact is checked before it is shown.

export interface PooledFact {
  id: string;
  subject: string;
  text: string;
  source: { title: string; url: string };
}
export interface FactPool {
  /** The age group the facts were served for. */
  band: string;
  facts: PooledFact[];
}

/** Facts kept per child. A child sees a handful a day, so this is weeks of variety and a few kilobytes. */
export const MAX_POOLED_FACTS = 40;

const ID = /^[a-z0-9-]{1,60}$/;

/** A fact exactly as the server sends it, or null. Anything else (wrong type, too long, a source that is not https) is refused. */
export function asFact(x: unknown): PooledFact | null {
  const f = x as Partial<PooledFact> | null;
  if (!f || typeof f !== "object") return null;
  const s = f.source as Partial<PooledFact["source"]> | null | undefined;
  if (typeof f.id !== "string" || !ID.test(f.id) || typeof f.subject !== "string" || !f.subject || f.subject.length > 40) return null;
  if (typeof f.text !== "string" || f.text.length < 10 || f.text.length > 300) return null;
  if (!s || typeof s !== "object" || typeof s.title !== "string" || !s.title || s.title.length > 200 || typeof s.url !== "string" || s.url.length > 500 || !/^https:\/\//.test(s.url)) return null;
  return { id: f.id, subject: f.subject, text: f.text, source: { title: s.title, url: s.url } };
}

/** Whether a fact from the server may be kept: it must be valid and not tied to a sensitive topic. */
export function keepable(x: unknown): PooledFact | null {
  const fact = asFact(x);
  if (!fact) return null;
  const sensitive = (x as { sensitive?: unknown }).sensitive;
  return sensitive === null || sensitive === undefined ? fact : null;
}

/** The saved facts for this age group, or an empty list when nothing usable was saved (or it was saved for another group). */
export function readPool(raw: unknown, band: string): PooledFact[] {
  try {
    const p = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<FactPool> | null;
    if (!p || typeof p !== "object" || p.band !== band || !Array.isArray(p.facts)) return [];
    const out: PooledFact[] = [];
    for (const x of p.facts.slice(0, MAX_POOLED_FACTS * 2)) {
      const f = asFact(x);
      if (f && !out.some((o) => o.id === f.id)) out.push(f);
      if (out.length >= MAX_POOLED_FACTS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** New facts first, then the ones already kept, each fact once, at most MAX_POOLED_FACTS. Facts that may not be kept are left out. */
export function mergePool(existing: readonly PooledFact[], fresh: readonly unknown[]): PooledFact[] {
  const out: PooledFact[] = [];
  for (const x of [...fresh.map(keepable), ...existing]) {
    if (x && !out.some((o) => o.id === x.id)) out.push(x);
    if (out.length >= MAX_POOLED_FACTS) break;
  }
  return out;
}

/**
 * A fact to show with no connection: one this session has not shown yet, chosen at random; once all were shown, any of them (a repeat
 * is better than an empty card). `random` is 0 to 1.
 */
export function pickOffline(pool: readonly PooledFact[], shown: ReadonlySet<string>, random: () => number = Math.random): PooledFact | null {
  if (!pool.length) return null;
  const fresh = pool.filter((f) => !shown.has(f.id));
  const from = fresh.length ? fresh : pool;
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))]!;
}
