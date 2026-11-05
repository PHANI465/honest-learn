import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useExternalLink } from "../../../../components/ExternalLink";
import { VideoEmbed } from "../../../../components/VideoEmbed";
import { ReportSheet } from "../../../../components/ReportSheet";
import { Banner, Button, Card, H1, Loading, P, Pill, Screen } from "../../../../components/ui";
import { api, friendly, type LearnMore, type Lesson } from "../../../../lib/api";
import { useChild, useSession } from "../../../../lib/session";
import { bandTheme, colors } from "../../../../lib/theme";

interface QState {
  firstChoice: number | null; // what counts for the score (honest scoring: first try)
  picked: number | null;
  correct: boolean | null;
  hints: string[];
  explain: string | null;
  revealed: number | null;
  tries: number;
}
const freshQ = (): QState => ({ firstChoice: null, picked: null, correct: null, hints: [], explain: null, revealed: null, tries: 0 });

const SECTION_STYLE: Record<string, { icon: string; bg: string }> = {
  text: { icon: "", bg: "#fff" },
  fact: { icon: "💡 Did you know?", bg: "#FFF7DB" },
  video: { icon: "🎬 Watch", bg: "#fff" },
  tryit: { icon: "🙌 Try it!", bg: "#E6F6EC" },
  parent: { icon: "👪 For grown-ups", bg: "#EEF0F6" },
};

export default function LessonScreen() {
  const { childId, lessonId } = useLocalSearchParams<{ childId: string; lessonId: string }>();
  const { familyToken } = useSession();
  const child = useChild(childId);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"learn" | "quiz" | "done">("learn");
  const [qi, setQi] = useState(0);
  const [qs, setQs] = useState<QState[]>([]);
  const [result, setResult] = useState<{ score: number; total: number; reviewDays: number } | null>(null);
  const [report, setReport] = useState(false);
  const [more, setMore] = useState<LearnMore | null>(null);
  // Under-13s need a parent's PIN to open outside links.
  const sourceLink = useExternalLink(!child || child.band === "b1" || child.band === "b2" || child.band === "b3");

  const base = `/children/${childId}/lessons/${lessonId}`;

  useEffect(() => {
    api<{ lesson: Lesson; solved: number[] }>("GET", base, familyToken)
      .then((r) => {
        setLesson(r.lesson);
        setQs(r.lesson.quiz.map(freshQ));
      })
      .catch((e) => setError(friendly(e)));
    api<LearnMore>("GET", `${base}/learn-more`, familyToken).then(setMore).catch(() => {});
    return () => {
      Speech.stop();
    };
  }, [base, familyToken]);

  if (error) return <Screen><Banner>{error}</Banner><Button title="Back" onPress={() => router.back()} /></Screen>;
  if (!lesson || !child) return <Loading />;

  const t = bandTheme[child.band];
  const young = child.band === "b1" || child.band === "b2";
  const readAloud = (text: string) => {
    Speech.stop();
    Speech.speak(text.replace(/[\p{Extended_Pictographic}]/gu, ""), { rate: 0.9 });
  };
  const update = (i: number, patch: Partial<QState>) => setQs((all) => all.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function choose(choice: number) {
    const q = qs[qi]!;
    if (q.correct) return;
    try {
      const r = await api<{ correct: boolean; explain: string | null; answer: number | null }>("POST", `${base}/check`, familyToken, {
        question: qi,
        choice,
        hintsUsed: q.hints.length,
      });
      update(qi, {
        picked: choice,
        correct: r.correct,
        firstChoice: q.firstChoice ?? choice,
        explain: r.explain,
        revealed: r.answer,
        tries: q.tries + 1,
      });
      if (child?.band === "b1") readAloud(r.correct ? "Yes! Well done!" : "Good try! Let's think again.");
    } catch (e) {
      setError(friendly(e));
    }
  }

  async function hint() {
    const q = qs[qi]!;
    const level = q.hints.length;
    if (level > 2) return;
    const r = await api<{ hint: string }>("POST", `${base}/hint`, familyToken, { question: qi, level });
    update(qi, { hints: [...q.hints, r.hint], picked: null, correct: null });
    if (young) readAloud(r.hint);
  }

  async function finish() {
    const choices = qs.map((q) => q.firstChoice ?? -1);
    const r = await api<{ score: number; total: number; reviewDue: string }>("POST", `${base}/complete`, familyToken, { choices });
    const reviewDays = Math.max(1, Math.round((new Date(r.reviewDue).getTime() - Date.now()) / 86_400_000));
    setResult({ score: r.score, total: r.total, reviewDays });
    setPhase("done");
    if (young) readAloud(`You got ${r.score} out of ${r.total}. Great work!`);
  }

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Button title="‹ Back" kind="ghost" color={t.accent} onPress={() => router.back()} />
      <Pressable onPress={() => setReport(true)} accessibilityRole="button" accessibilityLabel="Report a problem" style={{ padding: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>⚑ Report</Text>
      </Pressable>
    </View>
  );

  // ---------------------------------------------------------------- learn
  if (phase === "learn") {
    return (
      <Screen>
        {header}
        <H1 size={young ? 30 : 26}>{lesson.title}</H1>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pill text={`⏱ ${lesson.minutes} min`} />
          {lesson.status === "draft" ? <Pill text="Draft: not yet reviewed by teachers" color={colors.warn} bg={colors.warnSoft} /> : <Pill text="✓ Reviewed by teachers" color={colors.good} bg={colors.goodSoft} />}
        </View>
        {young ? (
          <Button title="🔊 Read it to me" kind="secondary" color={t.accent} onPress={() => readAloud(lesson.sections.filter((s) => s.type !== "parent").map((s) => s.body).join(". "))} />
        ) : null}
        {lesson.sections.map((s, i) => {
          const st = SECTION_STYLE[s.type]!;
          return (
            <Card key={i} style={{ backgroundColor: st.bg, borderRadius: t.radius }}>
              {st.icon ? <Text style={{ fontWeight: "800", color: colors.ink }}>{st.icon}{s.videoMinutes ? ` (${s.videoMinutes} min)` : ""}</Text> : null}
              {s.type === "video" && s.videoId ? <VideoEmbed videoId={s.videoId} title={s.body} /> : null}
              <Text style={{ fontSize: s.type === "parent" ? 15 : t.font, lineHeight: (s.type === "parent" ? 15 : t.font) * 1.45, color: colors.ink }}>{s.body}</Text>
            </Card>
          );
        })}
        {more?.available ? (
          <Card style={{ borderRadius: t.radius, backgroundColor: "#F7F9FC" }}>
            <Text style={{ fontWeight: "800", color: colors.ink }}>📖 Learn more: {more.title}</Text>
            <Text style={{ fontSize: t.font - 2, lineHeight: (t.font - 2) * 1.45, color: colors.ink }}>{more.extract}</Text>
            <Pressable onPress={() => sourceLink.open(more.url)} accessibilityRole="link">
              <Text style={{ color: colors.muted, fontSize: 12 }}>From {more.source} ({more.license}). <Text style={{ textDecorationLine: "underline" }}>Read the full article ↗</Text></Text>
            </Pressable>
          </Card>
        ) : null}
        {child.aiEnabled ? (
          <Button title="🦉 Ask Hoot about this lesson" kind="secondary" color={t.accent} onPress={() => router.push(`/learn/${childId}/tutor/${lessonId}`)} />
        ) : null}
        <Button big title={young ? "Let's play the quiz! 🎉" : "Start the quiz"} color={t.accent} onPress={() => setPhase("quiz")} />
        {lesson.sources.length ? (
          <Card>
            <Text style={{ fontWeight: "700", color: colors.ink }}>📚 Sources (for grown-ups)</Text>
            {lesson.sources.map((src) => (
              <Pressable key={src.url} onPress={() => sourceLink.open(src.url)} accessibilityRole="link">
                <Text style={{ color: colors.brand, fontSize: 14, textDecorationLine: "underline" }}>{src.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{src.license}</Text>
              </Pressable>
            ))}
          </Card>
        ) : null}
        {sourceLink.modal}
        <ReportSheet visible={report} onClose={() => setReport(false)} childId={child.id} lessonId={lesson.id} />
      </Screen>
    );
  }

  // ---------------------------------------------------------------- done
  if (phase === "done" && result) {
    const days = result.reviewDays;
    const perfect = result.score === result.total;
    return (
      <Screen>
        <View style={{ alignItems: "center", gap: 12, marginTop: 30 }}>
          <Text style={{ fontSize: 80 }}>{perfect ? "🏆" : "🌱"}</Text>
          <H1>{perfect ? "Amazing!" : "Great effort!"}</H1>
          <P center size={20}>You got {result.score} out of {result.total} on your first tries.</P>
          <P center muted>{perfect ? `This lesson will pop back for a quick review in ${days} days, to help you remember it.` : "We'll bring this lesson back tomorrow so you can practise. Mistakes help your brain grow! 🧠"}</P>
        </View>
        <Button big title="More lessons" color={t.accent} onPress={() => router.back()} />
        <Button title="Try again" kind="secondary" color={t.accent} onPress={() => { setQs(lesson.quiz.map(freshQ)); setQi(0); setPhase("quiz"); }} />
      </Screen>
    );
  }

  // ---------------------------------------------------------------- quiz
  const q = lesson.quiz[qi]!;
  const st = qs[qi]!;
  const last = qi === lesson.quiz.length - 1;
  const canAskHoot = child.aiEnabled && !st.correct;

  return (
    <Screen>
      {header}
      <Text style={{ color: t.accent, fontWeight: "800" }}>Question {qi + 1} of {lesson.quiz.length}</Text>
      <Card style={{ borderRadius: t.radius }}>
        <Text style={{ fontSize: t.font + 4, fontWeight: "800", color: colors.ink, lineHeight: (t.font + 4) * 1.35 }}>{q.q}</Text>
        {young ? <Button title="🔊 Read the question" kind="ghost" color={t.accent} onPress={() => readAloud(`${q.q}. ${q.options.join(". Or, ")}`)} /> : null}
      </Card>

      <View style={{ gap: 10 }}>
        {q.options.map((opt, i) => {
          const isPicked = st.picked === i;
          const isRight = (isPicked && st.correct) || st.revealed === i;
          const isWrong = isPicked && st.correct === false;
          return (
            <Pressable
              key={i}
              onPress={() => choose(i)}
              disabled={!!st.correct || st.revealed !== null}
              accessibilityRole="button"
              accessibilityLabel={opt}
              style={({ pressed }) => [
                { padding: young ? 20 : 16, borderRadius: t.radius, borderWidth: 2, backgroundColor: "#fff", borderColor: colors.line },
                isRight && { borderColor: colors.good, backgroundColor: colors.goodSoft },
                isWrong && { borderColor: colors.warn, backgroundColor: colors.warnSoft },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={{ fontSize: young ? 24 : t.font, color: colors.ink, fontWeight: "600" }}>{isRight ? "✅ " : isWrong ? "🤔 " : ""}{opt}</Text>
            </Pressable>
          );
        })}
      </View>

      {st.correct === false && st.revealed === null ? <Banner>Good try! Not quite. Have another think, or get a hint.</Banner> : null}
      {st.hints.map((h, i) => (
        <Card key={i} style={{ backgroundColor: t.soft, borderColor: t.accent }}>
          <Text style={{ fontWeight: "800", color: t.accent }}>{["💭 Hint", "🔎 Bigger hint", "🧩 Worked example"][i]}</Text>
          <Text style={{ fontSize: t.font - 1, color: colors.ink, lineHeight: (t.font - 1) * 1.45 }}>{h}</Text>
        </Card>
      ))}
      {st.explain ? (
        <Card style={{ backgroundColor: colors.goodSoft, borderColor: colors.good }}>
          <Text style={{ fontWeight: "800", color: colors.good }}>{st.correct ? "🎉 Yes! Here's why:" : "📖 Let's learn it:"}</Text>
          <Text style={{ fontSize: t.font - 1, color: colors.ink, lineHeight: (t.font - 1) * 1.45 }}>{st.explain}</Text>
        </Card>
      ) : null}

      <View style={{ gap: 10, marginTop: 4 }}>
        {!st.correct && st.revealed === null && st.hints.length < 3 ? (
          <Button title={st.hints.length === 0 ? "💭 I need a hint" : "💭 Another hint"} kind="secondary" color={t.accent} onPress={hint} />
        ) : null}
        {canAskHoot && st.revealed === null ? (
          <Button title="🦉 Ask Hoot to help me think" kind="secondary" color={t.accent} onPress={() => router.push(`/learn/${childId}/tutor/${lessonId}?question=${qi}`)} />
        ) : null}
        {st.correct || st.revealed !== null ? (
          <Button big title={last ? "Finish 🎉" : "Next question →"} color={t.accent} onPress={() => (last ? finish() : setQi(qi + 1))} />
        ) : null}
      </View>
      <ReportSheet visible={report} onClose={() => setReport(false)} childId={child.id} lessonId={lesson.id} />
    </Screen>
  );
}
