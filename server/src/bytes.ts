// Bytes, text and base64 without Node's Buffer, so the same code runs on the server, in a browser and in the phone app
// (React Native's JavaScript engine has no Buffer). Output matches Buffer's "base64" and "base64url" encodings exactly.

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

export const utf8 = (text: string): Uint8Array => encoder.encode(text);
export const fromUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes);
/** Size of a string in UTF-8 bytes (what Buffer.byteLength(text, "utf8") returns). */
export const utf8Length = (text: string): number => encoder.encode(text).length;

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;
LOOKUP["-".charCodeAt(0)] = 62; // base64url
LOOKUP["_".charCodeAt(0)] = 63;

/** Standard base64 with "=" padding. */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + "==";
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + "=";
  }
  return out;
}

/** base64url without padding (JWTs, our sealed keys). */
export const toBase64Url = (bytes: Uint8Array): string => toBase64(bytes).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/**
 * Decodes base64 or base64url, with or without padding. Like Buffer.from(text, "base64"), it stops at the first character
 * that is not part of the alphabet (after skipping white space), so damaged input gives shorter output, never an exception.
 */
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[\s]/g, "");
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const v = code < 128 ? LOOKUP[code]! : -1;
    if (v < 0) break; // "=" padding or anything else ends the data
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}
