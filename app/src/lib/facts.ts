// Where the facts a child has seen are kept on the device (see fact-pool.ts for the rules). Never throws: the card works without it.
import { storage } from "./storage";
import { mergePool, readPool, type FactPool, type PooledFact } from "./fact-pool";

export const FACTS_KEY = "hl.off.facts";

async function readAll(): Promise<Record<string, FactPool>> {
  try {
    const raw = await storage.get(FACTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, FactPool>) : {};
  } catch {
    return {};
  }
}

/** The facts kept for this child (empty when none, or when they were kept for another age group). */
export async function loadFacts(childId: string, band: string): Promise<PooledFact[]> {
  const all = await readAll();
  return Object.prototype.hasOwnProperty.call(all, childId) ? readPool(all[childId], band) : [];
}

/** Adds facts the server just sent. Sensitive ones are dropped (see keepable). A different age group starts a new pool. */
export async function rememberFacts(childId: string, band: string, fresh: readonly unknown[]): Promise<void> {
  try {
    const all = await readAll();
    const kept = mergePool(Object.prototype.hasOwnProperty.call(all, childId) ? readPool(all[childId], band) : [], fresh);
    if (kept.length) all[childId] = { band, facts: kept };
    else delete all[childId];
    // a family has at most 8 children, but the store is rebuilt from what was read, so stray entries cannot pile up
    const ids = Object.keys(all);
    for (const id of ids.slice(0, Math.max(0, ids.length - 8))) delete all[id];
    if (Object.keys(all).length) await storage.set(FACTS_KEY, JSON.stringify(all));
    else await storage.remove(FACTS_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Forgets this child's facts (a parent locked a topic, or the child was removed). */
export async function forgetFacts(childId: string): Promise<void> {
  try {
    const all = await readAll();
    delete all[childId];
    if (Object.keys(all).length) await storage.set(FACTS_KEY, JSON.stringify(all));
    else await storage.remove(FACTS_KEY);
  } catch {
    /* nothing to do */
  }
}
