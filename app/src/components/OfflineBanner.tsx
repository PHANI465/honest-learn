import { Text, View } from "react-native";
import { usePendingCompletions, useOffline } from "../lib/offline";
import { colors } from "../lib/theme";

/**
 * Small, friendly notice on learning screens when there's no internet (or the screen is showing a saved copy).
 * Announced politely by screen readers, without interrupting.
 */
export function OfflineBanner({ fromCache = false }: { fromCache?: boolean }) {
  const offline = useOffline();
  const pending = usePendingCompletions();
  if (!offline && !fromCache) return null;
  return (
    <View
      style={{ backgroundColor: colors.brandSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, gap: 2 }}
      accessibilityLiveRegion="polite"
      aria-live="polite"
      testID="offline-banner"
    >
      <Text style={{ color: colors.brand, fontSize: 15, fontWeight: "700", lineHeight: 21 }}>You're offline: showing saved lessons</Text>
      {pending > 0 ? (
        <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 20 }}>
          {pending === 1 ? "1 finished lesson" : `${pending} finished lessons`} will be sent when you're back online.
        </Text>
      ) : null}
    </View>
  );
}
