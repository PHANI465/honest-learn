import { Platform } from "react-native";

/**
 * Website only: register public/sw.js so the installed website opens without internet.
 * Skipped in development so the dev server's live bundles are never served from a cache.
 */
export function registerServiceWorker(): void {
  if (Platform.OS !== "web" || process.env.NODE_ENV !== "production") return;
  const sw = globalThis.navigator?.serviceWorker;
  if (!sw) return;
  sw.register("/sw.js").catch(() => {
    /* not supported here (e.g. private mode): the website still works online */
  });
}
