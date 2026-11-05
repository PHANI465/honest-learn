import { useState } from "react";
import { router } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { friendly } from "../lib/api";
import { useSession } from "../lib/session";
import { colors } from "../lib/theme";
import { Button, H1, P } from "./ui";

/** Number pad for the parent PIN. Calls unlockParent; onSuccess runs after a correct PIN. */
export function PinPad({ title = "Grown-ups only", subtitle, onSuccess, onCancel }: { title?: string; subtitle?: string; onSuccess: (parentToken: string) => void; onCancel?: () => void }) {
  const { unlockParent } = useSession();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    try {
      const token = await unlockParent(value);
      setPin("");
      onSuccess(token);
    } catch (e) {
      setError(friendly(e));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  const press = (d: string) => {
    if (busy) return;
    if (d === "⌫") return setPin((p) => p.slice(0, -1));
    if (pin.length >= 6) return;
    setPin(pin + d);
  };

  return (
    <View style={s.wrap}>
      <Text style={{ fontSize: 44 }}>🔒</Text>
      <H1 size={26}>{title}</H1>
      <P muted center>{subtitle ?? "Enter your parent PIN to continue."}</P>
      <View style={s.dots} accessibilityLabel={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <View key={i} style={[s.dot, i < pin.length && s.dotOn]} />
        ))}
      </View>
      {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : null}
      <View style={s.grid}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) =>
          d === "" ? (
            <View key={i} style={s.key} />
          ) : (
            <Pressable key={i} onPress={() => press(d)} style={({ pressed }) => [s.key, s.keyOn, pressed && { backgroundColor: colors.brandSoft }]} accessibilityRole="button" accessibilityLabel={d === "⌫" ? "Delete" : d}>
              <Text style={s.keyText}>{d}</Text>
            </Pressable>
          ),
        )}
      </View>
      <View style={{ width: "100%", maxWidth: 300, gap: 8 }}>
        <Button title="Unlock" onPress={() => submit(pin)} disabled={pin.length < 4} loading={busy} />
        {onCancel ? <Button title="Cancel" kind="ghost" onPress={onCancel} /> : null}
        <Pressable onPress={() => { onCancel?.(); router.push("/reset-pin"); }} accessibilityRole="link" style={{ alignItems: "center", padding: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 14, textDecorationLine: "underline" }}>Forgot your PIN?</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A PIN prompt in a modal, for one-off grown-up actions (opening links, extending time). */
export function PinModal({ visible, onClose, onSuccess, subtitle }: { visible: boolean; onClose: () => void; onSuccess: (parentToken: string) => void; subtitle?: string }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <PinPad subtitle={subtitle} onCancel={onClose} onSuccess={(token) => { onClose(); onSuccess(token); }} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12, padding: 20 },
  dots: { flexDirection: "row", gap: 14, marginVertical: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.brand },
  dotOn: { backgroundColor: colors.brand },
  error: { color: colors.danger, fontSize: 15, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", width: 270, gap: 12, justifyContent: "center" },
  key: { width: 78, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  keyOn: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.line },
  keyText: { fontSize: 26, fontWeight: "600", color: colors.ink },
  backdrop: { flex: 1, backgroundColor: "rgba(20,20,30,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24, maxHeight: "95%" },
});
