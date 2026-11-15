// The Honest Learn API running inside the app, for the standalone mode with no server (task T8). It is the server's own code
// (server/src, imported directly; Metro reads files outside the app folder on demand since Expo SDK 56), on the portable
// platform: pure-JavaScript crypto, content handed in as files, no Node.js.
//
// T8a built this core and proves it runs (scripts/local-core-proof.mjs). Still to come: 8b, the expo-sqlite adapter and the
// bundled content; 8c, choosing "this device only" or "connect to a server" on first run, a recovery phrase and the local
// wellbeing notice; 8d, the security review. Nothing in the app imports this file yet, so it adds nothing to the website.
import { createApp } from "../../../server/src/app.ts";
import { config } from "../../../server/src/config.ts";
import { loadContent } from "../../../server/src/content.ts";
import { openWithAdapter, type DbAdapter } from "../../../server/src/db.ts";
import { setPlatform } from "../../../server/src/platform.ts";
import { contentFromFiles, createPortablePlatform } from "../../../server/src/platform-portable.ts";
import { MockTutor, type TutorProvider } from "../../../server/src/tutor.ts";

export type { DbAdapter };

export interface LocalApiOptions {
  /** The database driver (8b: expo-sqlite). Must pass server/test/db-contract.test.ts. */
  adapter: DbAdapter;
  /** content/ as already-parsed files, keyed by their path under content/ ("knowledge-map.json", "lessons/b1/x.json"). */
  files: Readonly<Record<string, unknown>>;
  /** Secure random bytes (expo-crypto's getRandomValues on a phone). Defaults to globalThis.crypto.getRandomValues. */
  getRandomValues?: (array: Uint8Array) => Uint8Array;
  /** Hoot's helper. Defaults to the lessons' pre-written hints (no AI). */
  tutor?: TutorProvider;
  /**
   * The secrets that sign sign-in tokens and encrypt a family's own AI key. On a phone they come from the Keychain/Keystore
   * (device.ts), so a copy of the database file alone cannot forge a sign-in or open the key. Without them the API generates a
   * token secret into the database, as a server with no TOKEN_SECRET does.
   */
  secrets?: { tokenSecret: string; aiKeySecret: string };
}

/** The same request interface as the server: a path under the API and fetch-style options. */
export interface LocalApi {
  request(path: string, init?: RequestInit): Promise<Response>;
}

export function createLocalApi(opts: LocalApiOptions): LocalApi {
  setPlatform(createPortablePlatform({ content: contentFromFiles(opts.files), getRandomValues: opts.getRandomValues }));
  if (opts.secrets) {
    config.tokenSecret = opts.secrets.tokenSecret;
    config.aiKeySecret = opts.secrets.aiKeySecret;
  }
  const content = loadContent("bundled");
  const app = createApp({ db: openWithAdapter(opts.adapter), content, tutor: opts.tutor ?? new MockTutor(), device: true });
  return { request: async (path, init) => app.request(path, init) };
}
