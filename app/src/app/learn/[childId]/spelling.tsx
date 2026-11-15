import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { Banner, Button, Card, Emoji, Field, H1, Loading, P, ProgressBar, Screen } from "../../../components/ui";
import { api, friendly } from "../../../lib/api";
import { Pop, useShake } from "../../../lib/motion";
import { useChild, useSession } from "../../../lib/session";
import { colors, scaledBandTheme } from "../../../lib/theme";
import { localDay } from "../../../lib/timer";

type Activity = "type" | "choose" | "unscramble" | "fill";
interface Outcome {
  correct: boolean;
  word: string;
  tip: string | null;
}
interface Item {
  index: number;
  activity: Activity;
  meaning: string;
  /** The sentence with the word blanked out as "_____". */
  sentence: string;
  emoji: string | null;
  /** The word, for reading aloud only. Never shown on screen before the try. */
  say: string | null;
  done: boolean;
  options?: string[];
  letters?: string[];
  pattern?: string;
  result?: Outcome;
}
interface Today {
  available: boolean;
  day?: string;
  perDay?: number;
  items?: Item[];
}

const INSTRUCTION: Record<Activity, string> = {
  type: "Listen, then type the word.",
  choose: "Which one is spelled right?",
  unscramble: "Tap the letters in the right order.",
  fill: "Fill in the missing letters and type the whole word.",
};

export default function Spelling() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { familyToken } = useSession();
  const child = useChild(childId);
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<(Outcome & { index: number }) | null>(null);
  const day = localDay();
  const { shake, style: shakeStyle } = useShake();

  useEffect(() => {
    if (!childId) return;
    let live = true;
    api<Today>("GET", `/children/${childId}/spelling/today?day=${day}`, familyToken)
      .then((r) => live && setData(r))
      .catch((e) => live && setError(friendly(e)));
    return () => {
      live = false;
      Speech.stop();
    };
  }, [childId, familyToken, day]);

  if (!child) return null;
  const t = scaledBandTheme(child.band);
  const young = child.band === "b1" || child.band === "b2";

  if (error) return <Screen><Banner>{`${error} Today's words need the internet.`}</Banner><Button title="Back" onPress={() => router.back()} /></Screen>;
  if (!data) return <Loading />;
  if (!data.available || !data.items?.length) {
    return (
      <Screen>
        <Button title="‹ Back" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back" />
        <H1>Today's words</H1>
        <Banner tone="info">There are no spelling words for this age group yet. Check back soon!</Banner>
      </Screen>
    );
  }

  const items = data.items;
  const doneCount = items.filter((i) => i.done).length;
  // The word in focus: the one just answered (while its result is showing), otherwise the first not yet done.
  const item = outcome ? items[outcome.index]! : items.find((i) => !i.done);

  async function submit(answer: string) {
    if (!item || !childId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<Outcome>("POST", `/children/${childId}/spelling/check`, familyToken, { day, index: item.index, typed: answer });
      setOutcome({ ...r, index: item.index });
      if (!r.correct) shake();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!outcome) return;
    setData({ ...data!, items: items.map((i) => (i.index === outcome.index ? { ...i, done: true, say: null, result: outcome } : i)) });
    setOutcome(null);
    setTyped("");
    setPicked([]);
    Speech.stop();
  }

  const speak = (text: string) => {
    Speech.stop();
    Speech.speak(text, { rate: young ? 0.75 : 0.9 });
  };

  const header = (
    <>
      <Button title="‹ Back" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back" />
      <H1 size={young ? 30 : 26}>✏️ Today's words</H1>
    </>
  );

  // ---------------------------------------------------------------- all done (nothing is said about missed days, and there is no streak)
  if (!item) {
    return (
      <Screen>
        {header}
        <View style={{ alignItems: "center", gap: 10, marginTop: 10 }}>
          <Pop><Emoji size={72}>🌟</Emoji></Pop>
          <H1>Words done!</H1>
          <P center size={18}>You tried {items.length} {items.length === 1 ? "word" : "words"} today. Words you find tricky will come back soon to practise.</P>
        </View>
        <Card style={{ borderRadius: t.radius }}>
          <Text style={{ fontWeight: "800", color: colors.ink }}>Today's words</Text>
          {items.map((i) => (
            <Text key={i.index} style={{ fontSize: t.font, color: colors.ink }} accessibilityLabel={`${i.result?.word}, ${i.result?.correct ? "spelled right" : "to practise"}`}>
              {i.result?.correct ? "✓ " : "↻ "}{i.result?.word}
            </Text>
          ))}
        </Card>
        <Button big title="Done" color={t.accent} onPress={() => router.back()} />
      </Screen>
    );
  }

  const answered = outcome !== null;

  return (
    <Screen>
      {header}
      <Text style={{ color: t.accent, fontWeight: "800" }}>Word {Math.min(doneCount + (answered ? 0 : 1), items.length)} of {items.length}</Text>
      <ProgressBar value={doneCount / items.length} color={t.accent} height={8} label={`${doneCount} of ${items.length} words done`} />
      {error ? <Banner>{error}</Banner> : null}

      <Animated.View style={shakeStyle}>
        <Card style={{ borderRadius: t.radius }}>
          {item.emoji ? <View style={{ alignItems: "center" }}><Emoji size={64}>{item.emoji}</Emoji></View> : null}
          <Text style={{ fontWeight: "800", color: colors.muted }}>It means:</Text>
          <Text style={{ fontSize: t.font + 2, fontWeight: "700", color: colors.ink, lineHeight: (t.font + 2) * 1.4 }}>{item.meaning}</Text>
          <Text style={{ fontSize: t.font, color: colors.ink, lineHeight: t.font * 1.45 }} accessibilityLabel={item.sentence.replace("_____", "blank")}>“{item.sentence}”</Text>
          {!answered && item.say ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Button title="🔊 Hear the word" kind="secondary" color={t.accent} onPress={() => speak(item.say!)} label="Hear the word" />
              <Button title="🔊 Hear it in the sentence" kind="ghost" color={t.accent} onPress={() => speak(item.sentence.replace("_____", item.say!))} label="Hear the sentence with the word in it" />
            </View>
          ) : null}
        </Card>
      </Animated.View>

      {answered ? (
        <Card style={{ borderRadius: t.radius, backgroundColor: outcome.correct ? colors.goodSoft : "#FFF7DB" }}>
          <View accessibilityRole="alert" style={{ gap: 6 }}>
            <Pop>
              <Text style={{ fontSize: t.font + 4, fontWeight: "800", color: colors.ink }}>{outcome.correct ? "Yes! That's right ✓" : "Not quite. Here is how it is spelled:"}</Text>
            </Pop>
            <Text style={{ fontSize: 30, fontWeight: "800", letterSpacing: 2, color: colors.ink }} accessibilityLabel={`${outcome.word}, spelled ${outcome.word.split("").join(", ")}`}>{outcome.word}</Text>
            {!outcome.correct ? <P muted size={15}>Mistakes are how words stick. This one will come back soon to practise.</P> : null}
            {outcome.tip ? <P size={15}>💡 Tip: {outcome.tip}</P> : null}
          </View>
          <Button big title={doneCount + 1 >= items.length ? "Finish" : "Next word"} color={t.accent} onPress={next} />
        </Card>
      ) : (
        <>
          <P muted size={15}>{INSTRUCTION[item.activity]}</P>

          {item.activity === "choose" ? (
            <View style={{ gap: 10 }}>
              {item.options!.map((o) => (
                <Button key={o} big title={o} kind="secondary" color={t.accent} loading={busy} onPress={() => submit(o)} label={`${o}, spelled ${o.split("").join(", ")}`} />
              ))}
            </View>
          ) : null}

          {item.activity === "unscramble" ? (
            <View style={{ gap: 12 }}>
              <View
                accessibilityLabel={picked.length ? `Your word so far: ${picked.map((i) => item.letters![i]).join(", ")}` : "Your word so far is empty"}
                style={{ minHeight: 64, flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.inputLine, backgroundColor: "#fff" }}
              >
                {picked.map((li, pos) => (
                  <Pressable key={pos} onPress={() => setPicked(picked.filter((_, p) => p !== pos))} accessibilityRole="button" accessibilityLabel={`Remove letter ${item.letters![li]}`} style={tile(t.accent, true)}>
                    <Text style={{ fontSize: 24, fontWeight: "800", color: "#fff" }}>{item.letters![li]}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {item.letters!.map((l, li) =>
                  picked.includes(li) ? null : (
                    <Pressable key={li} onPress={() => setPicked([...picked, li])} accessibilityRole="button" accessibilityLabel={`Letter ${l}`} style={tile(t.accent, false)}>
                      <Text style={{ fontSize: 24, fontWeight: "800", color: t.accent }}>{l}</Text>
                    </Pressable>
                  ),
                )}
              </View>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Button title="Start again" kind="ghost" color={colors.muted} onPress={() => setPicked([])} disabled={!picked.length} />
                <Button title="Check" color={t.accent} loading={busy} disabled={picked.length !== item.letters!.length} onPress={() => submit(picked.map((i) => item.letters![i]).join(""))} />
              </View>
            </View>
          ) : null}

          {item.activity === "type" || item.activity === "fill" ? (
            <View style={{ gap: 12 }}>
              {item.activity === "fill" ? (
                <Text style={{ fontSize: 34, fontWeight: "800", letterSpacing: 4, textAlign: "center", color: colors.ink }} accessibilityLabel={`The word has missing letters: ${item.pattern!.split("").map((c) => (c === "_" ? "blank" : c)).join(", ")}`}>{item.pattern}</Text>
              ) : null}
              <Field
                label="Type the word"
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                maxLength={30}
                onSubmitEditing={() => typed.trim() && submit(typed)}
                returnKeyType="done"
              />
              <Button big title="Check" color={t.accent} loading={busy} disabled={!typed.trim()} onPress={() => submit(typed)} />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const tile = (accent: string, filled: boolean) => ({
  minWidth: 48,
  minHeight: 48,
  paddingHorizontal: 8,
  borderRadius: 12,
  borderWidth: 2,
  borderColor: accent,
  backgroundColor: filled ? accent : "#fff",
  alignItems: "center" as const,
  justifyContent: "center" as const,
});
