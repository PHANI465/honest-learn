import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// Where things are kept:
//  - the family sign-in token → Keychain/Keystore (expo-secure-store) on iOS/Android
//  - offline copies of learning content and the "send later" outbox (see offline.ts) → AsyncStorage.
//    These can be several KB each, which is too big for the Android Keystore, and they hold no secrets.
//  - web: localStorage for everything.
// Never stored anywhere: the parent token, parent-area data and Hoot chats.
const SECURE_KEYS = new Set(["hl.familyToken"]);

export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    try {
      return SECURE_KEYS.has(key) ? await SecureStore.getItemAsync(key) : await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* storage unavailable (private mode or full) — the app keeps working without it */
      }
      return;
    }
    if (SECURE_KEYS.has(key)) await SecureStore.setItemAsync(key, value);
    else await AsyncStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        /* ignore */
      }
      return;
    }
    if (SECURE_KEYS.has(key)) await SecureStore.deleteItemAsync(key);
    else await AsyncStorage.removeItem(key);
  },
};
