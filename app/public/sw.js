/*
 * Honest Learn service worker: lets the installed website open without internet.
 *
 * It saves only the app itself (the page, its JavaScript bundles, icons, manifest).
 * It never touches API requests: lessons a child has opened are saved by the app per child
 * (src/lib/offline.ts), and parent-area data and Hoot chats are never saved anywhere.
 */
const CACHE = "honest-learn-app-v1";
const SHELL = "/"; // single-page app: every route is served by index.html
const STATIC = ["/manifest.webmanifest", "/favicon.ico", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];
const BUNDLES = "/_expo/static/";
const PAGE_TIMEOUT_MS = 5000;

const scriptsIn = (html) =>
  [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((src) => src.startsWith(BUNDLES));

/** Save the bundles a page needs: its script tags, plus every route chunk those bundles can load later. */
async function saveBundles(html) {
  const cache = await caches.open(CACHE);
  const scripts = scriptsIn(html);
  const keep = new Set(scripts);
  for (const src of scripts) {
    try {
      const res = (await cache.match(src)) || (await fetch(src));
      if (!res.ok) continue;
      await cache.put(src, res.clone());
      const js = await res.text();
      for (const m of js.matchAll(/["'](\/_expo\/static\/[^"'\s]+?\.(?:js|css))["']/g)) keep.add(m[1]);
    } catch {
      /* try again on the next visit */
    }
  }
  await Promise.all(
    [...keep].map(async (path) => {
      if (!(await cache.match(path))) await cache.add(path).catch(() => {});
    }),
  );
  // Drop bundles from older versions of the app.
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith(BUNDLES) && !keep.has(path)) await cache.delete(req);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(STATIC.map((path) => cache.add(path).catch(() => {})));
      const res = await fetch(SHELL, { cache: "no-cache" });
      if (res.ok) {
        await cache.put(SHELL, res.clone());
        await saveBundles(await res.text());
      }
    })().catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("honest-learn-app-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/** Pages: the network first (so updates arrive), the saved page if offline or very slow. */
async function page(event) {
  const cache = await caches.open(CACHE);
  const network = fetch(event.request).then(async (res) => {
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      const html = await res.clone().text();
      const old = await cache.match(SHELL);
      await cache.put(SHELL, res.clone());
      const oldScripts = old ? scriptsIn(await old.text()).join() : "";
      if (scriptsIn(html).join() !== oldScripts) event.waitUntil(saveBundles(html)); // a new version was deployed
    }
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const saved = await cache.match(SHELL);
    if (saved) {
      event.waitUntil(network.catch(() => {}));
      return saved;
    }
    return await network;
  } catch {
    return (await cache.match(SHELL)) || Response.error();
  }
}

/** Bundles have the content hash in their name, so a saved copy never goes stale. */
async function bundle(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

/** Icons and manifest: fresh when online, saved copy when offline. */
async function asset(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Only this website's own files. The API, videos and outside links go straight to the network.
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") return event.respondWith(page(event));
  if (url.pathname.startsWith(BUNDLES) || url.pathname.startsWith("/assets/")) return event.respondWith(bundle(request));
  if (STATIC.includes(url.pathname)) return event.respondWith(asset(request));
});
