import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Emoji, H1, P, Screen } from "../../../../components/ui";
import { NONO_SIZE } from "../../../../lib/games/nonogram";
import { loadPlayed } from "../../../../lib/games/played";
import { loadSavedChess } from "../../../../lib/games/saved-chess";
import { useChild } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

interface GameCard {
  /** Route name under games/ and the key of the "played" count. */
  id: string;
  emoji: string;
  title: string;
  blurb: (young: boolean) => string;
  /** Shown only for these age groups. */
  bands: string[];
  /** Needs the internet? (Sudoku checks its answers on the server; the others run on the device.) */
  online?: boolean;
}

const GAMES: GameCard[] = [
  { id: "sudoku", emoji: "🔢", title: "Sudoku", blurb: (y) => (y ? "Fill in the grid with pictures or numbers" : "Fill the grid so nothing repeats in a row, column or box"), bands: ["b1", "b2", "b3", "b4", "b5"], online: true },
  { id: "computer", emoji: "♟️", title: "Play chess", blurb: () => "Play a game against the computer", bands: ["b2", "b3", "b4", "b5"] },
  { id: "chess", emoji: "♞", title: "Chess puzzles", blurb: () => "Find checkmates and winning moves", bands: ["b2", "b3", "b4", "b5"], online: true },
  { id: "pairs", emoji: "🃏", title: "Pairs", blurb: (y) => (y ? "Find the matching pictures" : "Turn over cards and find the matching pairs"), bands: ["b1", "b2", "b3", "b4", "b5"] },
  { id: "sequence", emoji: "🎵", title: "Copy the pattern", blurb: () => "Watch a pattern light up, then repeat it", bands: ["b1", "b2", "b3", "b4", "b5"] },
  { id: "changed", emoji: "🔍", title: "Which one changed?", blurb: () => "Spot the one thing that is different", bands: ["b1", "b2", "b3", "b4", "b5"] },
  { id: "slide", emoji: "🧩", title: "Slide the tiles", blurb: () => "Slide numbered tiles into order", bands: ["b2", "b3", "b4", "b5"] },
  { id: "nonogram", emoji: "🖼️", title: "Nonogram", blurb: () => "Use number clues to reveal a hidden picture", bands: Object.entries(NONO_SIZE).filter(([, v]) => v).map(([k]) => k) },
];

/** The games area: calm logic and memory games with no clocks, no scores and no rankings. */
export default function Games() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const child = useChild(childId);
  const [played, setPlayed] = useState<Record<string, number>>({});
  /** A chess game against the computer that was left unfinished (kept on this device). */
  const [chessWaiting, setChessWaiting] = useState(false);

  // Reload whenever this screen comes back into view: a game that was just finished changes its count.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (childId) void loadPlayed(childId).then((p) => live && setPlayed(p));
      if (childId) void loadSavedChess(childId).then((g) => live && setChessWaiting(!!g));
      return () => {
        live = false;
      };
    }, [childId]),
  );

  if (!child) return null;
  const t = scaledBandTheme(child.band);
  const young = child.band === "b1" || child.band === "b2";
  return (
    <Screen>
      <Button title="‹ Back" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back" />
      <H1 size={young ? 30 : 26}>🎲 Games</H1>
      <P muted size={14}>Games that exercise logic and memory. There is no timer, no score and no ranking: just you and the puzzle.</P>
      {GAMES.filter((g) => g.bands.includes(child.band)).map((g) => (
        <Card key={g.id} onPress={() => router.push(`/learn/${childId}/games/${g.id}`)} label={g.title} style={{ borderRadius: t.radius, flexDirection: "row", alignItems: "center", gap: 12, borderColor: t.accent, borderWidth: 2 }}>
          <Emoji size={36}>{g.emoji}</Emoji>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "800", fontSize: t.font, color: colors.ink }}>{g.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {g.blurb(young)}
              {g.id === "computer" && chessWaiting ? " · a game is waiting" : ""}
              {!g.online && played[g.id] ? ` · finished ${played[g.id]} ${played[g.id] === 1 ? "time" : "times"}` : ""}
            </Text>
          </View>
          <Text style={{ fontSize: 22, color: colors.muted }} aria-hidden accessibilityElementsHidden importantForAccessibility="no">›</Text>
        </Card>
      ))}
      <P muted size={13}>Sudoku and chess puzzles check your moves on the server, so they need the internet. Playing chess against the computer, pairs, patterns, picture spotting, tiles and nonograms work without the internet.</P>
    </Screen>
  );
}
