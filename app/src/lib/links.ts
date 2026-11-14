import { Linking } from "react-native";

/** The address, but only when it is a normal https web address. Anything else (javascript:, file:, http:) is refused. */
export function safeUrl(url: string | null | undefined): string | null {
  try {
    const u = new URL(String(url ?? ""));
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Opens an outside website, and does nothing for an address that is not https. */
export function openSafely(url: string | null | undefined): void {
  const ok = safeUrl(url);
  if (ok) Linking.openURL(ok).catch(() => {});
}
