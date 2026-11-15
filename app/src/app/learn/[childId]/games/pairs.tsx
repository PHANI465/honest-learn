import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Button, Card, Emoji, H1, P, Screen } from "../../../../components/ui";
import { makeDeck, PAIR_COLUMNS, PAIR_COUNT } from "../../../../lib/games/pairs";
import { recordPlayed } from "../../../../lib/games/played";
import { Pop } from "../../../../lib/motion";
import { useChild } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

/** Pairs: turn two cards at a time and find the matching pictures. No timer, no move count, no score. Runs on the device. */
export default function Pairs() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const child = useChild(childId);
  const { width } = useWindowDimensions();
  const band = child?.band ?? "b3";
  const [round, setRound] = useState(0);
  const [deck, setDeck] = useState(() => makeDeck(PAIR_COUNT[band]));
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!child) return null;
  const t = scaledBandTheme(band);
  const cols = PAIR_COLUMNS[band];
  const gap = 8;
  const size = Math.max(52, Math.min(96, Math.floor((Math.min(width, 640) - 40 - gap * (cols - 1)) / cols)));
  const done = matched.size === deck.length;

  function flip(i: number) {
    if (busy.current || open.includes(i) || matched.has(i)) return;
    const next = [...open, i];
    setOpen(next);
    if (next.length < 2) return;
    const [a, b] = next as [number, number];
    if (deck[a]!.symbol === deck[b]!.symbol) {
      const all = new Set(matched).add(a).add(b);
      setMatched(all);
      setOpen([]);
      if (all.size === deck.length) void recordPlayed(child!.id, "pairs");
    } else {
      // show the two cards for a moment, then turn them back; the child sets the pace by tapping
      busy.current = true;
      timer.current = setTimeout(() => {
        setOpen([]);
        busy.current = false;
      }, 1100);
    }
  }

  function again() {
    if (timer.current) clearTimeout(timer.current);
    busy.current = false;
    setDeck(makeDeck(PAIR_COUNT[band]));
    setOpen([]);
    setMatched(new Set());
    setRound(round + 1);
  }

  return (
    <Screen>
      <Button title="‹ Games" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back to games" />
      <H1 size={31}>🃏 Pairs</H1>
      <P muted size={14}>Turn over two cards. If the pictures match, they stay up. Find every pair!</P>

      <View key={round} accessibilityLabel={`${deck.length} cards in a grid`} style={{ flexDirection: "row", flexWrap: "wrap", gap, justifyContent: "center" }}>
        {deck.map((card, i) => {
          const up = open.includes(i) || matched.has(i);
          const isMatched = matched.has(i);
          return (
            <Pressable
              key={i}
              onPress={() => flip(i)}
              accessibilityRole="button"
              accessibilityLabel={isMatched ? `Card ${i + 1}, ${card.symbol}, matched` : up ? `Card ${i + 1}, ${card.symbol}` : `Card ${i + 1}, face down`}
              accessibilityState={{ disabled: isMatched }}
              style={{
                width: size,
                height: size,
                borderRadius: t.radius,
                borderWidth: 3,
                borderColor: isMatched ? colors.good : t.accent,
                backgroundColor: isMatched ? colors.goodSoft : up ? "#fff" : t.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: size * 0.5, color: "#fff" }} aria-hidden>{up ? card.symbol : "?"}</Text>
              {isMatched ? <Text style={{ position: "absolute", top: 2, right: 6, fontSize: 14, fontWeight: "800", color: colors.good }} aria-hidden>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {done ? (
        <Card style={{ borderRadius: t.radius, alignItems: "center", backgroundColor: colors.goodSoft }}>
          <Pop><Emoji size={56}>🎉</Emoji></Pop>
          <View accessibilityRole="alert"><H1>You found them all!</H1></View>
          <Button big title="Play again" color={t.accent} onPress={again} />
          <Button title="Back to games" kind="ghost" color={t.accent} onPress={() => router.back()} />
        </Card>
      ) : (
        <Button title="New cards" kind="ghost" color={colors.muted} onPress={again} />
      )}
    </Screen>
  );
}
