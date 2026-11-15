// The address of the Honest Learn server this phone talks to. Pure functions only (no React Native imports), so they are tested
// from server/test/server-address.test.ts. The screen and the saving are in lib/server.ts and app/server.tsx.
//
// Why this exists: a store-built phone app has no website to talk to. A family points it at a server they run or trust (their own
// computer on the home Wi-Fi, a hosted copy). Everything the app sends (sign-in, progress, chats) goes to that address, so the app
// is strict about it: https for anything outside the home network, plain http only for localhost and private network addresses.

export type AddressResult = { ok: true; url: string; local: boolean } | { ok: false; error: string };

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const NAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** localhost, loopback, a private IPv4 range (10.x, 172.16 to 31.x, 192.168.x, link-local 169.254.x) or a .local name. */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "[::1]" || h.endsWith(".local") || h.endsWith(".localhost")) return true;
  const m = IPV4.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function validHost(host: string): boolean {
  if (host === "[::1]") return true;
  const m = IPV4.exec(host);
  if (m) return m.slice(1, 5).every((p) => Number(p) <= 255);
  return NAME.test(host);
}

/**
 * Turns what a person typed into a clean base address, or says what is wrong in plain words.
 * "192.168.1.20:8787" becomes "http://192.168.1.20:8787"; "learn.example.org" becomes "https://learn.example.org".
 */
export function normalizeServerAddress(input: string): AddressResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Type the address of your server." };
  if (/\s/.test(raw)) return { ok: false, error: "An address cannot contain spaces." };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `//${raw}`;
  const m = /^(?:([a-z][a-z0-9+.-]*):)?\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(withScheme);
  if (!m) return { ok: false, error: "That does not look like a web address." };
  const [, schemeIn, authority = "", path = "", query, fragment] = m;
  if (schemeIn && !/^https?$/i.test(schemeIn)) return { ok: false, error: "The address must start with https:// or http://." };
  if (query || fragment) return { ok: false, error: "Leave out anything after a question mark or a # sign." };
  if (authority.includes("@")) return { ok: false, error: "Leave out any user name or password in the address." };
  const hp = /^(\[::1\]|[^:]+)(?::(\d{1,5}))?$/.exec(authority);
  if (!hp) return { ok: false, error: "That does not look like a web address." };
  const host = hp[1]!.toLowerCase();
  const port = hp[2] ? Number(hp[2]) : null;
  if (!validHost(host)) return { ok: false, error: "That host name does not look right." };
  if (port !== null && (port < 1 || port > 65535)) return { ok: false, error: "The port number must be between 1 and 65535." };
  const local = isLocalHost(host);
  const scheme = schemeIn ? schemeIn.toLowerCase() : local ? "http" : "https";
  if (scheme === "http" && !local) {
    return { ok: false, error: "Use https:// for a server outside your home network. Plain http is only allowed for a computer on your own Wi-Fi (an address like 192.168.1.20)." };
  }
  const cleanPath = path.replace(/\/+$/, "");
  return { ok: true, url: `${scheme}://${host}${port !== null ? `:${port}` : ""}${cleanPath}`, local };
}

/** Where the API might live: the address itself (a standalone server) or under /api (the hosted layout). */
export function candidateBases(url: string): string[] {
  return /\/api$/.test(url) ? [url] : [url, `${url}/api`];
}

export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Whether `base` answers like an Honest Learn server: GET /health returns { ok: true }. */
export async function probeServer(base: string, fetcher: Fetcher, timeoutMs = 6000): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetcher(`${base}/health`, { signal: ctl.signal });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: unknown } | null;
    return body?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type ConnectResult = { ok: true; base: string; local: boolean } | { ok: false; error: string };

/** Checks what was typed and finds the working API address. Nothing is saved here. */
export async function findServer(input: string, fetcher: Fetcher, timeoutMs = 6000): Promise<ConnectResult> {
  const n = normalizeServerAddress(input);
  if (!n.ok) return n;
  for (const base of candidateBases(n.url)) {
    if (await probeServer(base, fetcher, timeoutMs)) return { ok: true, base, local: n.local };
  }
  return {
    ok: false,
    error: n.local
      ? "Could not reach that address. Check that the server is running, that your phone is on the same Wi-Fi, and the port number."
      : "Could not reach that address, or it is not an Honest Learn server. Check the spelling and your internet connection.",
  };
}
