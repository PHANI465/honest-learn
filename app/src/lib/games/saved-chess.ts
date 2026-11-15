// A chess game against the computer that was not finished, kept on this device so a child can leave the screen (or close the app) and
// carry on. It is only a list of moves with the level and the child's colour: no dates, no counts, nothing to be ashamed of. It never
// leaves the device and is removed on sign-out (clearOfflineData in lib/offline.ts). What is read back is checked move by move
// (readSavedGame in server/src/games/computer-opponent.ts): a damaged or edited save is simply ignored.
import { readSavedGame, type SavedGame } from "../../../../server/src/games/computer-opponent.ts";
import { storage } from "../storage";

export const SAVED_CHESS_KEY = "hl.games.chess.saved";

async function readAll(): Promise<Record<string, unknown>> {
  try {
    const raw = await storage.get(SAVED_CHESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** This child's unfinished game, or null. `allowedLevels` are the levels their age group can choose. */
export async function loadSavedChess(childId: string, allowedLevels?: readonly number[]): Promise<SavedGame | null> {
  const all = await readAll();
  return Object.prototype.hasOwnProperty.call(all, childId) ? readSavedGame(all[childId], allowedLevels) : null;
}

/** Keeps (or, with null, forgets) this child's unfinished game. Never throws: a game must work even if nothing can be saved. */
export async function saveChess(childId: string, game: SavedGame | null): Promise<void> {
  try {
    const all = await readAll();
    if (game) all[childId] = game;
    else delete all[childId];
    if (Object.keys(all).length) await storage.set(SAVED_CHESS_KEY, JSON.stringify(all));
    else await storage.remove(SAVED_CHESS_KEY);
  } catch {
    /* nothing to do */
  }
}
