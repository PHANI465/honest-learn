import { Platform } from "react-native";
import { findServer, type ConnectResult } from "./server-address";
import { storage } from "./storage";

// Which server the app talks to. The website talks to its own server and development builds to localhost, so neither needs
// anything chosen. A phone app built for the stores has no built-in server: on first run the family types the address of a
// server they run or trust (see app/server.tsx), and it is kept on the device. The address holds no secret.

const KEY = "hl.serverUrl";
/** An address baked into the build (EXPO_PUBLIC_API_URL), for a project that hosts its own public server. */
const BUILT_IN = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
let saved: string | null = null;

/** What is used when the family has not chosen one: the build's own, or localhost on the website and in development. */
function fallback(): string | null {
  if (BUILT_IN) return BUILT_IN;
  if (Platform.OS === "web" || __DEV__) return "http://localhost:8787";
  return null;
}

/** The base address for every API call. Empty if a phone app has not been pointed at a server yet. */
export const apiBase = (): string => (Platform.OS === "web" ? fallback() ?? "" : saved ?? fallback() ?? "");

/** True on a phone app that has no server chosen and none built in: the first-run screen must come first. */
export const needsServerAddress = (): boolean => Platform.OS !== "web" && saved === null && fallback() === null;

/** The address the family chose, if any. */
export const chosenServerAddress = (): string | null => saved;

/** Whether the build already knows a server, so "use the default" makes sense. */
export const hasDefaultServer = (): boolean => fallback() !== null;

/** Reads the saved address. Call once at start-up, before the first request. */
export async function loadServerAddress(): Promise<void> {
  if (Platform.OS === "web") return;
  const v = await storage.get(KEY);
  saved = v && /^https?:\/\//.test(v) ? v : null;
}

/** Checks the typed address and, if it is an Honest Learn server, keeps it. */
export async function connectServer(input: string): Promise<ConnectResult> {
  const r = await findServer(input, (url, init) => fetch(url, init));
  if (r.ok) {
    saved = r.base;
    await storage.set(KEY, r.base);
  }
  return r;
}

/** Forgets the chosen address (goes back to the build's own, or asks again). */
export async function resetServerAddress(): Promise<void> {
  saved = null;
  await storage.remove(KEY);
}
