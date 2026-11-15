// The platform for places without Node.js: the phone app (task T8) and browsers. See platform.ts.
//
// Crypto is @noble/hashes and @noble/ciphers (MIT, no dependencies, independently audited): never hand-written. Random numbers
// come from crypto.getRandomValues (browsers, Node, and React Native once expo-crypto's polyfill is installed); without one,
// anything that needs randomness throws instead of falling back to Math.random.
//
// Same algorithms and output formats as platform-node.ts (checked in test/platform-contract.test.ts): scrypt N=16384 r=8 p=1,
// HS256 tokens byte for byte identical to hono/jwt, AES-256-GCM with a 16-byte tag.
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { scrypt as nobleScrypt } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { fromBase64, fromUtf8, toBase64Url, utf8 } from "./bytes.ts";
import type { ContentSource, PinnedInit, Platform } from "./platform.ts";

export interface PortableOptions {
  env?: Record<string, string | undefined>;
  defaultPaths?: { db: string; content: string };
  /** Content files (the app passes its bundled copy of content/). Without one, reading content throws. */
  content?: ContentSource;
  /** Fills a byte array with secure random values. Defaults to globalThis.crypto.getRandomValues. */
  getRandomValues?: (array: Uint8Array) => Uint8Array;
  resolveHost?: (host: string) => Promise<string[]>;
  pinnedFetch?: (url: string, init: PinnedInit, addresses: readonly string[]) => Promise<Response>;
}

/** A content source over an object of already-parsed files, keyed by their path under content/ ("lessons/b1/x.json"). */
export function contentFromFiles(files: Readonly<Record<string, unknown>>): ContentSource {
  const keys = Object.keys(files).sort();
  return {
    readJson(_dir, rel) {
      if (!(rel in files)) throw new Error(`content file not found: ${rel}`);
      // a fresh copy each time, like reading the file again: callers may change what they get
      return JSON.parse(JSON.stringify(files[rel]));
    },
    exists: (_dir, rel) => rel in files || keys.some((k) => k.startsWith(rel + "/")),
    listJson: (_dir, relDir) => keys.filter((k) => k.startsWith(relDir + "/") && k.endsWith(".json")),
  };
}

const noContent: ContentSource = {
  readJson: (_dir, rel) => {
    throw new Error(`no content source on this platform (wanted ${rel})`);
  },
  exists: () => false,
  listJson: () => [],
};

// ---------------------------------------------------------------- JSON Web Tokens (HS256), compatible with hono/jwt
const JWT_ALGS = ["HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA"];
const part = (value: unknown) => toBase64Url(utf8(JSON.stringify(value)));

function decodePart(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(fromUtf8(fromBase64(text)));
  if (typeof value !== "object" || value === null) throw new Error("invalid token");
  return value as Record<string, unknown>;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function signJwt(claims: Record<string, unknown>, secret: string): Promise<string> {
  const head = `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}`;
  return `${head}.${toBase64Url(hmac(sha256, utf8(secret), utf8(head)))}`;
}

async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid token");
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodePart(parts[0]!);
    payload = decodePart(parts[1]!);
  } catch {
    throw new Error("invalid token");
  }
  // the same header rules as hono/jwt: a known algorithm, typ absent or "JWT", no "crit"
  if (typeof header.alg !== "string" || !JWT_ALGS.includes(header.alg) || ("typ" in header && header.typ !== "JWT") || "crit" in header) {
    throw new Error("invalid token header");
  }
  if (header.alg !== "HS256") throw new Error("token algorithm mismatch");
  const now = Math.floor(Date.now() / 1000);
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (payload.nbf !== undefined && (!num(payload.nbf) || (payload.nbf as number) > now)) throw new Error("token not yet valid");
  if (payload.exp !== undefined && (!num(payload.exp) || (payload.exp as number) <= now)) throw new Error("token expired");
  if (payload.iat !== undefined && (!num(payload.iat) || now < (payload.iat as number))) throw new Error("token issued in the future");
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(parts[2]!)) throw new Error("invalid token");
  const expected = hmac(sha256, utf8(secret), utf8(`${parts[0]}.${parts[1]}`));
  if (!equalBytes(fromBase64(parts[2]!), expected)) throw new Error("token signature mismatch");
  return payload;
}

// ---------------------------------------------------------------- IP addresses, like Node's net.isIP
const V4_PART = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)";
const V4 = new RegExp(`^${V4_PART}(?:\\.${V4_PART}){3}$`);
const HEX = /^[0-9a-fA-F]{1,4}$/;

export function portableIsIP(text: string): 0 | 4 | 6 {
  if (V4.test(text)) return 4;
  // optional zone ("fe80::1%eth0"), as Node allows
  const zoneAt = text.indexOf("%");
  const addr = zoneAt === -1 ? text : text.slice(0, zoneAt);
  if (zoneAt !== -1 && !/^[0-9a-zA-Z.:-]+$/.test(text.slice(zoneAt + 1))) return 0;
  const halves = addr.split("::");
  if (halves.length > 2) return 0;
  const groups = (s: string): number | null => {
    if (s === "") return 0;
    const items = s.split(":");
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const g = items[i]!;
      if (i === items.length - 1 && V4.test(g)) n += 2; // embedded IPv4 at the end, like ::ffff:1.2.3.4
      else if (HEX.test(g)) n += 1;
      else return null;
    }
    return n;
  };
  if (halves.length === 1) return groups(addr) === 8 ? 6 : 0;
  const left = groups(halves[0]!);
  const right = groups(halves[1]!);
  if (left === null || right === null) return 0;
  // an embedded IPv4 address may only end the whole address
  if (halves[0]!.split(":").some((g) => V4.test(g))) return 0;
  return left + right <= 7 ? 6 : 0;
}

// ---------------------------------------------------------------- the platform
export function createPortablePlatform(opts: PortableOptions = {}): Platform {
  const fill = (array: Uint8Array): Uint8Array => {
    const source = opts.getRandomValues ?? (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto?.getRandomValues?.bind(
      (globalThis as { crypto?: object }).crypto,
    );
    if (!source) throw new Error("No secure random number source on this device (install expo-crypto's getRandomValues)");
    // getRandomValues fills at most 65536 bytes per call
    for (let at = 0; at < array.length; at += 65536) source(array.subarray(at, Math.min(at + 65536, array.length)));
    return array;
  };
  const randomBytes = (n: number) => fill(new Uint8Array(n));

  return {
    name: "portable",
    env: opts.env ?? {},
    defaultPaths: opts.defaultPaths ?? { db: "", content: "" },
    content: opts.content ?? noContent,
    resolveHost: opts.resolveHost,
    pinnedFetch: opts.pinnedFetch,
    randomBytes,
    randomInt(max) {
      if (!Number.isSafeInteger(max) || max <= 0 || max > 2 ** 32) throw new RangeError("randomInt: max must be 1 to 2^32");
      // rejection sampling: no bias towards small numbers
      const limit = 2 ** 32 - (2 ** 32 % max);
      for (;;) {
        const b = randomBytes(4);
        const v = ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0;
        if (v < limit) return v % max;
      }
    },
    randomUUID() {
      const b = randomBytes(16);
      b[6] = (b[6]! & 0x0f) | 0x40; // version 4
      b[8] = (b[8]! & 0x3f) | 0x80; // variant 10xx
      const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },
    sha256: (data) => sha256(data),
    scrypt: (secret, salt, keylen) => nobleScrypt(utf8(secret), salt, { N: 16384, r: 8, p: 1, dkLen: keylen }),
    timingSafeEqual: equalBytes,
    hkdfSha256: (ikm, salt, info, length) => hkdf(sha256, ikm, salt, info, length),
    aesGcmSeal(key, iv, plaintext, aad) {
      const sealed = gcm(key, iv, aad).encrypt(plaintext);
      return { ct: sealed.slice(0, sealed.length - 16), tag: sealed.slice(sealed.length - 16) };
    },
    aesGcmOpen(key, iv, ct, tag, aad) {
      if (tag.length !== 16) return null;
      try {
        const joined = new Uint8Array(ct.length + tag.length);
        joined.set(ct);
        joined.set(tag, ct.length);
        return gcm(key, iv, aad).decrypt(joined);
      } catch {
        return null;
      }
    },
    signJwt,
    verifyJwt,
    isIP: portableIsIP,
  };
}
