import { fromBase64, toBase64 } from "./bytes.ts";
import { config } from "./config.ts";
import { pf } from "./platform.ts";

// ---- password / PIN hashing (scrypt, per-hash random salt) ----
const KEYLEN = 64;

export function hashSecret(secret: string): string {
  const salt = pf().randomBytes(16);
  const hash = pf().scrypt(secret, salt, KEYLEN);
  return `scrypt$${toBase64(salt)}$${toBase64(hash)}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = fromBase64(hashB64);
  if (!expected.length) return false;
  const actual = pf().scrypt(secret, fromBase64(saltB64), expected.length);
  return pf().timingSafeEqual(expected, actual);
}

export const newId = () => pf().randomUUID();

// ---- session tokens ----
// "family" token: the signed-in device. Lets a child use the app (learn, quiz, tutor).
// "parent" token: short-lived, issued only after the parent enters their PIN.
//   Required for anything a child must not do alone: profiles, sensitive topics, chat review, account.
export type Scope = "family" | "parent";
export interface TokenClaims {
  sub: string; // parent id
  scope: Scope;
  exp: number;
  /** Session version: tokens with an older version than the account's are rejected ("sign out everywhere", password reset). */
  v?: number;
  [key: string]: unknown;
}

export async function issueToken(parentId: string, scope: Scope, version = 0): Promise<string> {
  const seconds =
    scope === "family" ? config.security.familyTokenDays * 86400 : config.security.parentTokenMinutes * 60;
  const claims: TokenClaims = { sub: parentId, scope, v: version, exp: Math.floor(Date.now() / 1000) + seconds };
  return pf().signJwt(claims, config.tokenSecret);
}

export async function readToken(token: string): Promise<TokenClaims | null> {
  try {
    const claims = (await pf().verifyJwt(token, config.tokenSecret)) as TokenClaims;
    if (claims.scope !== "family" && claims.scope !== "parent") return null;
    return claims;
  } catch {
    return null;
  }
}

// ---- age bands ----
export const BANDS = [
  { id: "b1", min: 3, max: 5 },
  { id: "b2", min: 6, max: 8 },
  { id: "b3", min: 9, max: 11 },
  { id: "b4", min: 12, max: 14 },
  { id: "b5", min: 15, max: 18 },
] as const;
export type BandId = (typeof BANDS)[number]["id"];

export function ageFromBirthYear(birthYear: number, today = new Date()): number {
  return today.getFullYear() - birthYear;
}

export function bandForAge(age: number): BandId {
  if (age <= 5) return "b1";
  if (age >= 15) return "b5";
  return BANDS.find((b) => age >= b.min && age <= b.max)!.id;
}
