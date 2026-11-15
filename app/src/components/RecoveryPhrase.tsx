import { useState } from "react";
import { Text, View } from "react-native";
import { colors } from "../lib/theme";
import { Banner, Button, Card, H2, P, Toggle } from "./ui";

/**
 * Shows a recovery phrase once (standalone mode, where there is no email to reset a password). The app never stores it and
 * the API keeps only a hash, so this is the only time it can be read. Continue is enabled after the parent says it is written down.
 */
export function RecoveryPhrase({ phrase, onDone, doneTitle = "Continue" }: { phrase: string; onDone: () => void; doneTitle?: string }) {
  const [written, setWritten] = useState(false);
  return (
    <Card style={{ gap: 12 }}>
      <H2>Your recovery phrase</H2>
      <P size={15}>
        If you forget your password, this phrase is the only way back into your account on this phone. Write it on paper and keep it
        somewhere safe, away from the children. It is shown only now.
      </P>
      <View
        accessible
        accessibilityLabel={`Recovery phrase: ${phrase.split("").join(" ")}`}
        style={{ backgroundColor: colors.brandSoft, borderRadius: 12, padding: 16, alignItems: "center" }}
      >
        <Text selectable style={{ fontSize: 24, fontWeight: "800", letterSpacing: 2, color: colors.ink, fontFamily: "monospace", textAlign: "center" }}>
          {phrase.split("-").join("  ")}
        </Text>
      </View>
      <P muted size={13}>Letters and numbers only. Upper or lower case and spaces do not matter when you type it.</P>
      <Banner tone="info">Do not keep it only on this phone: if the phone is lost, a copy on it is lost too.</Banner>
      <Toggle label="I have written down my recovery phrase" value={written} onChange={setWritten} />
      <Button big title={doneTitle} onPress={onDone} disabled={!written} />
    </Card>
  );
}
