import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { Button, Card, Emoji, H1, P, Screen } from "../../../../components/ui";
import { useChild } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

/** The games area: calm logic games with no clocks, no scores and no rankings. */
export default function Games() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const child = useChild(childId);
  if (!child) return null;
  const t = scaledBandTheme(child.band);
  const young = child.band === "b1" || child.band === "b2";
  return (
    <Screen>
      <Button title="‹ Back" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back" />
      <H1 size={young ? 30 : 26}>🎲 Games</H1>
      <P muted size={14}>Games that exercise logic and memory. There is no timer, no score and no ranking: just you and the puzzle.</P>
      <Card onPress={() => router.push(`/learn/${childId}/games/sudoku`)} label="Sudoku" style={{ borderRadius: t.radius, flexDirection: "row", alignItems: "center", gap: 12, borderColor: t.accent, borderWidth: 2 }}>
        <Emoji size={36}>🔢</Emoji>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", fontSize: t.font, color: colors.ink }}>Sudoku</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{young ? "Fill in the grid with pictures or numbers" : "Fill the grid so nothing repeats in a row, column or box"}</Text>
        </View>
        <Text style={{ fontSize: 22, color: colors.muted }} aria-hidden accessibilityElementsHidden importantForAccessibility="no">›</Text>
      </Card>
      <P muted size={13}>More games are planned: chess puzzles, memory games and more.</P>
    </Screen>
  );
}
