import { useState } from "react";
import { Alert, Platform } from "react-native";
import { openSafely, safeUrl } from "../lib/links";
import { PinModal } from "./PinPad";

/**
 * Opening anything outside Honest Learn:
 *  - under 13: a parent must enter their PIN first (app-store kids rules, and good sense)
 *  - 13+: a clear "you're leaving Honest Learn" confirmation
 */
export function useExternalLink(needsParent: boolean) {
  const [pending, setPending] = useState<string | null>(null);

  function open(url: string) {
    if (!safeUrl(url)) return; // only ordinary https websites are ever opened
    if (needsParent) return setPending(url);
    const msg = "You're leaving Honest Learn to visit another website. Other sites have their own rules. Be careful what you share.";
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(msg)) openSafely(url);
      return;
    }
    Alert.alert("Leaving Honest Learn", msg, [
      { text: "Stay", style: "cancel" },
      { text: "Open", onPress: () => openSafely(url) },
    ]);
  }

  const modal = (
    <PinModal
      visible={!!pending}
      onClose={() => setPending(null)}
      onSuccess={() => openSafely(pending)}
      subtitle="Outside websites open only with a parent's PIN."
    />
  );
  return { open, modal };
}
