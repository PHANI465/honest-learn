import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Button, Card, Emoji, H1, P, Screen } from "../../../../components/ui";
import { recordPlayed } from "../../../../lib/games/played";
import { extend, newSequence, SEQ_BUTTON_COUNT, SEQ_BUTTONS, SEQ_START_LENGTH, tap } from "../../../../lib/games/sequence";
import { useChild } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

type Phase = "watch" | "turn" | "wrong";

/**
 * Sequence recall: watch a pattern light up, then repeat it. It grows by one each time you get it right. There is no timer and no
 * game over: a wrong tap just shows the same pattern again. Runs on the device.
 */
export default function Sequence() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const child = useChild(childId);
  const { width } = useWindowDimensions();
  const band = child?.band ?? "b3";
  const buttonCount = SEQ_BUTTON_COUNT[band];
  const [seq, setSeq] = useState(() => newSequence(SEQ_START_LENGTH[band], buttonCount));
  const [phase, setPhase] = useState<Phase>("watch");
  const [lit, setLit] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [replay, setReplay] = useState(0);
  const recorded = useRef(false);

  // play the pattern: each button lights up in turn (a colour and border change, not a movement)
  useEffect(() => {
    if (phase !== "watch") return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const step = band === "b1" ? 1000 : 750;
    seq.forEach((b, i) => {
      timers.push(setTimeout(() => !cancelled && setLit(b), 700 + i * step));
      timers.push(setTimeout(() => !cancelled && setLit(null), 700 + i * step + step - 250));
    });
    timers.push(setTimeout(() => !cancelled && (setPhase("turn"), setProgress(0)), 700 + seq.length * step));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [phase, seq, replay, band]);

  const press = useCallback(
    (b: number) => {
      if (phase !== "turn") return;
      const r = tap(seq, progress, b);
      if (r.kind === "wrong") {
        setPhase("wrong");
        return;
      }
      if (r.kind === "right") {
        setProgress(r.progress);
        return;
      }
      if (!recorded.current) {
        recorded.current = true;
        if (childId) void recordPlayed(childId, "sequence");
      }
      setSeq(extend(seq, buttonCount));
      setProgress(0);
      setPhase("watch");
    },
    [phase, seq, progress, buttonCount, childId],
  );

  if (!child) return null;
  const t = scaledBandTheme(band);
  const perRow = buttonCount <= 4 ? 2 : 3;
  const size = Math.max(80, Math.min(150, Math.floor((Math.min(width, 640) - 40 - 12 * (perRow - 1)) / perRow)));

  const status = phase === "watch" ? "Watch the pattern…" : phase === "turn" ? "Your turn: tap the pattern in the same order." : "Not quite. Let's watch it again.";

  return (
    <Screen>
      <Button title="‹ Games" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back to games" />
      <H1 size={31}>🎵 Copy the pattern</H1>
      <P muted size={14}>Watch the buttons light up, then tap them in the same order. Each time you get it right, the pattern grows by one.</P>

      <Card style={{ borderRadius: t.radius, alignItems: "center" }}>
        <Text style={{ color: t.accent, fontWeight: "800" }}>Pattern of {seq.length}</Text>
        <View accessibilityRole="alert"><Text style={{ fontSize: t.font, color: colors.ink, textAlign: "center" }} accessibilityLiveRegion="polite">{status}</Text></View>
        {phase === "turn" ? <Text style={{ color: colors.muted, fontSize: 13 }}>{progress} of {seq.length} done</Text> : null}
      </Card>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
        {SEQ_BUTTONS.slice(0, buttonCount).map((b, i) => {
          const on = lit === i;
          return (
            <Pressable
              key={i}
              onPress={() => press(i)}
              disabled={phase !== "turn"}
              accessibilityRole="button"
              accessibilityLabel={`${b.name} button${on ? ", lit" : ""}`}
              accessibilityState={{ disabled: phase !== "turn" }}
              style={{
                width: size,
                height: size,
                borderRadius: 20,
                borderWidth: on ? 8 : 3,
                borderColor: on ? colors.ink : b.color,
                backgroundColor: on ? "#FFF7DB" : "#fff",
                alignItems: "center",
                justifyContent: "center",
                opacity: phase === "turn" || on ? 1 : 0.8,
              }}
            >
              <Emoji size={size * 0.5}>{b.symbol}</Emoji>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {phase === "wrong" ? <Button big title="Watch again" color={t.accent} onPress={() => { setPhase("watch"); setReplay(replay + 1); }} /> : null}
        {phase === "turn" ? <Button title="Show it again" kind="secondary" color={t.accent} onPress={() => { setPhase("watch"); setReplay(replay + 1); }} /> : null}
        <Button title="Start over" kind="ghost" color={colors.muted} onPress={() => { setSeq(newSequence(SEQ_START_LENGTH[band], buttonCount)); setProgress(0); setPhase("watch"); setReplay(replay + 1); }} />
      </View>
    </Screen>
  );
}
