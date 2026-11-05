import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { registerServiceWorker } from "../lib/pwa";
import { SessionProvider } from "../lib/session";
import { colors } from "../lib/theme";

export default function RootLayout() {
  useEffect(registerServiceWorker, []);
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
