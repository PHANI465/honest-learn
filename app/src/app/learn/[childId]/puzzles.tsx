import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { QuizRunner } from "../../../components/QuizRunner";
import { Banner, Button, Card, H1, Loading, P, Pill, Screen } from "../../../components/ui";
import { api, friendly } from "../../../lib/api";
import { useChild, useSession } from "../../../lib/session";
import { bandTheme, colors } from "../../../lib/theme";

interface PuzzleSet {
  available: boolean;
  title?: string;
  status?: "draft" | "reviewed";
  best?: { best_score: number; total: number } | null;
  puzzles?: { id: string; type: string; q: string; options: string[] }[];
}

/**
 * Reasoning puzzles like the ones in IQ-style tests: patterns, sequences, analogies, logic.
 * Deliberately NO IQ score. Online "IQ tests" can't measure IQ; only a qualified psychologist can.
 */
export default function Puzzles() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { familyToken } = useSession();
  const child = useChild(childId);
  const [set, setSet] = useState<PuzzleSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const base = `/children/${childId}/puzzles`;

  useEffect(() => {
    api<PuzzleSet>("GET", base, familyToken).then(setSet).catch((e) => setError(friendly(e)));
  }, [base, familyToken, playing]);

  if (!child) return null;
  const t = bandTheme[child.band];
  const young = child.band === "b1" || child.band === "b2";

  if (error) return <Screen><Banner>{error}</Banner></Screen>;
  if (!set) return <Loading />;

  if (playing && set.puzzles) {
    return (
      <Screen>
        <Button title="‹ Stop" kind="ghost" color={t.accent} onPress={() => setPlaying(false)} />
        <QuizRunner
          band={child.band}
          questions={set.puzzles.map((p) => ({ q: p.q, options: p.options, label: p.type.replace("-", " ") }))}
          check={(i, choice, hintsUsed) => api("POST", `${base}/check`, familyToken, { question: i, choice, hintsUsed })}
          hint={(i, level) => api<{ hint: string }>("POST", `${base}/hint`, familyToken, { question: i, level }).then((r) => r.hint)}
          finish={(choices) => api("POST", `${base}/complete`, familyToken, { choices })}
          onDone={() => setPlaying(false)}
          doneNote="Puzzle skills grow with practice. Try again another day and see if you can solve more on your first try!"
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Button title="‹ Back" kind="ghost" color={t.accent} onPress={() => router.back()} />
      <View style={{ alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 60 }}>🧩</Text>
        <H1 size={young ? 30 : 26}>{set.title ?? "Brain Puzzles"}</H1>
      </View>
      {!set.available ? (
        <Banner tone="info">Puzzles for your age are coming soon!</Banner>
      ) : (
        <>
          <Card style={{ borderRadius: t.radius }}>
            <P size={t.font - 1}>
              {young
                ? "Patterns, odd-one-out and thinking games! Take your time. Hints are there if you need them. 🌟"
                : "Patterns, sequences, analogies and logic: the kinds of reasoning used in IQ-style tests. Hints are there if you need them."}
            </P>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Pill text={`${set.puzzles?.length ?? 0} puzzles`} />
              {set.best ? <Pill text={`Your best: ${set.best.best_score}/${set.best.total}`} color={colors.good} bg={colors.goodSoft} /> : null}
              {set.status === "draft" ? <Pill text="Draft" color={colors.warn} bg={colors.warnSoft} /> : null}
            </View>
          </Card>
          {!young ? (
            <Card style={{ backgroundColor: "#F7F9FC" }}>
              <Text style={{ fontWeight: "800", color: colors.ink }}>Honest note: this is not an IQ test</Text>
              <P size={14} muted>
                Real IQ tests are standardised and given by trained psychologists. Online "IQ tests" can't measure IQ, and many inflate scores or hide results behind a payment. Here you just see how many puzzles you solved. Practice really does make you better at puzzles like these.
              </P>
            </Card>
          ) : null}
          <Button big title={set.best ? "Play again" : "Start puzzles"} color={t.accent} onPress={() => setPlaying(true)} />
        </>
      )}
    </Screen>
  );
}
