import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Banner, Button, Card, H1, Loading, Pill, Screen } from "../../../../components/ui";
import { api, friendly, type LessonSummary } from "../../../../lib/api";
import { useChild, useSession } from "../../../../lib/session";
import { bandTheme, colors, subjectEmoji } from "../../../../lib/theme";

export default function SubjectLessons() {
  const { childId, subjectId } = useLocalSearchParams<{ childId: string; subjectId: string }>();
  const { familyToken, map } = useSession();
  const child = useChild(childId);
  const [data, setData] = useState<{ lessons: LessonSummary[]; lockedCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<{ lessons: LessonSummary[]; lockedCount: number }>("GET", `/children/${childId}/lessons?subject=${subjectId}`, familyToken)
        .then(setData)
        .catch((e) => setError(friendly(e)));
    }, [childId, subjectId, familyToken]),
  );

  if (!child) return null;
  const t = bandTheme[child.band];
  const subject = map?.subjects.find((s) => s.id === subjectId);

  return (
    <Screen>
      <Button title="‹ Subjects" kind="ghost" color={t.accent} onPress={() => router.back()} />
      <H1>{subjectEmoji[subjectId ?? ""]} {subject?.name}</H1>
      {error ? <Banner>{error}</Banner> : null}
      {!data ? <Loading /> : null}
      {data?.lessons.map((l) => {
        const done = !!l.progress;
        return (
          <Card key={l.id} onPress={() => router.push(`/learn/${childId}/lesson/${l.id}`)} label={l.title} style={{ borderRadius: t.radius, borderLeftWidth: 6, borderLeftColor: done ? colors.good : t.accent }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 26 }}>{done ? "✅" : "▶️"}</Text>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontWeight: "800", fontSize: t.font, color: colors.ink }}>{l.title}</Text>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  <Pill text={`⏱ ${l.minutes} min`} />
                  <Pill text={`${l.questions} questions`} />
                  {done ? <Pill text={`Best: ${l.progress!.best_score}/${l.progress!.total}`} color={colors.good} bg={colors.goodSoft} /> : null}
                  {l.status === "draft" ? <Pill text="Draft" color={colors.warn} bg={colors.warnSoft} /> : null}
                </View>
              </View>
            </View>
          </Card>
        );
      })}
      {data && data.lessons.length === 0 && !data.lockedCount ? <Banner tone="info">More lessons are coming soon!</Banner> : null}
      {data?.lockedCount ? (
        <Banner tone="info">🔒 {data.lockedCount} more lesson{data.lockedCount > 1 ? "s" : ""} here need a parent's permission. Ask your grown-up!</Banner>
      ) : null}
    </Screen>
  );
}
