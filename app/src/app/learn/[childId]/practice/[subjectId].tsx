import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { QuizRunner } from "../../../../components/QuizRunner";
import { Banner, Button, H1, Loading, P, Screen } from "../../../../components/ui";
import { api, friendly } from "../../../../lib/api";
import { isOfflineError } from "../../../../lib/offline";
import { useChild, useSession } from "../../../../lib/session";
import { bandTheme, subjectEmoji } from "../../../../lib/theme";

interface PracticeQ {
  lessonId: string;
  lessonTitle: string;
  question: number;
  q: string;
  options: string[];
}

/** A quick mixed quiz from a subject's lessons. Retrieval practice, not graded. */
export default function Practice() {
  const { childId, subjectId } = useLocalSearchParams<{ childId: string; subjectId: string }>();
  const { familyToken, map } = useSession();
  const child = useChild(childId);
  const [qs, setQs] = useState<PracticeQ[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ questions: PracticeQ[] }>("GET", `/children/${childId}/practice?subject=${subjectId}`, familyToken)
      .then((r) => setQs(r.questions))
      .catch((e) =>
        setError(isOfflineError(e) ? "Practice quizzes need the internet to check answers. You can still read lessons you've opened before." : friendly(e)),
      );
  }, [childId, subjectId, familyToken]);

  if (!child) return null;
  const t = bandTheme[child.band];
  const subject = map?.subjects.find((s) => s.id === subjectId);
  if (error) return <Screen><Banner tone="info">{error}</Banner><Button title="Back" onPress={() => router.back()} /></Screen>;
  if (!qs) return <Loading />;

  return (
    <Screen>
      <Button title="‹ Back" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back" />
      <H1 size={24}>🎯 {subjectEmoji[subjectId ?? ""]} {subject?.name} practice</H1>
      {qs.length === 0 ? (
        <Banner tone="info">No questions here yet. Try a lesson first!</Banner>
      ) : (
        <>
          <P muted size={14}>Mixed questions from your lessons. Remembering things you learned earlier is one of the best ways to make them stick.</P>
          <QuizRunner
            band={child.band}
            questions={qs.map((q) => ({ q: q.q, options: q.options, label: q.lessonTitle }))}
            check={(i, choice, hintsUsed) => api("POST", `/children/${childId}/lessons/${qs[i]!.lessonId}/check`, familyToken, { question: qs[i]!.question, choice, hintsUsed })}
            hint={(i, level) =>
              api<{ hint: string }>("POST", `/children/${childId}/lessons/${qs[i]!.lessonId}/hint`, familyToken, { question: qs[i]!.question, level }).then((r) => r.hint)
            }
            onDone={() => router.back()}
          />
        </>
      )}
    </Screen>
  );
}
