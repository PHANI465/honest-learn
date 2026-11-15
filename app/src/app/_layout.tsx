import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { registerServiceWorker } from "../lib/pwa";
import { SessionProvider, useSession } from "../lib/session";
import { colors } from "../lib/theme";

// The launch screen (app.json, "expo-splash-screen") stays up until the app has read what it needs to show its first screen: the
// saved sign-in, the chosen server or on-phone mode. Without this the first screen could flash an empty page. Called once, outside
// any component, as the package asks. On the website this does nothing.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });
/** Never keep a family looking at a launch screen: if the app is not ready by then, show whatever it has. */
const SPLASH_LONGEST_MS = 6000;

/** Hides the launch screen as soon as the session has loaded (or after SPLASH_LONGEST_MS, whichever comes first). */
function HideSplashWhenReady() {
  const { ready } = useSession();
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hide(), SPLASH_LONGEST_MS);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

export default function RootLayout() {
  useEffect(registerServiceWorker, []);
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <HideSplashWhenReady />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
