// Standalone mode on a phone (task T8): the API with the phone's own database, random numbers and the bundled content.
// 8c calls openDeviceApi() when a family chooses "Use on this device only"; until then nothing imports this file.
//
// Phones only: expo-sqlite on the web needs WebAssembly and extra HTTP headers, and the website always has its server.
import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";
import { contentFiles } from "./content-files.generated";
import { createLocalApi, type LocalApi } from "./core";
import { expoSqliteAdapter } from "./sqlite-adapter";

/** The database file in the app's private storage. */
export const DEVICE_DB_NAME = "honest-learn.db";

/**
 * Secure random bytes from the phone (expo-crypto's getRandomValues, which uses the system's generator). Filled in small pieces;
 * never expo-crypto's getRandomBytes, which falls back to Math.random in development.
 */
function getRandomValues(array: Uint8Array): Uint8Array {
  for (let at = 0; at < array.length; at += 1024) Crypto.getRandomValues(array.subarray(at, Math.min(at + 1024, array.length)));
  return array;
}

export async function openDeviceApi(): Promise<LocalApi> {
  const db = await SQLite.openDatabaseAsync(DEVICE_DB_NAME);
  const adapter = await expoSqliteAdapter(db);
  return createLocalApi({ adapter, files: contentFiles, getRandomValues });
}
