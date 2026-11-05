import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Secure storage on iOS/Android (Keychain / Keystore). On web, localStorage.
// Stored: the long-lived family token, and offline-mode copies of learning content plus lessons/minutes
// waiting to be sent (see offline.ts). The parent token, parent-area data and Hoot chats are never stored.
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* storage unavailable (private mode) — session simply won't persist */
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
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
    await SecureStore.deleteItemAsync(key);
  },
};
