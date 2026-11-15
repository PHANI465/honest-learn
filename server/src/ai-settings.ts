// A family's own AI model for Hoot ("bring your own key"), set in the PIN-protected parent area.
//
// Two dangers, two defences:
//
//  1. The API key is a secret. It is stored only encrypted (AES-256-GCM) with a key derived by HKDF from a server secret and the
//     parent's id, and bound to that parent (the id is the GCM "additional data", so a ciphertext copied to another row will not
//     open). It is never returned by any route, never exported, never logged. Only its last four characters are kept in plain text,
//     so a parent can tell which key is stored.
//     The server secret is AI_KEY_SECRET if set, otherwise the token secret. With no TOKEN_SECRET set, the token secret is kept in
//     the database, next to the ciphertext, so a copy of the database would expose the keys: set AI_KEY_SECRET (or TOKEN_SECRET)
//     in the environment for a real deployment. See docs/SECURITY.md.
//
//  2. The model address is chosen by the family, so the server could be pointed at its own private network ("server-side request
//     forgery"). Addresses must be https, except http to the local machine or private network when ALLOW_LOCAL_LLM is on (the
//     default off Vercel; always off on Vercel). The host name is resolved before EVERY request and refused if any address is
//     link-local or a cloud metadata address (169.254.0.0/16 and friends), unspecified, multicast, or private while local models
//     are not allowed. Redirects are never followed. What the model server answers is never shown to the parent, only a short
//     category ("could not connect", "the key was refused" ...), so the guard cannot be used to read internal pages.
//     Remaining risk, written down on purpose: a name whose DNS answer changes between the check and the connection (DNS
//     rebinding) is not fully prevented by checking before connecting.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { config } from "./config.ts";

export const PROVIDERS = ["ollama", "lmstudio", "openrouter", "groq", "custom"] as const;
export type Provider = (typeof PROVIDERS)[number];

// ---------------------------------------------------------------- the key, encrypted at rest
const VERSION = "v1";
const INFO = Buffer.from("honest-learn/ai-key/v1");

function keyFor(parentId: string): Buffer {
  const secret = config.aiKeySecret || config.tokenSecret;
  if (!secret) throw new Error("no server secret for encrypting keys");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.from(parentId, "utf8"), INFO, 32));
}

const b64 = (b: Buffer) => b.toString("base64url");

/** Encrypts an API key for one parent: "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function sealKey(plain: string, parentId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(parentId), iv);
  cipher.setAAD(Buffer.from(parentId, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(ct)].join(".");
}

/** Decrypts a stored key, or null if it cannot be opened (wrong parent, changed server secret, damaged value). */
export function openKey(sealed: string, parentId: string): string | null {
  try {
    const [v, iv, tag, ct] = sealed.split(".");
    if (v !== VERSION || !iv || !tag || !ct) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFor(parentId), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(parentId, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** What may be shown about a key: its last four characters, only if it is long enough that this reveals little. */
export const lastFour = (key: string) => (key.length >= 16 ? key.slice(-4) : null);

// ---------------------------------------------------------------- the address
export type IpClass = "public" | "private" | "forbidden";

function v4Parts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  return m ? m.slice(1, 5).map(Number) : null;
}

/** Sorts an IP address into public, private (this machine or the local network) and forbidden (never reachable from here). */
export function classifyIp(ip: string): IpClass {
  let addr = ip.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) addr = mapped[1]!;
  const p = v4Parts(addr);
  if (p) {
    const [a, b] = p as [number, number, number, number];
    if (p.some((x) => x > 255)) return "forbidden";
    if (a === 0 || a >= 224) return "forbidden"; // unspecified, multicast, reserved, broadcast
    if (a === 169 && b === 254) return "forbidden"; // link-local, including the cloud metadata address 169.254.169.254
    if (a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return "private";
    return "public";
  }
  if (isIP(addr) !== 6) return "forbidden";
  if (addr === "::" || addr.startsWith("ff")) return "forbidden"; // unspecified, multicast
  if (/^fe[89ab]/.test(addr)) return "forbidden"; // link-local fe80::/10
  if (addr.startsWith("fd00:ec2:")) return "forbidden"; // AWS metadata over IPv6
  if (addr === "::1" || /^f[cd]/.test(addr)) return "private"; // loopback, unique local fc00::/7
  return "public";
}

export type UrlCheck = { ok: true; url: string; host: string } | { ok: false; error: string };

/** Checks the written form of a model address. The host is checked again, resolved, before every request. */
export function checkBaseUrl(raw: string, allowLocal = config.allowLocalLlm): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That is not a valid address. It should look like https://example.org/v1." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "The address must start with https://." };
  if (u.username || u.password) return { ok: false, error: "Put the key in the key field, not in the address." };
  if (u.search || u.hash) return { ok: false, error: "Leave out anything after a question mark or a # sign." };
  const host = u.hostname.toLowerCase();
  const literal = isIP(host.replace(/^\[|\]$/g, "")) ? classifyIp(host) : null;
  const localName = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local");
  const local = literal === "private" || localName;
  if (literal === "forbidden") return { ok: false, error: "That address is not allowed." };
  if (local && !allowLocal) return { ok: false, error: "This server does not allow models on a local network. Use a hosted service with an https:// address." };
  if (u.protocol === "http:" && !local) return { ok: false, error: "Use https:// for a model on the internet. Plain http is only for a model on this computer or your home network." };
  const url = `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
  return { ok: true, url, host };
}

export type Resolver = (host: string) => Promise<{ address: string }[]>;
const systemResolver: Resolver = (host) => lookup(host, { all: true, verbatim: true });

/** Resolves the host and refuses it if any address is forbidden, or private while local models are not allowed. */
export async function checkResolvedHost(host: string, allowLocal = config.allowLocalLlm, resolve: Resolver = systemResolver): Promise<{ ok: true } | { ok: false; error: string }> {
  const bare = host.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(bare) ? [bare] : (await resolve(bare)).map((a) => a.address);
  } catch {
    return { ok: false, error: "unreachable" };
  }
  if (!addresses.length) return { ok: false, error: "unreachable" };
  for (const a of addresses) {
    const cls = classifyIp(a);
    if (cls === "forbidden") return { ok: false, error: "blocked_address" };
    if (cls === "private" && !allowLocal) return { ok: false, error: "blocked_address" };
  }
  return { ok: true };
}

/** A fetch for family model servers: checks the address again before each request and never follows a redirect. */
export function guardedFetch(allowLocal = config.allowLocalLlm, resolve: Resolver = systemResolver, inner: typeof fetch = fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const written = checkBaseUrl(url.href.replace(/\/chat\/completions$/, ""), allowLocal);
    if (!written.ok) throw new Error("blocked_address");
    const resolved = await checkResolvedHost(url.hostname, allowLocal, resolve);
    if (!resolved.ok) throw new Error(resolved.error);
    return inner(url.href, { ...init, redirect: "error" });
  }) as typeof fetch;
}

// ---------------------------------------------------------------- what the parent sends
/** No spaces or control characters: the key goes into an HTTP header. */
const ApiKey = z.string().trim().min(8).max(500).regex(/^[\x21-\x7e]+$/, "The key contains characters that are not allowed.");
const Model = z.string().trim().min(1).max(120).regex(/^[\w.:/@+-]+$/, "Use the model's exact name, like llama3.2 or openai/gpt-4o-mini.");

export const AiSettingsInput = z.object({
  password: z.string().max(200),
  provider: z.enum(PROVIDERS),
  baseUrl: z.string().max(300),
  model: Model,
  safetyModel: Model.optional(),
  /** Omit to keep the stored key (only allowed when the host does not change); null or "" removes it. */
  apiKey: z.union([ApiKey, z.literal(""), z.null()]).optional(),
});

/** A row of ai_settings. */
export interface AiSettingsRow {
  parent_id: string;
  provider: Provider;
  base_url: string;
  model: string;
  safety_model: string | null;
  key_cipher: string | null;
  key_last4: string | null;
  updated_at: string;
}

/** Everything the parent area may see. Never the key. */
export function publicSettings(row: AiSettingsRow | null | undefined) {
  if (!row) return { configured: false as const, allowLocal: config.allowLocalLlm };
  const keyUnreadable = !!row.key_cipher && openKey(row.key_cipher, row.parent_id) === null;
  return {
    configured: true as const,
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    safetyModel: row.safety_model,
    hasKey: !!row.key_cipher && !keyUnreadable,
    keyLast4: row.key_last4,
    keyUnreadable,
    // only the project's default helper has been through its safety test set
    tested: false,
    updatedAt: row.updated_at,
    allowLocal: config.allowLocalLlm,
  };
}

/** Options for OpenAICompatTutor from a family's settings. */
export function tutorOptions(row: AiSettingsRow) {
  const apiKey = row.key_cipher ? openKey(row.key_cipher, row.parent_id) ?? "" : "";
  return {
    baseUrl: row.base_url,
    apiKey,
    model: row.model,
    safetyModel: row.safety_model ?? row.model,
    timeoutMs: config.tutor.openai.timeoutMs,
  };
}

/** Turns a failure into a short, safe category for the parent. Never the model server's own words. */
export function errorCategory(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg === "blocked_address") return "blocked_address";
  if (msg === "unreachable") return "unreachable";
  if (/redirect/i.test(msg)) return "redirect";
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "timeout";
  const status = /answered (\d{3})/.exec(msg)?.[1];
  if (status === "401" || status === "403") return "key_refused";
  if (status === "404") return "model_not_found";
  if (status === "429") return "rate_limited";
  if (status && status.startsWith("5")) return "server_error";
  return "unreachable";
}
