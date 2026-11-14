import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { FadeInUp, Pulse, useEnter, useGlide, usePressScale } from "../lib/motion";
import { colors, surfaces } from "../lib/theme";

/** A Pressable that can carry animated styles (press feedback). */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Screen({ children, scroll = true, style, wide }: { children: ReactNode; scroll?: boolean; style?: ViewStyle; wide?: boolean }) {
  const inner = <FadeInUp distance={8} style={[styles.inner, wide && { maxWidth: 1080 }, style]}>{children}</FadeInUp>;
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

/**
 * A card. With `onPress` it is a button that shrinks slightly while pressed. `enterDelay` (milliseconds) makes it
 * fade and rise in when it first appears; give list items `stagger(index)` so they arrive one after another.
 */
export function Card({ children, style, onPress, label, enterDelay }: { children: ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void; label?: string; enterDelay?: number }) {
  const enter = useEnter(enterDelay);
  const press = usePressScale(0.98);
  const entering = enter.on ? { opacity: enter.opacity } : null;
  if (!onPress) {
    if (!enter.on) return <View style={[styles.card, style]}>{children}</View>;
    return <Animated.View style={[styles.card, style, entering, { transform: [{ translateY: enter.translateY }] }]}>{children}</Animated.View>;
  }
  return (
    <AnimatedPressable
      onPress={onPress}
      {...press.handlers}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.card, style, entering, { transform: [{ translateY: enter.translateY }, ...press.style.transform] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Screen readers would read "‹" or "🎉" aloud, so labels default to the title without symbols. */
export function spokenLabel(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}‍️‹›→←↗]/gu, "").replace(/\s+/g, " ").trim() || text;
}

/** A thin progress bar (value 0–1) with an accessible description. */
export function ProgressBar({ value, color = colors.brand, label, height = 10 }: { value: number; color?: string; label: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  // The fill is as wide as the track and slides in from the left, so only a transform is animated.
  const [width, setWidth] = useState(0);
  const t = useGlide(pct, 600);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, borderRadius: height, backgroundColor: surfaces.pill, overflow: "hidden" }}
    >
      {width > 0 ? <Animated.View style={{ width, height: "100%", backgroundColor: color, borderRadius: height, transform: [{ translateX }] }} /> : null}
    </View>
  );
}

/** A purely decorative emoji: hidden from screen readers. */
export function Emoji({ children, size }: { children: ReactNode; size: number }) {
  return (
    <Text style={{ fontSize: size }} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </Text>
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
  label,
  hint,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  color?: string;
  loading?: boolean;
  disabled?: boolean;
  big?: boolean;
  /** What a screen reader says; defaults to the title without symbols. */
  label?: string;
  hint?: string;
}) {
  const bg = kind === "primary" ? color : kind === "danger" ? colors.danger : "transparent";
  // "‹ Back"-style buttons sit at the top-left, where people look for them.
  const isBack = kind === "ghost" && title.trim().startsWith("‹");
  const fg = kind === "primary" || kind === "danger" ? "#fff" : color;
  const press = usePressScale(0.97);
  return (
    <AnimatedPressable
      onPress={onPress}
      {...press.handlers}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label ?? spokenLabel(title)}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[
        styles.btn,
        isBack && { alignSelf: "flex-start", paddingHorizontal: 8, minWidth: 44 },
        big && { paddingVertical: 18 },
        { backgroundColor: bg, borderColor: kind === "secondary" ? color : "transparent" },
        kind === "secondary" && { borderWidth: 2 },
        (disabled || loading) && { opacity: 0.5 },
        press.style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }, big && { fontSize: 19 }]}>{title}</Text>}
    </AnimatedPressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel={label} accessibilityHint={hint} {...props} />
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

export function Pill({ text, color = colors.muted, bg = surfaces.pill }: { text: string; color?: string; bg?: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 13, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

export function Toggle({ label, value, onChange, description }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string }) {
  const t = useGlide(value ? 1 : 0, 260);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });
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
        <Animated.View style={[styles.knob, { transform: [{ translateX }] }]} />
      </View>
    </Pressable>
  );
}

/** Loading placeholder shaped like a real screen (a title and a few cards) that breathes softly. */
export function Loading() {
  const bar = (width: number | `${number}%`, height: number) => <View style={{ width, height, borderRadius: 8, backgroundColor: surfaces.pill }} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
      <Pulse style={[styles.inner, { flex: 0 }]}>
        {bar("55%", 30)}
        {bar("80%", 16)}
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.card, { gap: 12 }]}>
            {bar("45%", 18)}
            {bar("90%", 12)}
            {bar("70%", 12)}
          </View>
        ))}
      </Pulse>
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
  btn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, alignItems: "center", justifyContent: "center", minHeight: 50, minWidth: 44 },
  btnText: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  label: { fontSize: 15, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.inputLine,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    backgroundColor: "#fff",
    color: colors.ink,
  },
  banner: { padding: 14, borderRadius: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, minHeight: 48 },
  track: { width: 50, height: 30, borderRadius: 15, backgroundColor: colors.trackOff, padding: 3 },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff" },
});
