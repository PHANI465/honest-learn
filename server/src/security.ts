import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from "node:crypto";
import { sign, verify } from "hono/jwt";
import { config } from "./config.ts";

// ---- password / PIN hashing (scrypt, per-hash random salt) ----
const KEYLEN = 64;

export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(secret, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

export const newId = () => randomUUID();

// ---- session tokens ----
// "family" token: the signed-in device. Lets a child use the app (learn, quiz, tutor).
// "parent" token: short-lived, issued only after the parent enters their PIN.
//   Required for anything a child must not do alone: profiles, sensitive topics, chat review, account.
export type Scope = "family" | "parent";
export interface TokenClaims {
  sub: string; // parent id
  scope: Scope;
  exp: number;
  [key: string]: unknown;
}

export async function issueToken(parentId: string, scope: Scope): Promise<string> {
  const seconds =
    scope === "family" ? config.security.familyTokenDays * 86400 : config.security.parentTokenMinutes * 60;
  const claims: TokenClaims = { sub: parentId, scope, exp: Math.floor(Date.now() / 1000) + seconds };
  return sign(claims, config.tokenSecret, "HS256");
}

export async function readToken(token: string): Promise<TokenClaims | null> {
  try {
    const claims = (await verify(token, config.tokenSecret, "HS256")) as TokenClaims;
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
