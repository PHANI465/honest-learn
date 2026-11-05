import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../lib/theme";

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  const inner = <View style={[styles.inner, style]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function H1({ children, size = 28 }: { children: ReactNode; size?: number }) {
  return <Text style={[styles.h1, { fontSize: size }]} accessibilityRole="header">{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2} accessibilityRole="header">{children}</Text>;
}
export function P({ children, muted, size = 16, center }: { children: ReactNode; muted?: boolean; size?: number; center?: boolean }) {
  return (
    <Text style={[styles.p, { fontSize: size, lineHeight: size * 1.45 }, muted && { color: colors.muted }, center && { textAlign: "center" }]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress, label }: { children: ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void; label?: string }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = "primary",
  color = colors.brand,
  loading,
  disabled,
  big,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  color?: string;
  loading?: boolean;
  disabled?: boolean;
  big?: boolean;
}) {
  const bg = kind === "primary" ? color : kind === "danger" ? colors.danger : "transparent";
  const fg = kind === "primary" || kind === "danger" ? "#fff" : color;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [
        styles.btn,
        big && { paddingVertical: 18 },
        { backgroundColor: bg, borderColor: kind === "secondary" ? color : "transparent" },
        kind === "secondary" && { borderWidth: 2 },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }, big && { fontSize: 19 }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#9AA0AA" style={styles.input} accessibilityLabel={label} {...props} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Banner({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "good" | "info" }) {
  const bg = tone === "warn" ? colors.warnSoft : tone === "good" ? colors.goodSoft : colors.brandSoft;
  const fg = tone === "warn" ? colors.warn : tone === "good" ? colors.good : colors.brand;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Text style={{ color: fg, fontSize: 15, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}

export function Pill({ text, color = colors.muted, bg = "#F1EEE8" }: { text: string; color?: string; bg?: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 13, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

export function Toggle({ label, value, onChange, description }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={styles.toggleRow}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, color: colors.ink, fontWeight: "600" }}>{label}</Text>
        {description ? <Text style={styles.hint}>{description}</Text> : null}
      </View>
      <View style={[styles.track, value && { backgroundColor: colors.brand }]}>
        <View style={[styles.knob, value && { transform: [{ translateX: 20 }] }]} />
      </View>
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40, backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1 },
  inner: { flex: 1, padding: 20, gap: 16, width: "100%", maxWidth: 720, alignSelf: "center" },
  h1: { fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: "700", color: colors.ink, marginTop: 8 },
  p: { color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 8 },
  btn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, alignItems: "center", justifyContent: "center", minHeight: 50 },
  btnText: { fontSize: 17, fontWeight: "700" },
  label: { fontSize: 15, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    backgroundColor: "#fff",
    color: colors.ink,
  },
  banner: { padding: 14, borderRadius: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  track: { width: 50, height: 30, borderRadius: 15, backgroundColor: "#D5D0C7", padding: 3 },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff" },
});
