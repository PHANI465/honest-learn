// The one place where the API touches the machine it runs on. Everything else in the API (routes, context, security, the
// hint ladder, Hoot's checks) is plain JavaScript and runs unchanged on the server, in a browser and inside the phone app
// (task T8: a standalone app with no server). A test (test/portable-core.test.ts) fails if any file the API loads imports a
// Node.js module, uses Buffer or reads process.env directly.
//
//   platform-node.ts      the server: Node's crypto, files, DNS, environment. Chosen automatically on Node.js.
//   platform-portable.ts  anywhere else: audited pure-JavaScript crypto (@noble/hashes, @noble/ciphers) and content handed
//                         in by the app. Same algorithms and formats, so hashes, tokens and sealed keys are interchangeable.
//
// Both are checked against each other by test/platform-contract.test.ts. `HL_PLATFORM=portable npm test` runs the whole API
// test suite on the portable crypto (files and DNS still come from Node there, so the server's address checks stay on).
import { createNodePlatform } from "./platform-node.ts";
import { createPortablePlatform } from "./platform-portable.ts";

/** Where content JSON comes from: the content/ folder on a server, a bundled copy in the app. Paths use "/". */
export interface ContentSource {
  readJson(dir: string, relPath: string): unknown;
  exists(dir: string, relPath: string): boolean;
  /** Every .json file under relDir (recursively), as paths relative to dir, in a stable order. */
  listJson(dir: string, relDir: string): string[];
}

/** What a pinned request may carry: a family's model server is only ever sent a method, headers, a text body and a way to stop. */
export interface PinnedInit {
  method?: string;
  headers?: HeadersInit;
  body?: string;
  signal?: AbortSignal;
}

export interface Platform {
  readonly name: "node" | "portable";
  /** Settings (the server's environment variables; on a phone, whatever the app passes in). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Default database file and content folder (only meaningful on a server). */
  readonly defaultPaths: { db: string; content: string };
  readonly content: ContentSource;

  randomBytes(n: number): Uint8Array;
  /** A uniformly random integer in [0, maxExclusive). */
  randomInt(maxExclusive: number): number;
  randomUUID(): string;
  sha256(data: Uint8Array): Uint8Array;
  /** scrypt with N = 16384, r = 8, p = 1 (Node's defaults), so hashes made on either platform verify on the other. */
  scrypt(secret: string, salt: Uint8Array, keylen: number): Uint8Array;
  /** Constant-time comparison; false (not an exception) when the lengths differ. */
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Uint8Array;
  aesGcmSeal(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): { ct: Uint8Array; tag: Uint8Array };
  /** null when the key, data, tag or additional data do not match. */
  aesGcmOpen(key: Uint8Array, iv: Uint8Array, ct: Uint8Array, tag: Uint8Array, aad: Uint8Array): Uint8Array | null;
  /** HS256 JSON Web Tokens. verifyJwt throws for a bad signature, another algorithm, or an expired or not-yet-valid token. */
  signJwt(claims: Record<string, unknown>, secret: string): Promise<string>;
  verifyJwt(token: string, secret: string): Promise<Record<string, unknown>>;
  /** 4 or 6 for an IP address, 0 for anything else (like Node's net.isIP). */
  isIP(text: string): 0 | 4 | 6;
  /** Looks a host name up in DNS. Missing where the system offers no DNS lookup (a phone): the address check then only checks the written address. */
  readonly resolveHost?: (host: string) => Promise<string[]>;
  /**
   * A request that connects ONLY to the given addresses, which the caller has already checked, and does no DNS lookup of its own.
   * This closes "DNS rebinding": a name whose answer changes between the address check and the connection cannot reach another
   * address. The certificate is still checked against the host name. Redirects are refused and the response is capped in size.
   * Missing where there is no such control (the phone app, which has no DNS lookup either).
   */
  readonly pinnedFetch?: (url: string, init: PinnedInit, addresses: readonly string[]) => Promise<Response>;
}

/** On Node.js, the Node platform (or the portable crypto when HL_PLATFORM=portable, for tests); anywhere else the portable one. */
function pick(): Platform {
  const proc = (globalThis as { process?: { getBuiltinModule?: unknown; env?: Record<string, string | undefined> } }).process;
  if (typeof proc?.getBuiltinModule !== "function") return createPortablePlatform();
  const node = createNodePlatform();
  if (proc.env?.HL_PLATFORM !== "portable") return node;
  // Portable crypto, tokens and IP parsing; files, settings and DNS from Node, so a test run checks the same addresses.
  return createPortablePlatform({ env: node.env, defaultPaths: node.defaultPaths, content: node.content, resolveHost: node.resolveHost, pinnedFetch: node.pinnedFetch });
}

let active: Platform | undefined;

/** The platform in use. Chosen on first use. */
export function pf(): Platform {
  return (active ??= pick());
}

/** Replaces the platform: the phone app does this before its first request, tests to compare both. */
export function setPlatform(p: Platform): void {
  active = p;
}
