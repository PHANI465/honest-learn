// Standalone mode on a phone (task T8): the API with the phone's own database, random numbers, secrets and the bundled content.
// lib/local-backend.native.ts opens it on the first request when the family chose "On this phone only" (app/start.tsx).
//
// Phones only: expo-sqlite on the web needs WebAssembly and extra HTTP headers, and the website always has its server.
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { toBase64 } from "../../../server/src/bytes.ts";
import { contentFiles } from "./content-files.generated";
import { createLocalApi, type LocalApi } from "./core";
import { expoSqliteAdapter } from "./sqlite-adapter";

/** The database file in the app's private storage. */
export const DEVICE_DB_NAME = "honest-learn.db";
const SECRET_KEYS = { tokenSecret: "hl.device.tokenSecret", aiKeySecret: "hl.device.aiKeySecret" } as const;

/**
 * Secure random bytes from the phone (expo-crypto's getRandomValues, which uses the system's generator). Filled in small pieces;
 * never expo-crypto's getRandomBytes, which falls back to Math.random in development.
 */
function getRandomValues(array: Uint8Array): Uint8Array {
  for (let at = 0; at < array.length; at += 1024) Crypto.getRandomValues(array.subarray(at, Math.min(at + 1024, array.length)));
  return array;
}

/** A secret kept in the Keychain (iOS) or Keystore (Android), made on first use. Removing the app removes it. */
async function deviceSecret(key: string): Promise<string> {
  const existing = await SecureStore.getItemAsync(key);
  if (existing) return existing;
  const fresh = toBase64(getRandomValues(new Uint8Array(48)));
  await SecureStore.setItemAsync(key, fresh);
  return fresh;
}

export async function openDeviceApi(): Promise<LocalApi> {
  const secrets = { tokenSecret: await deviceSecret(SECRET_KEYS.tokenSecret), aiKeySecret: await deviceSecret(SECRET_KEYS.aiKeySecret) };
  const db = await SQLite.openDatabaseAsync(DEVICE_DB_NAME);
  const adapter = await expoSqliteAdapter(db);
  return createLocalApi({ adapter, files: contentFiles, getRandomValues, secrets });
}
