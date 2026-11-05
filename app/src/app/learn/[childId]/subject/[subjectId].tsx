import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Banner, Button, Card, Emoji, H1, Loading, Pill, ProgressBar, Screen } from "../../../../components/ui";
import { useExternalLink } from "../../../../components/ExternalLink";
import { OfflineBanner } from "../../../../components/OfflineBanner";
import { friendly, type FreeResource, type LessonSummary } from "../../../../lib/api";
import { cachedGet, offlineMessage } from "../../../../lib/offline";
import { useChild, useSession } from "../../../../lib/session";
import { bandTheme, colors, subjectEmoji } from "../../../../lib/theme";

export default function SubjectLessons() {
  const { childId, subjectId } = useLocalSearchParams<{ childId: string; subjectId: string }>();
  const { familyToken, map } = useSession();
  const child = useChild(childId);
  const [data, setData] = useState<{ lessons: LessonSummary[]; lockedCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [resources, setResources] = useState<{ resources: FreeResource[]; opensWithParentPin: boolean } | null>(null);
  const link = useExternalLink(resources?.opensWithParentPin ?? true);

  useFocusEffect(
    useCallback(() => {
      if (!childId) return;
      cachedGet<{ resources: FreeResource[]; opensWithParentPin: boolean }>(childId, `/children/${childId}/resources?subject=${subjectId}`, familyToken)
        .then((r) => setResources(r.data))
        .catch(() => {});
    }, [childId, subjectId, familyToken]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!childId) return;
      cachedGet<{ lessons: LessonSummary[]; lockedCount: number }>(childId, `/children/${childId}/lessons?subject=${subjectId}`, familyToken)
        .then((r) => {
          setData(r.data);
          setFromCache(r.fromCache);
          setError(null);
        })
        .catch((e) => setError(offlineMessage(e, friendly(e))));
    }, [childId, subjectId, familyToken]),
  );

  if (!child) return null;
  const t = bandTheme[child.band];
  const subject = map?.subjects.find((s) => s.id === subjectId);

  return (
    <Screen wide>
      <Button title="‹ Subjects" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back to subjects" />
      <OfflineBanner fromCache={fromCache} />
      <H1>{subjectEmoji[subjectId ?? ""]} {subject?.name}</H1>
      {error ? <Banner>{error}</Banner> : null}
      {!data ? <Loading /> : null}
      {data && data.lessons.length ? (() => {
        const doneCount = data.lessons.filter((l) => l.progress).length;
        const drafts = data.lessons.some((l) => l.status === "draft");
        return (
          <View style={{ gap: 6 }}>
            <ProgressBar value={doneCount / data.lessons.length} color={t.accent} label={`${doneCount} of ${data.lessons.length} lessons done`} />
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {doneCount} of {data.lessons.length} lessons done{drafts ? " · Lessons marked ✏️ are still being checked by teachers" : ""}
            </Text>
          </View>
        );
      })() : null}
      {data?.lessons.map((l) => {
        const done = !!l.progress;
        const perfect = done && l.progress!.best_score === l.progress!.total;
        return (
          <Card key={l.id} onPress={() => router.push(`/learn/${childId}/lesson/${l.id}`)} label={`${l.title}, ${l.minutes} minutes${done ? ", done" : ""}`} style={{ borderRadius: t.radius, borderLeftWidth: 6, borderLeftColor: done ? colors.good : t.accent }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Emoji size={26}>{perfect ? "⭐" : done ? "✅" : "▶️"}</Emoji>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontWeight: "800", fontSize: t.font, color: colors.ink }}>{l.title}{l.status === "draft" ? " ✏️" : ""}</Text>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  <Pill text={`⏱ ${l.minutes} min`} />
                  <Pill text={`${l.questions} questions`} />
                  {done ? <Pill text={`Best: ${l.progress!.best_score}/${l.progress!.total}`} color={colors.good} bg={colors.goodSoft} /> : null}
                </View>
              </View>
            </View>
          </Card>
        );
      })}
      {data && data.lessons.length > 0 ? (
        <Button title="🎯 Practice quiz (mixed questions)" kind="secondary" color={t.accent} onPress={() => router.push(`/learn/${childId}/practice/${subjectId}`)} />
      ) : null}
      {data && data.lessons.length === 0 && !data.lockedCount ? <Banner tone="info">More lessons are coming soon!</Banner> : null}
      {data?.lockedCount ? (
        <Banner tone="info">🔒 {data.lockedCount} more lesson{data.lockedCount > 1 ? "s" : ""} here need a parent's permission. Ask your grown-up!</Banner>
      ) : null}

      {resources?.resources.length ? (
        <>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink, marginTop: 8 }}>🌐 More free learning</Text>
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            Hand-picked free websites for your age.{resources.opensWithParentPin ? " A grown-up opens them with their PIN." : ""}
          </Text>
          {resources.resources.map((r) => (
            <Card key={r.id} onPress={() => link.open(r.url)} label={`Open ${r.name}, a website outside Honest Learn`} style={{ borderRadius: t.radius }}>
              <Text style={{ fontWeight: "800", fontSize: 16, color: colors.ink }}>{r.name} ↗</Text>
              <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{r.description}</Text>
              <Pill text={r.account === "none" ? "Free · no account" : `Free · account ${r.account}`} />
            </Card>
          ))}
        </>
      ) : null}
      {link.modal}
    </Screen>
  );
}
