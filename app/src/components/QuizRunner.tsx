import { useEffect, useState, type ReactNode } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { Pop, usePressScale, useShake } from "../lib/motion";
import type { BandId } from "../lib/api";
import { isOfflineError } from "../lib/offline";
import { scaledBandTheme, colors } from "../lib/theme";
import { Banner, Button, Card, Emoji, H1, P, ProgressBar } from "./ui";
import { OfflineBanner } from "./OfflineBanner";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** One answer choice. It shrinks a little while pressed, shakes gently when the try was wrong, and its tick pops when right. */
export function QuizOption({
  text,
  right,
  wrong,
  picked,
  locked,
  big,
  fontSize,
  radius,
  onPress,
  saved,
}: {
  text: string;
  right: boolean;
  wrong: boolean;
  picked: boolean;
  locked: boolean;
  big: boolean;
  fontSize: number;
  radius: number;
  onPress: () => void;
  /** Chosen while offline and not checked yet: the accent and soft tint to mark it with. */
  saved?: { accent: string; soft: string } | null;
}) {
  const press = usePressScale(0.98);
  const { shake, style: shakeStyle } = useShake();
  useEffect(() => {
    if (wrong) shake();
  }, [wrong, shake]);
  return (
    <AnimatedPressable
      onPress={onPress}
      {...(locked ? {} : press.handlers)}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={right ? `${text}, correct` : wrong ? `${text}, not quite` : saved ? `${text}, chosen, not checked yet` : text}
      accessibilityState={{ disabled: locked, selected: picked }}
      style={[
        { padding: big ? 18 : 15, minHeight: 56, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius, borderWidth: 2, backgroundColor: colors.card, borderColor: colors.line },
        saved ? { borderColor: saved.accent, backgroundColor: saved.soft } : null,
        right && { borderColor: colors.good, backgroundColor: colors.goodSoft },
        wrong && { borderColor: colors.warn, backgroundColor: colors.warnSoft },
        { transform: [...shakeStyle.transform, ...press.style.transform] },
      ]}
    >
      {right ? <Pop><Text style={{ fontSize }}>✅</Text></Pop> : wrong ? <Text style={{ fontSize }}>🤔</Text> : saved ? <Text style={{ fontSize }}>📌</Text> : null}
      <Text style={{ flex: 1, fontSize, color: colors.ink, fontWeight: "600" }}>{text}</Text>
    </AnimatedPressable>
  );
}

const offlineNote = (e: unknown, what: string) =>
  isOfflineError(e) ? `Connect to the internet to ${what}.` : "Something went wrong. Please try again.";

export interface RunnerQuestion {
  q: string;
  options: string[];
  /** Small label above the question, e.g. which lesson it came from. */
  label?: string;
}
interface CheckResult {
  correct: boolean;
  explain: string | null;
  answer: number | null;
}
interface QState {
  first: number | null;
  firstCorrect: boolean | null;
  picked: number | null;
  correct: boolean | null;
  hints: string[];
  explain: string | null;
  revealed: number | null;
}
const fresh = (): QState => ({ first: null, firstCorrect: null, picked: null, correct: null, hints: [], explain: null, revealed: null });

/**
 * Quiz with the same "never give the answer" ladder as lessons:
 * try → hint → bigger hint → similar worked example → explanation only after success or all hints.
 * Scoring counts first tries only.
 */
export function QuizRunner({
  band,
  questions,
  check,
  hint,
  finish,
  onDone,
  doneNote,
  after,
}: {
  band: BandId;
  questions: RunnerQuestion[];
  check: (i: number, choice: number, hintsUsed: number) => Promise<CheckResult>;
  hint: (i: number, level: number) => Promise<string>;
  /** Optional: record the result on the server. Gets each question's first choice. */
  finish?: (firstChoices: number[]) => Promise<{ score: number; total: number }>;
  onDone: () => void;
  doneNote?: string;
  /** Shown under the score on the result screen (for example a FactCard). */
  after?: ReactNode;
}) {
  const t = scaledBandTheme(band);
  const young = band === "b1" || band === "b2";
  const [i, setI] = useState(0);
  const [qs, setQs] = useState<QState[]>(() => questions.map(fresh));
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (patch: Partial<QState>) => setQs((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  if (result) {
    const perfect = result.score === result.total;
    return (
      <View style={{ gap: 14, alignItems: "center", marginTop: 20 }}>
        <Pop><Emoji size={72}>{perfect ? "🏆" : "🌱"}</Emoji></Pop>
        <H1>{perfect ? "Amazing!" : "Nice work!"}</H1>
        <Text style={{ fontSize: 34, textAlign: "center" }} accessibilityLabel={`${result.score} out of ${result.total} correct`}>{"⭐".repeat(result.score)}{"☆".repeat(Math.max(0, result.total - result.score))}</Text>
        <P center size={19}>You got {result.score} out of {result.total} on your first tries.</P>
        {doneNote ? <P center muted>{doneNote}</P> : null}
        {after}
        <View style={{ width: "100%", gap: 10 }}>
          <Button big title="Done" color={t.accent} onPress={onDone} />
        </View>
      </View>
    );
  }

  const q = questions[i]!;
  const s = qs[i]!;
  const last = i === questions.length - 1;
  const locked = !!s.correct || s.revealed !== null;

  // Answers are only on the server, so checking and hints need the internet. Nothing is lost while offline.
  async function choose(choice: number) {
    if (locked) return;
    setNote(null);
    try {
      const r = await check(i, choice, s.hints.length);
      update({ picked: choice, correct: r.correct, first: s.first ?? choice, firstCorrect: s.first === null ? r.correct : s.firstCorrect, explain: r.explain, revealed: r.answer });
    } catch (e) {
      setNote(offlineNote(e, "check answers"));
    }
  }
  async function nextHint() {
    const level = s.hints.length;
    if (level > 2) return;
    setNote(null);
    try {
      const h = await hint(i, level);
      update({ hints: [...s.hints, h], picked: null, correct: null });
    } catch (e) {
      setNote(offlineNote(e, "get hints"));
    }
  }
  async function next() {
    setNote(null);
    if (!last) return setI(i + 1);
    const firsts = qs.map((x) => x.first ?? -1);
    if (!finish) return setResult({ score: qs.filter((x) => x.firstCorrect).length, total: questions.length });
    setBusy(true);
    try {
      setResult(await finish(firsts));
    } catch (e) {
      setNote(offlineNote(e, "save your score"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <OfflineBanner />
      <Text style={{ color: t.accent, fontWeight: "800" }}>
        {i + 1} of {questions.length}{q.label ? ` · ${q.label}` : ""}
      </Text>
      <ProgressBar value={(i + 1) / questions.length} color={t.accent} height={8} label={`Question ${i + 1} of ${questions.length}`} />
      {/* keyed by question so each new question arrives with a soft fade */}
      <Card key={i} enterDelay={0} style={{ borderRadius: t.radius }}>
        <Text style={{ fontSize: t.font + 3, fontWeight: "800", color: colors.ink, lineHeight: (t.font + 3) * 1.35 }} accessibilityRole="header">{q.q}</Text>
      </Card>
      <View style={{ gap: 10 }}>
        {q.options.map((opt, k) => {
          const picked = s.picked === k;
          const right = (picked && s.correct) || s.revealed === k;
          const wrong = picked && s.correct === false;
          return (
            <QuizOption key={`${i}-${k}`} text={opt} right={!!right} wrong={wrong} picked={picked} locked={locked} big={young} fontSize={young ? 22 : t.font} radius={t.radius} onPress={() => choose(k)} />
          );
        })}
      </View>
      {note ? <Banner tone="info">{note}</Banner> : null}
      {s.correct === false && s.revealed === null ? <Banner>Good try! Not quite. Think again, or take a hint.</Banner> : null}
      {s.hints.map((h, k) => (
        <Card key={`${i}-${k}`} enterDelay={0} style={{ backgroundColor: t.soft, borderColor: t.accent }}>
          <Text style={{ fontWeight: "800", color: t.accent }}>{["💭 Hint", "🔎 Bigger hint", "🧩 Worked example"][k]}</Text>
          <Text style={{ fontSize: t.font - 1, color: colors.ink, lineHeight: (t.font - 1) * 1.45 }}>{h}</Text>
        </Card>
      ))}
      {s.explain ? (
        <Card enterDelay={0} style={{ backgroundColor: colors.goodSoft, borderColor: colors.good }}>
          <Text style={{ fontWeight: "800", color: colors.good }}>{s.correct ? "🎉 Yes! Here's why:" : "📖 Let's learn it:"}</Text>
          <Text style={{ fontSize: t.font - 1, color: colors.ink, lineHeight: (t.font - 1) * 1.45 }}>{s.explain}</Text>
        </Card>
      ) : null}
      {!locked && s.hints.length < 3 ? (
        <Button title={s.hints.length ? "💭 Another hint" : "💭 I need a hint"} kind="secondary" color={t.accent} onPress={nextHint} />
      ) : null}
      {locked ? <Button big title={last ? "Finish 🎉" : "Next →"} color={t.accent} onPress={next} loading={busy} /> : null}
    </View>
  );
}
