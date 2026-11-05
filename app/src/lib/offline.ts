/**
 * Offline mode: keep learning on patchy internet.
 *
 *  - cachedGet(): network first; a copy of what a child needs to learn (home, lesson lists, lessons,
 *    puzzles, free resources, today's minutes) is saved per child + path, and served when the network fails.
 *    Only paths on an allowlist can be saved: never the parent area (PIN-protected), never Hoot chats,
 *    and answers / explanations / hints are stripped before anything is saved.
 *  - Lesson completions and screen-time minutes made offline wait in an outbox and are sent when the
 *    app is back online. Each item is taken out of the outbox before it is sent, and only put back if the
 *    request never reached the server, so nothing is sent twice.
 *
 * Storage is lib/storage.ts (Keychain / Keystore on phones, localStorage on the web).
 */
import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { api, ApiError, onReachability, type Child, type ContentMap } from "./api";
import { storage } from "./storage";
import type { Usage } from "./timer";

const PREFIX = "hl.off.";
const INDEX_KEY = PREFIX + "index";
const OUTBOX_KEY = PREFIX + "outbox";
const TICKS_KEY = PREFIX + "ticks";
const FAMILY_KEY = PREFIX + "family";
const MAP_KEY = PREFIX + "map";
/** Saved responses kept on the device (oldest are dropped first). */
const MAX_ENTRIES = 80;
const MAX_VALUE_CHARS = 200_000;
/** After this long without an answer, show the saved copy instead of a spinner. */
const SLOW_MS = 8_000;
/** The server counts at most one minute per 50 seconds, so queued minutes are sent at least this far apart. */
const TICK_GAP_MS = 55_000;
const SYNC_EVERY_MS = 30_000;

// ---------------------------------------------------------------- what may be saved

const CACHEABLE: RegExp[] = [
  /^\/children\/[\w-]+\/home$/,
  /^\/children\/[\w-]+\/lessons\?subject=[\w-]+$/,
  /^\/children\/[\w-]+\/lessons\/[\w.-]+$/,
  /^\/children\/[\w-]+\/lessons\/[\w.-]+\/learn-more$/,
  /^\/children\/[\w-]+\/puzzles$/,
  /^\/children\/[\w-]+\/resources\?subject=[\w-]+$/,
  /^\/children\/[\w-]+\/usage\?day=\d{4}-\d{2}-\d{2}$/,
];
export const isCacheable = (path: string) => CACHEABLE.some((re) => re.test(path));

/** Answers are never sent to the device by design; this makes sure none could ever be saved either. */
const NEVER_SAVE = new Set(["answer", "answers", "explain", "explanation", "hints", "hint"]);
function stripAnswers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripAnswers);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !NEVER_SAVE.has(k)).map(([k, v]) => [k, stripAnswers(v)]));
  }
  return value;
}

// ---------------------------------------------------------------- connectivity

let offline = Platform.OS === "web" && globalThis.navigator?.onLine === false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function setOffline(value: boolean) {
  if (offline === value) return;
  offline = value;
  emit();
  if (!value) void syncNow();
}
onReachability((reachable) => setOffline(!reachable));
if (Platform.OS === "web" && typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("offline", () => setOffline(true));
}

export const isOffline = () => offline;

/** True when the last request couldn't reach Honest Learn. */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribe, isOffline, isOffline);
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Network failure (or the server being unreachable), as opposed to the server saying no. */
export function isOfflineError(e: unknown): boolean {
  return !(e instanceof ApiError) || e.status === 502 || e.status === 503 || e.status === 504;
}

// ---------------------------------------------------------------- small helpers

/** Storage reads/writes that touch shared lists run one at a time. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

async function loadJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await storage.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
async function saveJson(key: string, value: unknown): Promise<void> {
  try {
    await storage.set(key, JSON.stringify(value));
  } catch {
    /* saving is best-effort: the app works without it */
  }
}

/** FNV-1a: a short, stable storage key for a path (keys may only use letters, digits, ".", "-" and "_"). */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + text.length.toString(36);
}
const safe = (id: string) => id.replace(/[^\w.-]/g, "_");
const cacheKey = (childId: string, path: string) => `${PREFIX}c.${safe(childId)}.${hash(path)}`;

// ---------------------------------------------------------------- saved responses

interface Saved<T> {
  p: string;
  t: number;
  d: T;
}

/** Bumped on sign-out, so a response that arrives afterwards isn't saved. */
let generation = 0;

async function writeCache(childId: string, path: string, data: unknown, gen = generation): Promise<void> {
  if (!isCacheable(path) || gen !== generation) return;
  const value = JSON.stringify({ p: path, t: Date.now(), d: stripAnswers(data) } satisfies Saved<unknown>);
  if (value.length > MAX_VALUE_CHARS) return;
  const key = cacheKey(childId, path);
  await serial(async () => {
    if (gen !== generation) return;
    try {
      await storage.set(key, value);
      const index = ((await loadJson<[string, number][]>(INDEX_KEY)) ?? []).filter(([k]) => k !== key);
      index.unshift([key, Date.now()]);
      for (const [old] of index.splice(MAX_ENTRIES)) await storage.remove(old);
      await storage.set(INDEX_KEY, JSON.stringify(index));
    } catch {
      /* best-effort */
    }
  });
}

async function readCache<T>(childId: string, path: string): Promise<Saved<T> | null> {
  const saved = await loadJson<Saved<T>>(cacheKey(childId, path));
  return saved && saved.p === path ? saved : null;
}

async function dropCache(childId: string, path: string): Promise<void> {
  try {
    await storage.remove(cacheKey(childId, path));
  } catch {
    /* ignore */
  }
}

export interface Loaded<T> {
  data: T;
  /** True when this is the saved copy because the network failed (or was very slow). */
  fromCache: boolean;
  /** When the saved copy was made (ms since epoch). */
  savedAt: number | null;
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
const settle = <T>(p: Promise<T>): Promise<Settled<T>> =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

/**
 * GET for learning screens. Online: fresh data (and a copy is saved). Offline: the saved copy.
 * If nothing was saved, the original error is thrown (show it with offlineMessage()).
 */
export async function cachedGet<T>(childId: string, path: string, token: string | null): Promise<Loaded<T>> {
  if (!isCacheable(path)) throw new Error(`offline cache: ${path} is not a learning path`);
  const gen = generation;
  const net = settle(api<T>("GET", path, token));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SLOW_MS);
  });
  let r = await Promise.race([net, slow]);
  clearTimeout(timer);
  if (r === null) {
    // Very slow connection: show the saved copy now, and refresh it in the background.
    const saved = await readCache<T>(childId, path);
    if (saved) {
      void net.then((x) => (x.ok ? writeCache(childId, path, x.value, gen) : undefined));
      return { data: saved.d, fromCache: true, savedAt: saved.t };
    }
    r = await net;
  }
  if (r.ok) {
    void writeCache(childId, path, r.value, gen);
    return { data: r.value, fromCache: false, savedAt: null };
  }
  if (r.error instanceof ApiError && [401, 403, 404].includes(r.error.status)) {
    // e.g. a parent locked a topic again: the saved copy must not stay readable.
    await dropCache(childId, path);
  } else if (isOfflineError(r.error)) {
    const saved = await readCache<T>(childId, path);
    if (saved) return { data: saved.d, fromCache: true, savedAt: saved.t };
  }
  throw r.error;
}

/** What to show when a screen couldn't load and nothing was saved. */
export function offlineMessage(e: unknown, friendlyText: string): string {
  return isOfflineError(e) ? "You're offline, and this hasn't been saved on this device yet. Connect to the internet to open it." : friendlyText;
}

// ---------------------------------------------------------------- family list + content map

/** The profile list, so children can still pick their profile offline. (Not the parent's email.) */
export const saveFamily = (children: Child[]) => saveJson(FAMILY_KEY, children);
export const loadSavedFamily = () => loadJson<Child[]>(FAMILY_KEY);
export const saveMap = (map: ContentMap) => saveJson(MAP_KEY, map);
export const loadSavedMap = () => loadJson<ContentMap>(MAP_KEY);

// ---------------------------------------------------------------- outbox: lesson completions

interface Completion {
  id: string;
  childId: string;
  lessonId: string;
  choices: number[];
  at: string;
}

let pending = 0;
const pendingListeners = new Set<() => void>();
function setPending(n: number) {
  if (pending === n) return;
  pending = n;
  pendingListeners.forEach((l) => l());
}
/** Number of finished lessons waiting to be sent. */
export function usePendingCompletions(): number {
  return useSyncExternalStore(
    (fn) => {
      pendingListeners.add(fn);
      return () => {
        pendingListeners.delete(fn);
      };
    },
    () => pending,
    () => pending,
  );
}

const readOutbox = async () => (await loadJson<Completion[]>(OUTBOX_KEY)) ?? [];
async function writeOutbox(items: Completion[]) {
  await saveJson(OUTBOX_KEY, items);
  setPending(items.length);
}

/** Save a finished lesson to send later. Scoring happens on the server when it arrives. */
export async function queueCompletion(childId: string, lessonId: string, choices: number[]): Promise<void> {
  const item: Completion = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, childId, lessonId, choices, at: new Date().toISOString() };
  await serial(async () => writeOutbox([...(await readOutbox()), item]));
  void syncNow();
}

async function flushCompletions(token: string): Promise<void> {
  for (;;) {
    // Take the item out first: if two syncs ever overlapped, only one of them can send it.
    const item = await serial(async () => {
      const [first, ...rest] = await readOutbox();
      if (first) await writeOutbox(rest);
      return first ?? null;
    });
    if (!item) return;
    try {
      await api("POST", `/children/${item.childId}/lessons/${item.lessonId}/complete`, token, { choices: item.choices });
    } catch (e) {
      if (isOfflineError(e) || (e instanceof ApiError && (e.status === 401 || e.status === 429))) {
        // Never reached the server (or not signed in right now): put it back and try later.
        await serial(async () => writeOutbox([item, ...(await readOutbox())]));
        return;
      }
      // Otherwise the server can't accept it (lesson removed or changed, profile deleted): drop it.
    }
  }
}

// ---------------------------------------------------------------- outbox: learning minutes

/** childId -> day -> minutes not yet sent. */
type Ticks = Record<string, Record<string, number>>;
let ticksMirror: Ticks = {};
const lastTickAt = new Map<string, number>();
const usageListeners = new Set<(childId: string, usage: Usage) => void>();

const readTicks = async () => (ticksMirror = (await loadJson<Ticks>(TICKS_KEY)) ?? {});
async function changeTicks(childId: string, day: string, delta: number | "clear") {
  await serial(async () => {
    const all = await readTicks();
    const days = { ...all[childId] };
    days[day] = delta === "clear" ? 0 : Math.max(0, (days[day] ?? 0) + delta);
    if (!days[day]) delete days[day];
    if (Object.keys(days).length) all[childId] = days;
    else delete all[childId];
    ticksMirror = all;
    await saveJson(TICKS_KEY, all);
  });
}

/** Minutes learned on this device that the server hasn't counted yet. */
export const unsentMinutes = (childId: string, day: string) => ticksMirror[childId]?.[day] ?? 0;

/** Hear about the server's count after each minute is delivered. */
export function onUsage(fn: (childId: string, usage: Usage) => void): () => void {
  usageListeners.add(fn);
  return () => usageListeners.delete(fn);
}

/** One active learning minute. It is sent now if possible, otherwise when back online. */
export async function recordLearningMinute(childId: string, day: string): Promise<void> {
  await changeTicks(childId, day, 1);
  void syncNow();
}

async function drainTicks(token: string): Promise<void> {
  const all = await readTicks();
  for (const [childId, days] of Object.entries(all)) {
    const previous = lastTickAt.get(childId) ?? 0;
    if (Date.now() - previous < TICK_GAP_MS) continue;
    const day = Object.keys(days).sort()[0];
    if (!day) continue;
    await changeTicks(childId, day, -1);
    lastTickAt.set(childId, Date.now());
    try {
      const usage = await api<Usage>("POST", `/children/${childId}/usage/tick`, token, { day });
      void writeCache(childId, `/children/${childId}/usage?day=${day}`, usage);
      usageListeners.forEach((fn) => fn(childId, usage));
    } catch (e) {
      if (isOfflineError(e) || (e instanceof ApiError && (e.status === 401 || e.status === 429))) {
        await changeTicks(childId, day, 1);
        lastTickAt.set(childId, previous);
        return;
      }
      // 400: that day is too long ago for the server to accept; 404: profile deleted. Drop it.
      await changeTicks(childId, day, "clear");
    }
  }
}

// ---------------------------------------------------------------- sync loop

let token: string | null = null;
let running: Promise<void> | null = null;

type LockManagerLike = { request(name: string, fn: () => Promise<void>): Promise<void> };
/** On the web, several tabs share one outbox: a Web Lock lets only one of them send at a time. */
function withLock(fn: () => Promise<void>): Promise<void> {
  const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
  return Platform.OS === "web" && locks ? locks.request("honest-learn-offline-sync", fn) : fn();
}

/** Send whatever is waiting. Safe to call often: only one sync runs at a time. */
export function syncNow(): Promise<void> {
  const t = token;
  if (!t) return Promise.resolve();
  running ??= withLock(async () => {
    await flushCompletions(t);
    await drainTicks(t);
  })
    .catch(() => {})
    .finally(() => {
      running = null;
    });
  return running;
}

async function hasWork(): Promise<boolean> {
  const [outbox, ticks] = await Promise.all([readOutbox(), readTicks()]);
  setPending(outbox.length);
  return outbox.length > 0 || Object.keys(ticks).length > 0;
}

/** Started by the session while a family is signed in. Returns a stop function. */
export function startOfflineSync(familyToken: string): () => void {
  token = familyToken;
  void hasWork().then((work) => {
    if (work) void syncNow();
  });
  const timer = setInterval(async () => {
    if (await hasWork()) void syncNow();
    else if (offline) api("GET", "/health").catch(() => {}); // a success flips us back online
  }, SYNC_EVERY_MS);
  const appState = AppState.addEventListener("change", (s) => {
    if (s === "active") void syncNow();
  });
  const onOnline = () => void syncNow();
  const web = Platform.OS === "web" && typeof globalThis.addEventListener === "function";
  if (web) globalThis.addEventListener("online", onOnline);
  return () => {
    if (token === familyToken) token = null;
    clearInterval(timer);
    appState.remove();
    if (web) globalThis.removeEventListener("online", onOnline);
  };
}

/** Sign-out: try to send what's waiting, then remove every saved copy from this device. */
export async function clearOfflineData(): Promise<void> {
  if (!offline) await Promise.race([syncNow(), new Promise((r) => setTimeout(r, 3_000))]);
  generation++;
  await serial(async () => {
    const index = (await loadJson<[string, number][]>(INDEX_KEY)) ?? [];
    for (const key of [...index.map(([k]) => k), INDEX_KEY, OUTBOX_KEY, TICKS_KEY, FAMILY_KEY, MAP_KEY]) {
      try {
        await storage.remove(key);
      } catch {
        /* ignore */
      }
    }
  });
  ticksMirror = {};
  lastTickAt.clear();
  setPending(0);
}
