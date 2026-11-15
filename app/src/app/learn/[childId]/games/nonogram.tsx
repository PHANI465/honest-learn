import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Button, Card, Emoji, H1, P, Screen } from "../../../../components/ui";
import { generate, isComplete, NONO_SIZE, satisfied } from "../../../../lib/games/nonogram";
import { recordPlayed } from "../../../../lib/games/played";
import { Pop } from "../../../../lib/motion";
import { useChild } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

/** A square is empty (0), filled (1) or marked with a cross (2) to remember that it is empty. */
const NEXT = [1, 2, 0];

/**
 * Nonogram: the numbers beside each row and above each column tell how long the runs of filled squares are. Every puzzle has
 * exactly one solution, so it can always be worked out by reasoning. No timer, no score. Runs on the device.
 */
export default function Nonogram() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const child = useChild(childId);
  const { width } = useWindowDimensions();
  const band = child?.band ?? "b4";
  const n = NONO_SIZE[band] ?? 5;
  const [round, setRound] = useState(0);
  const puzzle = useMemo(() => generate(n), [n, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cells, setCells] = useState<number[]>(() => new Array(n * n).fill(0));
  const recorded = useRef(-1);
  const finished = isComplete(cells.map((v) => (v === 1 ? 1 : 0)), n, puzzle.rows, puzzle.cols);

  // count the puzzle as played once, when it is finished
  useEffect(() => {
    if (finished && recorded.current !== round && childId) {
      recorded.current = round;
      void recordPlayed(childId, "nonogram");
    }
  }, [finished, round, childId]);

  if (!child) return null;
  const t = scaledBandTheme(band);
  const filled = cells.map((v) => (v === 1 ? 1 : 0));
  const ok = satisfied(filled, n, puzzle.rows, puzzle.cols);
  const done = isComplete(filled, n, puzzle.rows, puzzle.cols);
  const clueW = n === 5 ? 56 : 66;
  const size = Math.max(34, Math.min(56, Math.floor((Math.min(width, 560) - 40 - clueW) / n)));
  const maxCol = Math.max(...puzzle.cols.map((c) => c.length));

  function press(i: number) {
    if (done) return;
    // built from the latest state, so quick taps never overwrite each other
    setCells((prev) => prev.map((v, k) => (k === i ? NEXT[v]! : v)));
  }

  function again() {
    setRound(round + 1);
    setCells(new Array(n * n).fill(0));
  }

  return (
    <Screen>
      <Button title="‹ Games" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back to games" />
      <H1 size={29}>🖼️ Nonogram</H1>
      <P muted size={14}>Each number tells the length of a run of filled squares in that row or column. Tap a square to fill it, tap again for a cross (empty for sure), and again to clear it. A line turns green with a tick when its numbers are right.</P>

      <View accessibilityLabel={`Nonogram, ${n} by ${n}`} style={{ alignSelf: "center" }}>
        <View style={{ flexDirection: "row", marginLeft: clueW }}>
          {puzzle.cols.map((c, ci) => (
            <View key={ci} style={{ width: size, alignItems: "center", justifyContent: "flex-end", minHeight: maxCol * 17 + 4 }} accessibilityLabel={`Column ${ci + 1} clue: ${c.join(", ")}${ok.cols[ci] ? ", done" : ""}`}>
              {c.map((v, k) => (
                <Text key={k} style={{ fontSize: 14, lineHeight: 17, fontWeight: ok.cols[ci] ? "800" : "600", color: ok.cols[ci] ? colors.good : colors.ink }}>{v}</Text>
              ))}
              {ok.cols[ci] ? <Text style={{ fontSize: 12, color: colors.good }} aria-hidden>✓</Text> : null}
            </View>
          ))}
        </View>
        {Array.from({ length: n }, (_, r) => (
          <View key={r} style={{ flexDirection: "row" }}>
            <View style={{ width: clueW, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 5, paddingRight: 6 }} accessibilityLabel={`Row ${r + 1} clue: ${puzzle.rows[r]!.join(", ")}${ok.rows[r] ? ", done" : ""}`}>
              {ok.rows[r] ? <Text style={{ fontSize: 12, color: colors.good }} aria-hidden>✓</Text> : null}
              {puzzle.rows[r]!.map((v, k) => (
                <Text key={k} style={{ fontSize: 14, fontWeight: ok.rows[r] ? "800" : "600", color: ok.rows[r] ? colors.good : colors.ink }}>{v}</Text>
              ))}
            </View>
            {Array.from({ length: n }, (_, c) => {
              const i = r * n + c;
              const v = cells[i]!;
              return (
                <Pressable
                  key={c}
                  onPress={() => press(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Row ${r + 1}, column ${c + 1}, ${v === 1 ? "filled" : v === 2 ? "crossed" : "empty"}`}
                  style={{
                    width: size,
                    height: size,
                    alignItems: "center",
                    justifyContent: "center",
                    borderColor: colors.ink,
                    borderTopWidth: r % 5 === 0 ? 2 : 1,
                    borderLeftWidth: c % 5 === 0 ? 2 : 1,
                    borderRightWidth: c === n - 1 ? 2 : 0,
                    borderBottomWidth: r === n - 1 ? 2 : 0,
                    backgroundColor: v === 1 ? (done ? colors.good : t.accent) : "#fff",
                  }}
                >
                  {v === 2 ? <Text style={{ fontSize: size * 0.5, color: colors.muted }} aria-hidden>✕</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {done ? (
        <Card style={{ borderRadius: t.radius, alignItems: "center", backgroundColor: colors.goodSoft }}>
          <Pop><Emoji size={56}>🎉</Emoji></Pop>
          <View accessibilityRole="alert"><H1>Picture complete!</H1></View>
          <Button big title="New puzzle" color={t.accent} onPress={again} />
        </Card>
      ) : (
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <Button title="Clear the board" kind="secondary" color={t.accent} onPress={() => setCells(new Array(n * n).fill(0))} />
          <Button title="New puzzle" kind="ghost" color={colors.muted} onPress={again} />
        </View>
      )}
    </Screen>
  );
}
