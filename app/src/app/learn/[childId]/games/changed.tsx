import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Button, Card, Emoji, H1, P, Screen } from "../../../../components/ui";
import { CHANGE_GRID, makeRound } from "../../../../lib/games/changed";
import { recordPlayed } from "../../../../lib/games/played";
import { Pop } from "../../../../lib/motion";
import { useChild } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

type Phase = "look" | "guess" | "found";

/**
 * Which one changed? Look at a picture, then find the one thing that is different in the second picture. The first picture stays
 * as long as you like and you can look at it again, so there is no time pressure. Runs on the device.
 */
export default function Changed() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const child = useChild(childId);
  const { width } = useWindowDimensions();
  const band = child?.band ?? "b3";
  const grid = CHANGE_GRID[band];
  const [round, setRound] = useState(() => makeRound(grid.cols * grid.rows));
  const [phase, setPhase] = useState<Phase>("look");
  const [peek, setPeek] = useState(false);
  const [tried, setTried] = useState<number[]>([]);
  const recorded = useRef(false);

  if (!child) return null;
  const t = scaledBandTheme(band);
  const size = Math.max(60, Math.min(100, Math.floor((Math.min(width, 640) - 40 - 8 * (grid.cols - 1)) / grid.cols)));
  const showing = phase === "look" || peek ? round.a : round.b;

  function guess(i: number) {
    if (phase !== "guess" || peek) return;
    if (i === round.changed) {
      setPhase("found");
      if (!recorded.current) {
        recorded.current = true;
        void recordPlayed(child!.id, "changed");
      }
    } else if (!tried.includes(i)) {
      setTried([...tried, i]);
    }
  }

  function next() {
    setRound(makeRound(grid.cols * grid.rows));
    setPhase("look");
    setPeek(false);
    setTried([]);
  }

  return (
    <Screen>
      <Button title="‹ Games" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back to games" />
      <H1 size={31}>🔍 Which one changed?</H1>
      <Card style={{ borderRadius: t.radius }}>
        <View accessibilityRole="alert">
          <Text style={{ fontSize: t.font, color: colors.ink }} accessibilityLiveRegion="polite">
            {phase === "look" ? "Look carefully at the picture. Tap Ready when you remember it." : phase === "guess" ? (peek ? "This is the first picture." : "One thing changed. Tap it!") : "Yes! You found it."}
          </Text>
        </View>
      </Card>

      <View accessibilityLabel={peek || phase === "look" ? "The first picture" : "The second picture"} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", width: grid.cols * size + (grid.cols - 1) * 8, alignSelf: "center" }}>
        {showing.map((symbol, i) => {
          const isChanged = phase === "found" && i === round.changed;
          const wrong = tried.includes(i) && phase === "guess" && !peek;
          return (
            <Pressable
              key={i}
              onPress={() => guess(i)}
              accessibilityRole="button"
              accessibilityLabel={`Square ${i + 1}, ${symbol}${isChanged ? ", this one changed" : ""}${wrong ? ", not this one" : ""}`}
              disabled={phase !== "guess" || peek}
              style={{
                width: size,
                height: size,
                borderRadius: 14,
                borderWidth: isChanged ? 5 : 2,
                borderColor: isChanged ? colors.good : wrong ? colors.warn : colors.inputLine,
                backgroundColor: isChanged ? colors.goodSoft : wrong ? colors.warnSoft : "#fff",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: size * 0.55 }}>{symbol}</Text>
              {wrong ? <Text style={{ position: "absolute", top: 1, right: 5, fontWeight: "800", color: colors.warn }} aria-hidden>✗</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {phase === "look" ? <Button big title="I'm ready" color={t.accent} onPress={() => setPhase("guess")} /> : null}
      {phase === "guess" ? (
        <Button title={peek ? "Back to the second picture" : "Look at the first picture again"} kind="secondary" color={t.accent} onPress={() => setPeek(!peek)} />
      ) : null}
      {phase === "found" ? (
        <Card style={{ borderRadius: t.radius, alignItems: "center", backgroundColor: colors.goodSoft }}>
          <Pop><Emoji size={48}>🎉</Emoji></Pop>
          <P center>It was square {round.changed + 1}: {round.a[round.changed]} became {round.b[round.changed]}.</P>
          <Button big title="Next picture" color={t.accent} onPress={next} />
        </Card>
      ) : null}
    </Screen>
  );
}
