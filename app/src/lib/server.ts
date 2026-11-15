import { Platform } from "react-native";
import { findServer, type ConnectResult } from "./server-address";
import { storage } from "./storage";

// Where the app's requests go. The website always talks to its own server. A phone app chooses on first run (app/start.tsx):
//  - "device": standalone mode (task T8). The API runs inside the app with its own database; nothing leaves the phone.
//  - "server": a server the family runs or trusts. The address is typed on app/server.tsx and kept on the device (no secret in it).
// Development builds and builds with EXPO_PUBLIC_API_URL know a server already, but a phone still asks which way to use the app.

const KEY = "hl.serverUrl";
const MODE_KEY = "hl.mode";
export type AppMode = "server" | "device";

/** An address baked into the build (EXPO_PUBLIC_API_URL), for a project that hosts its own public server. */
const BUILT_IN = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
let saved: string | null = null;
let mode: AppMode | null = null;

/** What is used when the family has not chosen one: the build's own, or localhost on the website and in development. */
function fallback(): string | null {
  if (BUILT_IN) return BUILT_IN;
  if (Platform.OS === "web" || __DEV__) return "http://localhost:8787";
  return null;
}

/** The base address for every API call to a server. Empty if a phone app has not been pointed at one. */
export const apiBase = (): string => (Platform.OS === "web" ? fallback() ?? "" : saved ?? fallback() ?? "");

/** "device" when the app's own database answers every request (standalone mode). Never on the website. */
export const isDeviceMode = (): boolean => Platform.OS !== "web" && mode === "device";

/** The way this phone app is used, or null before the family has chosen. Always "server" on the website. */
export const appMode = (): AppMode | null => (Platform.OS === "web" ? "server" : mode);

/** True on a phone app that has not been set up: the first-run choice (app/start.tsx) must come first. */
export const needsSetup = (): boolean => Platform.OS !== "web" && (mode === null || (mode === "server" && saved === null && fallback() === null));

/** The address the family chose, if any. */
export const chosenServerAddress = (): string | null => saved;

/** Whether the build already knows a server, so "use the default" makes sense. */
export const hasDefaultServer = (): boolean => fallback() !== null;

/** Reads the saved choice and address. Call once at start-up, before the first request. */
export async function loadServerAddress(): Promise<void> {
  if (Platform.OS === "web") return;
  const v = await storage.get(KEY);
  saved = v && /^https?:\/\//.test(v) ? v : null;
  const m = await storage.get(MODE_KEY);
  // A phone that was pointed at a server before standalone mode existed keeps using it.
  mode = m === "device" || m === "server" ? m : saved ? "server" : null;
}

async function setMode(m: AppMode): Promise<void> {
  mode = m;
  await storage.set(MODE_KEY, m);
}

/** Standalone mode: the API, the database and all content live on this phone. */
export async function chooseThisDeviceOnly(): Promise<void> {
  await setMode("device");
}

/** Checks the typed address and, if it is an Honest Learn server, keeps it and switches to server mode. */
export async function connectServer(input: string): Promise<ConnectResult> {
  const r = await findServer(input, (url, init) => fetch(url, init));
  if (r.ok) {
    saved = r.base;
    await storage.set(KEY, r.base);
    await setMode("server");
  }
  return r;
}

/** Forgets the chosen address and uses the build's own server. */
export async function resetServerAddress(): Promise<void> {
  saved = null;
  await storage.remove(KEY);
  await setMode("server");
}
