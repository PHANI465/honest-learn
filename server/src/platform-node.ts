// The server's platform: Node.js crypto, files, DNS and environment. See platform.ts.
//
// Node modules are fetched with process.getBuiltinModule (Node 22.3+) instead of `import ... from "node:..."`, so this file
// can sit in the same bundle as the phone app without the bundler trying to find Node modules there. Nothing here runs
// unless platform.ts finds Node.js. The small interfaces below describe only the parts of each module this file uses.
import { sign, verify } from "hono/jwt";
import type { ContentSource, PinnedInit, Platform } from "./platform.ts";

/** The part of node:http and node:https that pinnedFetch uses. */
interface NodeHttp {
  request(
    url: URL,
    options: {
      method: string;
      headers: Record<string, string>;
      signal?: AbortSignal;
      agent?: false;
      lookup: (host: string, options: unknown, callback?: unknown) => void;
    },
    onResponse: (res: NodeIncoming) => void,
  ): NodeOutgoing;
}
interface NodeIncoming {
  statusCode?: number;
  headers: Record<string, string | string[] | undefined>;
  on(event: "data", fn: (chunk: Uint8Array) => void): unknown;
  on(event: "end", fn: () => void): unknown;
  on(event: "error", fn: (err: Error) => void): unknown;
  resume(): void;
}
interface NodeOutgoing {
  on(event: "error", fn: (err: Error) => void): unknown;
  write(data: string): unknown;
  end(): unknown;
  destroy(err?: Error): unknown;
}
/** The most a family's model server may send back (a chat answer is a few kilobytes). */
const MAX_PINNED_RESPONSE_BYTES = 1_000_000;

interface NodeCrypto {
  randomBytes(n: number): Uint8Array;
  randomInt(max: number): number;
  randomUUID(): string;
  createHash(algorithm: "sha256"): { update(data: Uint8Array): { digest(): Uint8Array } };
  scryptSync(secret: string, salt: Uint8Array, keylen: number): Uint8Array;
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  hkdfSync(digest: "sha256", ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): ArrayBuffer;
  createCipheriv(algorithm: "aes-256-gcm", key: Uint8Array, iv: Uint8Array): {
    setAAD(aad: Uint8Array): unknown;
    update(data: Uint8Array): Uint8Array;
    final(): Uint8Array;
    getAuthTag(): Uint8Array;
  };
  createDecipheriv(algorithm: "aes-256-gcm", key: Uint8Array, iv: Uint8Array): {
    setAAD(aad: Uint8Array): unknown;
    setAuthTag(tag: Uint8Array): unknown;
    update(data: Uint8Array): Uint8Array;
    final(): Uint8Array;
  };
}
interface NodeFs {
  readFileSync(path: string, encoding: "utf8"): string;
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean };
}
interface NodePath {
  join(...parts: string[]): string;
  dirname(path: string): string;
  resolve(...parts: string[]): string;
}

/** A Node.js built-in module, for the few server-only places outside this file (the SQLite driver in db.ts). */
export function nodeBuiltin<T>(id: string): T {
  const get = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process?.getBuiltinModule;
  if (typeof get !== "function") throw new Error(`${id} is only available on Node.js 22.3 or newer`);
  const mod = get(id);
  if (!mod) throw new Error(`${id} is not available in this Node.js`);
  return mod as T;
}

/** A plain Uint8Array view (no copy): Buffers must not leak out, they behave differently (toString, slice) from what the portable platform returns. */
const bytes = (b: Uint8Array | ArrayBuffer) => (b instanceof Uint8Array ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b));

export function createNodePlatform(): Platform {
  const crypto = nodeBuiltin<NodeCrypto>("node:crypto");
  const fs = nodeBuiltin<NodeFs>("node:fs");
  const path = nodeBuiltin<NodePath>("node:path");
  const { fileURLToPath } = nodeBuiltin<{ fileURLToPath(url: string): string }>("node:url");
  const { lookup } = nodeBuiltin<{ lookup(host: string, opts: { all: true; verbatim: true }): Promise<{ address: string }[]> }>("node:dns/promises");
  const { isIP } = nodeBuiltin<{ isIP(text: string): number }>("node:net");
  const http = nodeBuiltin<NodeHttp>("node:http");
  const https = nodeBuiltin<NodeHttp>("node:https");

  /** See Platform.pinnedFetch. The socket's own DNS step is replaced by the list of already checked addresses. */
  const pinnedFetch = (url: string, init: PinnedInit, addresses: readonly string[]) =>
    new Promise<Response>((resolve, reject) => {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.protocol !== "http:") return reject(new Error("unsupported protocol"));
      if (!addresses.length) return reject(new Error("unreachable"));
      const list = addresses.map((address) => ({ address, family: isIP(address) }));
      // Node asks for one address, or (when it tries IPv4 and IPv6 in turn) for all of them: answer both ways, only from the list.
      const lookup = (_host: string, options: unknown, callback?: unknown) => {
        const done = (typeof options === "function" ? options : callback) as (err: Error | null, a: unknown, f?: number) => void;
        const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;
        if (all) done(null, list);
        else done(null, list[0]!.address, list[0]!.family);
      };
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((value, key) => (headers[key] = value));
      headers["accept-encoding"] = "identity"; // the body is read as it arrives: nothing to decompress
      if (init.body !== undefined) headers["content-length"] = String(new TextEncoder().encode(init.body).length);
      // agent: false = a fresh connection for every request. Pooled connections are kept per host name and port, not per address, so a reused
      // one could outlive the check that allowed it; and a pooled socket the server has just closed makes a request fail at random.
      const req = (u.protocol === "https:" ? https : http).request(u, { method: init.method ?? "GET", headers, signal: init.signal, lookup, agent: false }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return reject(new Error("redirect refused"));
        }
        const chunks: Uint8Array[] = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_PINNED_RESPONSE_BYTES) return req.destroy(new Error("response too large"));
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          const body = new Uint8Array(size);
          let at = 0;
          for (const c of chunks) (body.set(c, at), (at += c.length));
          const out = new Headers();
          for (const [k, v] of Object.entries(res.headers)) for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) out.append(k, one);
          resolve(new Response(status === 204 || status === 205 ? null : body, { status, headers: out }));
        });
      });
      req.on("error", reject);
      if (init.body !== undefined) req.write(init.body);
      req.end();
    });
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const here = path.dirname(fileURLToPath(import.meta.url));

  const content: ContentSource = {
    readJson: (dir, rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8")),
    exists: (dir, rel) => fs.existsSync(path.join(dir, rel)),
    listJson(dir, relDir) {
      const walk = (rel: string): string[] => {
        let out: string[] = [];
        for (const name of fs.readdirSync(path.join(dir, rel))) {
          const child = `${rel}/${name}`;
          if (fs.statSync(path.join(dir, child)).isDirectory()) out = out.concat(walk(child));
          else if (name.endsWith(".json")) out.push(child);
        }
        return out;
      };
      return walk(relDir);
    },
  };

  return {
    name: "node",
    env,
    defaultPaths: { db: path.resolve(here, "../data/honest-learn.db"), content: path.resolve(here, "../../content") },
    content,
    randomBytes: (n) => bytes(crypto.randomBytes(n)),
    randomInt: (max) => crypto.randomInt(max),
    randomUUID: () => crypto.randomUUID(),
    sha256: (data) => bytes(crypto.createHash("sha256").update(data).digest()),
    scrypt: (secret, salt, keylen) => bytes(crypto.scryptSync(secret, salt, keylen)),
    timingSafeEqual: (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b),
    hkdfSha256: (ikm, salt, info, length) => bytes(crypto.hkdfSync("sha256", ikm, salt, info, length)),
    aesGcmSeal(key, iv, plaintext, aad) {
      const c = crypto.createCipheriv("aes-256-gcm", key, iv);
      c.setAAD(aad);
      const head = bytes(c.update(plaintext));
      const tail = bytes(c.final());
      const ct = new Uint8Array(head.length + tail.length);
      ct.set(head);
      ct.set(tail, head.length);
      return { ct, tag: bytes(c.getAuthTag()) };
    },
    aesGcmOpen(key, iv, ct, tag, aad) {
      // Node would accept a shortened tag (4 to 16 bytes); only the full 16 bytes are accepted here, as on the portable side.
      if (tag.length !== 16) return null;
      try {
        const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
        d.setAAD(aad);
        d.setAuthTag(tag);
        const head = bytes(d.update(ct));
        const tail = bytes(d.final());
        const out = new Uint8Array(head.length + tail.length);
        out.set(head);
        out.set(tail, head.length);
        return out;
      } catch {
        return null;
      }
    },
    signJwt: (claims, secret) => sign(claims, secret, "HS256"),
    verifyJwt: async (token, secret) => (await verify(token, secret, "HS256")) as Record<string, unknown>,
    isIP: (text) => isIP(text) as 0 | 4 | 6,
    resolveHost: async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address),
    pinnedFetch,
  };
}
