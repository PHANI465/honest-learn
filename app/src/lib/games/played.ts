// A simple "played" record for the games that run on the device. It only counts how many times a child has finished a game on this
// device: no dates, no streaks, no scores, no comparison with anyone. It stays on the device and is removed on sign-out
// (see clearOfflineData in lib/offline.ts).
import { storage } from "../storage";

export const PLAYED_KEY = "hl.games.played";

type Record_ = Record<string, Record<string, number>>;

async function read(): Promise<Record_> {
  try {
    const raw = await storage.get(PLAYED_KEY);
    return raw ? (JSON.parse(raw) as Record_) : {};
  } catch {
    return {};
  }
}

/** How many times each game was finished by this child on this device, by game name. */
export async function loadPlayed(childId: string): Promise<Record<string, number>> {
  return (await read())[childId] ?? {};
}

/** Adds one to the count for a game. Never throws: a game must work even if nothing can be saved. */
export async function recordPlayed(childId: string, game: string): Promise<void> {
  try {
    const all = await read();
    const mine = all[childId] ?? {};
    mine[game] = (mine[game] ?? 0) + 1;
    all[childId] = mine;
    await storage.set(PLAYED_KEY, JSON.stringify(all));
  } catch {
    /* nothing to do */
  }
}
