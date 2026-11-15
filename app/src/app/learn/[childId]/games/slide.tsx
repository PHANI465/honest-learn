import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Button, Card, Emoji, H1, P, Screen } from "../../../../components/ui";
import { recordPlayed } from "../../../../lib/games/played";
import { isSolved, shuffleBoard, SLIDE_SIZE, slideTile, solvedBoard } from "../../../../lib/games/slide";
import { Pop } from "../../../../lib/motion";
import { useChild } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

/**
 * Sliding tiles: slide the numbered tiles into the empty square until they are in order. Every puzzle can be solved. There is no
 * move counter and no timer. Runs on the device.
 */
export default function Slide() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const child = useChild(childId);
  const { width } = useWindowDimensions();
  const band = child?.band ?? "b3";
  const n = SLIDE_SIZE[band];
  // easier shuffles for younger children
  const moves = band === "b2" ? 14 : band === "b3" ? 30 : 60;
  const [board, setBoard] = useState(() => shuffleBoard(n, moves));
  const [showGoal, setShowGoal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!child) return null;
  const t = scaledBandTheme(band);
  const gap = 6;
  const size = Math.max(60, Math.min(110, Math.floor((Math.min(width, 520) - 40 - gap * (n - 1)) / n)));
  const done = isSolved(board, n);

  function press(i: number) {
    if (done) return;
    const next = slideTile(board, n, i);
    if (!next) {
      setMessage("That tile cannot move. Only a tile next to the empty square can slide.");
      return;
    }
    setMessage(null);
    setBoard(next);
    if (isSolved(next, n)) void recordPlayed(child!.id, "slide");
  }

  function again() {
    setBoard(shuffleBoard(n, moves));
    setMessage(null);
  }

  const goal = solvedBoard(n);
  return (
    <Screen>
      <Button title="‹ Games" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back to games" />
      <H1 size={31}>🔢 Slide the tiles</H1>
      <P muted size={14}>Slide the tiles into the empty square until the numbers are in order, 1 first, with the empty square last.</P>
      {message ? <Text style={{ color: colors.muted, fontSize: 14 }} accessibilityRole="alert">{message}</Text> : null}

      <View accessibilityLabel={`Sliding tile board, ${n} by ${n}`} style={{ width: n * size + (n - 1) * gap, flexDirection: "row", flexWrap: "wrap", gap, alignSelf: "center" }}>
        {(showGoal ? goal : board).map((v, i) => (
          <Pressable
            key={i}
            onPress={() => !showGoal && press(i)}
            accessibilityRole="button"
            accessibilityLabel={v === 0 ? `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}, empty square` : `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}, tile ${v}`}
            style={{
              width: size,
              height: size,
              borderRadius: t.radius,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: v === 0 ? "#F1EEE8" : done ? colors.good : t.accent,
              borderWidth: v === 0 ? 2 : 0,
              borderColor: colors.inputLine,
              borderStyle: v === 0 ? "dashed" : "solid",
            }}
          >
            {v ? <Text style={{ fontSize: size * 0.45, fontWeight: "800", color: "#fff" }}>{v}</Text> : null}
          </Pressable>
        ))}
      </View>

      {done ? (
        <Card style={{ borderRadius: t.radius, alignItems: "center", backgroundColor: colors.goodSoft }}>
          <Pop><Emoji size={56}>🎉</Emoji></Pop>
          <View accessibilityRole="alert"><H1>Solved!</H1></View>
          <Button big title="Play again" color={t.accent} onPress={again} />
        </Card>
      ) : (
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <Button title={showGoal ? "Back to my board" : "Show the finished board"} kind="secondary" color={t.accent} onPress={() => setShowGoal(!showGoal)} />
          <Button title="New puzzle" kind="ghost" color={colors.muted} onPress={again} />
        </View>
      )}
    </Screen>
  );
}
