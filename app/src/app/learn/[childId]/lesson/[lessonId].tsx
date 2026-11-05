import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useExternalLink } from "../../../../components/ExternalLink";
import { OfflineBanner } from "../../../../components/OfflineBanner";
import { VideoEmbed } from "../../../../components/VideoEmbed";
import { ReportSheet } from "../../../../components/ReportSheet";
import { Banner, Button, Card, Emoji, H1, Loading, P, Pill, ProgressBar, Screen } from "../../../../components/ui";
import { api, friendly, type LearnMore, type Lesson } from "../../../../lib/api";
import { cachedGet, isOffline, isOfflineError, offlineMessage, queueCompletion } from "../../../../lib/offline";
import { useChild, useSession } from "../../../../lib/session";
import { bandTheme, colors, surfaces } from "../../../../lib/theme";

interface QState {
  firstChoice: number | null; // what counts for the score (honest scoring: first try)
  picked: number | null;
  correct: boolean | null;
  /** Picked while offline: saved, but not checked yet. */
  unchecked: boolean;
  hints: string[];
  explain: string | null;
  revealed: number | null;
  tries: number;
}
const freshQ = (): QState => ({ firstChoice: null, picked: null, correct: null, unchecked: false, hints: [], explain: null, revealed: null, tries: 0 });

const SECTION_STYLE: Record<string, { icon: string; bg: string }> = {
  text: { icon: "", bg: colors.card },
  fact: { icon: "💡 Did you know?", bg: surfaces.fact },
  video: { icon: "🎬 Watch", bg: colors.card },
  tryit: { icon: "🙌 Try it!", bg: surfaces.tryit },
  parent: { icon: "👪 For grown-ups", bg: surfaces.parent },
};

const OFFLINE_CHECK = "Connect to the internet to check answers. Your answer is saved, so you can go on, or read the lesson again.";
const OFFLINE_HINT = "Connect to the internet to get hints. You can read the lesson again while you wait.";

/** Links need at least a 44×44 touch area. */
const linkTarget = { minHeight: 44, justifyContent: "center" } as const;

export default function LessonScreen() {
  const { childId, lessonId } = useLocalSearchParams<{ childId: string; lessonId: string }>();
  const { familyToken } = useSession();
  const child = useChild(childId);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [phase, setPhase] = useState<"learn" | "quiz" | "done">("learn");
  const [qi, setQi] = useState(0);
  const [qs, setQs] = useState<QState[]>([]);
  const [result, setResult] = useState<{ score: number; total: number; reviewDays: number } | null>(null);
  /** Finished offline: answers are saved and will be scored when back online. */
  const [queued, setQueued] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [report, setReport] = useState(false);
  const [more, setMore] = useState<LearnMore | null>(null);
  // Under-13s need a parent's PIN to open outside links.
  const sourceLink = useExternalLink(!child || child.band === "b1" || child.band === "b2" || child.band === "b3");

  const base = `/children/${childId}/lessons/${lessonId}`;

  useEffect(() => {
    if (!childId) return;
    cachedGet<{ lesson: Lesson; solved: number[] }>(childId, base, familyToken)
      .then((r) => {
        setLesson(r.data.lesson);
        setQs(r.data.lesson.quiz.map(freshQ));
        setFromCache(r.fromCache);
      })
      .catch((e) => setError(offlineMessage(e, friendly(e))));
    cachedGet<LearnMore>(childId, `${base}/learn-more`, familyToken)
      .then((r) => setMore(r.data))
      .catch(() => {});
    return () => {
      Speech.stop();
    };
  }, [childId, base, familyToken]);

  if (error) return <Screen><Banner>{error}</Banner><Button title="Back" onPress={() => router.back()} /></Screen>;
  if (!lesson || !child) return <Loading />;

  const t = bandTheme[child.band];
  const young = child.band === "b1" || child.band === "b2";
  const readAloud = (text: string) => {
    Speech.stop();
    Speech.speak(text.replace(/[\p{Extended_Pictographic}]/gu, ""), { rate: 0.9 });
  };
  const update = (i: number, patch: Partial<QState>) => setQs((all) => all.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const quizStarted = qs.some((q) => q.firstChoice !== null);

  async function choose(choice: number) {
    const q = qs[qi]!;
    if (q.correct || q.revealed !== null) return;
    setNote(null);
    try {
      const r = await api<{ correct: boolean; explain: string | null; answer: number | null }>("POST", `${base}/check`, familyToken, {
        question: qi,
        choice,
        hintsUsed: q.hints.length,
      });
      update(qi, {
        picked: choice,
        correct: r.correct,
        unchecked: false,
        firstChoice: q.firstChoice ?? choice,
        explain: r.explain,
        revealed: r.answer,
        tries: q.tries + 1,
      });
      if (child?.band === "b1") readAloud(r.correct ? "Yes! Well done!" : "Good try! Let's think again.");
    } catch (e) {
      if (!isOfflineError(e)) return setError(friendly(e));
      // Answers live on the server only, so they can't be checked offline. The first pick still counts.
      update(qi, { picked: choice, correct: null, unchecked: true, firstChoice: q.firstChoice ?? choice });
      setNote(OFFLINE_CHECK);
      if (young) readAloud("Connect to the internet to check answers.");
    }
  }

  async function hint() {
    const q = qs[qi]!;
    const level = q.hints.length;
    if (level > 2) return;
    setNote(null);
    try {
      const r = await api<{ hint: string }>("POST", `${base}/hint`, familyToken, { question: qi, level });
      update(qi, { hints: [...q.hints, r.hint], picked: null, correct: null, unchecked: false });
      if (young) readAloud(r.hint);
    } catch (e) {
      if (!isOfflineError(e)) return setError(friendly(e));
      setNote(OFFLINE_HINT);
    }
  }

  function goTo(i: number) {
    setNote(null);
    setQi(i);
  }

  async function finish() {
    if (finishing || !lesson || !child) return;
    setFinishing(true);
    const choices = qs.map((q) => q.firstChoice ?? -1);
    const saveForLater = async () => {
      await queueCompletion(child.id, lesson.id, choices);
      setQueued(true);
      setPhase("done");
      if (young) readAloud("Well done! We'll save your answers when you're back online.");
    };
    try {
      if (isOffline()) return await saveForLater();
      const r = await api<{ score: number; total: number; reviewDue: string }>("POST", `${base}/complete`, familyToken, { choices });
      const reviewDays = Math.max(1, Math.round((new Date(r.reviewDue).getTime() - Date.now()) / 86_400_000));
      setResult({ score: r.score, total: r.total, reviewDays });
      setQueued(false);
      setPhase("done");
      if (young) readAloud(`You got ${r.score} out of ${r.total}. Great work!`);
    } catch (e) {
      if (isOfflineError(e)) await saveForLater();
      else setError(friendly(e));
    } finally {
      setFinishing(false);
    }
  }

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <Button title="‹ Back" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back" />
      <Pressable onPress={() => setReport(true)} accessibilityRole="button" accessibilityLabel="Report a problem" style={{ padding: 8, minHeight: 44, minWidth: 44, justifyContent: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>⚑ Report</Text>
      </Pressable>
    </View>
  );

  // ---------------------------------------------------------------- learn
  if (phase === "learn") {
    return (
      <Screen>
        {header}
        <OfflineBanner fromCache={fromCache} />
        <H1 size={young ? 30 : 26}>{lesson.title}</H1>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
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
          <Card style={{ borderRadius: t.radius, backgroundColor: surfaces.learnMore }}>
            <Text style={{ fontWeight: "800", color: colors.ink }}>📖 Learn more: {more.title}</Text>
            <Text style={{ fontSize: t.font - 2, lineHeight: (t.font - 2) * 1.45, color: colors.ink }}>{more.extract}</Text>
            <Pressable
              onPress={() => sourceLink.open(more.url)}
              accessibilityRole="link"
              accessibilityLabel={`Read the full article on ${more.source}`}
              accessibilityHint="Opens a website outside Honest Learn"
              style={linkTarget}
            >
              <Text style={{ color: colors.muted, fontSize: 12 }}>From {more.source} ({more.license}). <Text style={{ textDecorationLine: "underline" }}>Read the full article ↗</Text></Text>
            </Pressable>
          </Card>
        ) : null}
        {child.aiEnabled ? (
          <Button title="🦉 Ask Hoot about this lesson" kind="secondary" color={t.accent} onPress={() => router.push(`/learn/${childId}/tutor/${lessonId}`)} />
        ) : null}
        <Button big title={quizStarted ? "Back to the quiz →" : young ? "Let's play the quiz! 🎉" : "Start the quiz"} color={t.accent} onPress={() => setPhase("quiz")} />
        {lesson.sources.length ? (
          <Card>
            <Text style={{ fontWeight: "700", color: colors.ink }}>📚 Sources (for grown-ups)</Text>
            {lesson.sources.map((src) => (
              <Pressable
                key={src.url}
                onPress={() => sourceLink.open(src.url)}
                accessibilityRole="link"
                accessibilityLabel={`${src.title}, ${src.license}`}
                accessibilityHint="Opens a website outside Honest Learn"
                style={linkTarget}
              >
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
  if (phase === "done" && queued) {
    return (
      <Screen>
        <OfflineBanner />
        <View style={{ alignItems: "center", gap: 12, marginTop: 30 }}>
          <Emoji size={80}>📬</Emoji>
          <H1>Well done!</H1>
          <P center size={20}>You finished the quiz.</P>
          <P center muted>You're offline, so your answers are saved on this device. We'll check them and update your progress as soon as you're back online.</P>
        </View>
        <Button big title="More lessons" color={t.accent} onPress={() => router.back()} />
        <Button title="📖 Read the lesson again" kind="secondary" color={t.accent} onPress={() => setPhase("learn")} />
      </Screen>
    );
  }
  if (phase === "done" && result) {
    const days = result.reviewDays;
    const perfect = result.score === result.total;
    return (
      <Screen>
        <View style={{ alignItems: "center", gap: 12, marginTop: 30 }}>
          <Emoji size={80}>{perfect ? "🏆" : "🌱"}</Emoji>
          <H1>{perfect ? "Amazing!" : "Great effort!"}</H1>
          <Text style={{ fontSize: 34, textAlign: "center" }} accessibilityLabel={`${result.score} out of ${result.total} correct`}>{"⭐".repeat(result.score)}{"☆".repeat(Math.max(0, result.total - result.score))}</Text>
          <P center size={20}>You got {result.score} out of {result.total} on your first tries.</P>
          <P center muted>{perfect ? `This lesson will pop back for a quick review in ${days} days, to help you remember it.` : "We'll bring this lesson back tomorrow so you can practise. Mistakes help your brain grow! 🧠"}</P>
        </View>
        <Button big title="More lessons" color={t.accent} onPress={() => router.back()} />
        <Button title="Try again" kind="secondary" color={t.accent} onPress={() => { setQs(lesson.quiz.map(freshQ)); setQi(0); setNote(null); setPhase("quiz"); }} />
      </Screen>
    );
  }

  // ---------------------------------------------------------------- quiz
  const q = lesson.quiz[qi]!;
  const st = qs[qi]!;
  const last = qi === lesson.quiz.length - 1;
  const canAskHoot = child.aiEnabled && !st.correct;
  const answered = !!st.correct || st.revealed !== null;
  const canGoOn = answered || (st.unchecked && st.picked !== null);

  return (
    <Screen>
      {header}
      <OfflineBanner />
      <Text style={{ color: t.accent, fontWeight: "800" }}>Question {qi + 1} of {lesson.quiz.length}</Text>
      <ProgressBar value={(qi + 1) / lesson.quiz.length} color={t.accent} height={8} label={`Question ${qi + 1} of ${lesson.quiz.length}`} />
      <Card style={{ borderRadius: t.radius }}>
        <Text style={{ fontSize: t.font + 4, fontWeight: "800", color: colors.ink, lineHeight: (t.font + 4) * 1.35 }} accessibilityRole="header">{q.q}</Text>
        {young ? <Button title="🔊 Read the question" kind="ghost" color={t.accent} onPress={() => readAloud(`${q.q}. ${q.options.join(". Or, ")}`)} /> : null}
      </Card>

      <View style={{ gap: 10 }}>
        {q.options.map((opt, i) => {
          const isPicked = st.picked === i;
          const isRight = (isPicked && st.correct) || st.revealed === i;
          const isWrong = isPicked && st.correct === false;
          const isSaved = isPicked && st.unchecked;
          return (
            <Pressable
              key={i}
              onPress={() => choose(i)}
              disabled={answered}
              accessibilityRole="button"
              accessibilityLabel={isRight ? `${opt}, correct` : isWrong ? `${opt}, not quite` : isSaved ? `${opt}, chosen, not checked yet` : opt}
              accessibilityState={{ disabled: answered, selected: isPicked }}
              style={({ pressed }) => [
                { padding: young ? 20 : 16, minHeight: 56, justifyContent: "center", borderRadius: t.radius, borderWidth: 2, backgroundColor: colors.card, borderColor: colors.line },
                isSaved && { borderColor: t.accent, backgroundColor: t.soft },
                isRight && { borderColor: colors.good, backgroundColor: colors.goodSoft },
                isWrong && { borderColor: colors.warn, backgroundColor: colors.warnSoft },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={{ fontSize: young ? 24 : t.font, color: colors.ink, fontWeight: "600" }}>{isRight ? "✅ " : isWrong ? "🤔 " : isSaved ? "📌 " : ""}{opt}</Text>
            </Pressable>
          );
        })}
      </View>

      {note ? <Banner tone="info">{note}</Banner> : null}
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
        {!answered && st.hints.length < 3 ? (
          <Button title={st.hints.length === 0 ? "💭 I need a hint" : "💭 Another hint"} kind="secondary" color={t.accent} onPress={hint} />
        ) : null}
        {canAskHoot && st.revealed === null ? (
          <Button title="🦉 Ask Hoot to help me think" kind="secondary" color={t.accent} onPress={() => router.push(`/learn/${childId}/tutor/${lessonId}?question=${qi}`)} />
        ) : null}
        {canGoOn ? (
          <Button big title={last ? "Finish 🎉" : "Next question →"} color={t.accent} loading={finishing} onPress={() => (last ? finish() : goTo(qi + 1))} />
        ) : null}
        <Button title="📖 Read the lesson again" kind="ghost" color={t.accent} onPress={() => { setNote(null); setPhase("learn"); }} />
      </View>
      <ReportSheet visible={report} onClose={() => setReport(false)} childId={child.id} lessonId={lesson.id} />
    </Screen>
  );
}
