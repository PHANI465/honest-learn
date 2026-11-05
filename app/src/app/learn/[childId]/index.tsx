import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";
import { OfflineBanner } from "../../../components/OfflineBanner";
import { Banner, Button, Card, Emoji, H1, H2, Loading, P, ProgressBar, Screen } from "../../../components/ui";
import { api, friendly, type Band, type Child, type LessonSummary, type Subject } from "../../../lib/api";
import { cachedGet, offlineMessage } from "../../../lib/offline";
import { useSession } from "../../../lib/session";
import { localDay, type Usage } from "../../../lib/timer";
import { avatars, bandTheme, colors, subjectEmoji } from "../../../lib/theme";

interface Home {
  child: Child;
  band: Band;
  subjects: Subject[];
  reviewDue: LessonSummary[];
  next?: LessonSummary | null;
  totals?: { lessons: number; completed: number; stars: number };
}

export default function ChildHome() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { familyToken } = useSession();
  const { width } = useWindowDimensions();
  const [home, setHome] = useState<Home | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [allLessons, setAllLessons] = useState<LessonSummary[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!childId) return;
      cachedGet<Home>(childId, `/children/${childId}/home`, familyToken)
        .then((r) => {
          setHome(r.data);
          setFromCache(r.fromCache);
          setError(null);
        })
        .catch((e) => setError(offlineMessage(e, friendly(e))));
      api<Usage>("GET", `/children/${childId}/usage?day=${localDay()}`, familyToken).then(setUsage).catch(() => {});
    }, [childId, familyToken]),
  );

  // Lesson search: load the child's lesson list the first time they type.
  function onSearch(text: string) {
    setQuery(text);
    if (text && !allLessons && childId) {
      cachedGet<{ lessons: LessonSummary[] }>(childId, `/children/${childId}/lessons`, familyToken)
        .then((r) => setAllLessons(r.data.lessons))
        .catch(() => setAllLessons([]));
    }
  }
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !allLessons) return [];
    return allLessons.filter((l) => l.title.toLowerCase().includes(q)).slice(0, 8);
  }, [query, allLessons]);

  if (error) return <Screen><Banner>{error}</Banner><Button title="Back" onPress={() => router.replace("/profiles")} /></Screen>;
  if (!home) return <Loading />;
  const t = bandTheme[home.child.band];
  const young = home.child.band === "b1" || home.child.band === "b2";
  const cols = width >= 1000 ? 4 : width >= 680 ? 3 : 2;
  const totals = home.totals;

  return (
    <Screen wide>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Emoji size={52}>{avatars[home.child.avatar]}</Emoji>
        <View style={{ flex: 1 }}>
          <H1 size={young ? 30 : 26}>Hi, {home.child.nickname}!</H1>
          <Text style={{ color: t.accent, fontWeight: "700", fontSize: 15 }}>{home.band.name}</Text>
        </View>
        <Button title="Switch" kind="ghost" label="Switch profile" onPress={() => router.replace("/profiles")} />
      </View>
      <OfflineBanner fromCache={fromCache} />

      {totals ? (
        <Card style={{ backgroundColor: t.soft, borderColor: t.accent, borderRadius: t.radius }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <Text style={{ fontWeight: "800", fontSize: 16, color: colors.ink }}>
              📚 {totals.completed} of {totals.lessons} lessons
            </Text>
            <Text style={{ fontWeight: "800", fontSize: 16, color: colors.ink }} accessibilityLabel={`${totals.stars} stars for perfect lessons`}>
              ⭐ {totals.stars} {totals.stars === 1 ? "star" : "stars"}
            </Text>
            {usage ? (
              <Text style={{ fontSize: 14, color: colors.muted }}>⏱ {usage.remaining} min left today</Text>
            ) : null}
          </View>
          <ProgressBar value={totals.lessons ? totals.completed / totals.lessons : 0} color={t.accent} label={`${totals.completed} of ${totals.lessons} lessons finished`} />
          <P size={13} muted>Get every question right on your first try to earn a star. No streaks, no pressure: learn at your own pace.</P>
        </Card>
      ) : null}

      {home.next ? (
        <Card onPress={() => router.push(`/learn/${childId}/lesson/${home.next!.id}`)} label={`Keep going: ${home.next.title}`} style={{ backgroundColor: t.accent, borderColor: t.accent, borderRadius: t.radius, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Emoji size={34}>{subjectEmoji[home.next.subject] ?? "▶️"}</Emoji>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>{totals?.completed ? "KEEP GOING" : "START HERE"}</Text>
            <Text style={{ color: "#fff", fontSize: t.font, fontWeight: "800" }}>{home.next.title}</Text>
            <Text style={{ color: "#fff", fontSize: 13 }}>⏱ {home.next.minutes} min</Text>
          </View>
          <Text style={{ color: "#fff", fontSize: 26 }} aria-hidden accessibilityElementsHidden importantForAccessibility="no">›</Text>
        </Card>
      ) : null}

      {home.reviewDue.length ? (
        <Card style={{ backgroundColor: colors.card, borderColor: t.accent }}>
          <Text style={{ fontWeight: "800", fontSize: 17, color: colors.ink }}>🔁 Quick review</Text>
          <P size={14} muted>Remembering old lessons makes them stick. Try these again:</P>
          {home.reviewDue.slice(0, 3).map((l) => (
            <Button key={l.id} title={l.title} kind="secondary" color={t.accent} onPress={() => router.push(`/learn/${childId}/lesson/${l.id}`)} />
          ))}
        </Card>
      ) : null}

      {!young ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={query}
            onChangeText={onSearch}
            placeholder="🔎 Search lessons"
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Search lessons"
            style={{ borderWidth: 1.5, borderColor: colors.inputLine, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card, color: colors.ink }}
          />
          {query.trim() ? (
            matches.length ? (
              matches.map((l) => (
                <Pressable key={l.id} onPress={() => router.push(`/learn/${childId}/lesson/${l.id}`)} accessibilityRole="button" accessibilityLabel={l.title}
                  style={{ padding: 12, minHeight: 44, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <Emoji size={20}>{subjectEmoji[l.subject] ?? "📘"}</Emoji>
                  <Text style={{ flex: 1, fontSize: 16, color: colors.ink, fontWeight: "600" }}>{l.title}</Text>
                  {l.progress ? <Text style={{ color: colors.good, fontWeight: "700" }}>✓</Text> : null}
                </Pressable>
              ))
            ) : (
              <P size={14} muted>{allLessons ? "No lessons match that. Try another word." : "Searching…"}</P>
            )
          ) : null}
        </View>
      ) : null}

      <Card onPress={() => router.push(`/learn/${childId}/puzzles`)} label="Brain puzzles" style={{ borderRadius: t.radius, flexDirection: "row", alignItems: "center", gap: 12, borderColor: t.accent, borderWidth: 2 }}>
        <Emoji size={36}>🧩</Emoji>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", fontSize: t.font, color: colors.ink }}>Brain puzzles</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{young ? "Patterns and thinking games" : "Patterns, sequences, analogies and logic"}</Text>
        </View>
        <Text style={{ fontSize: 22, color: colors.muted }} aria-hidden accessibilityElementsHidden importantForAccessibility="no">›</Text>
      </Card>

      <H2>{young ? "What do you want to learn? 🌟" : "Subjects"}</H2>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {home.subjects.map((s) => {
          const empty = s.lessonCount === 0;
          const pct = s.lessonCount ? s.completed / s.lessonCount : 0;
          const doneAll = !empty && s.completed === s.lessonCount;
          return (
            <Card
              key={s.id}
              onPress={empty ? undefined : () => router.push(`/learn/${childId}/subject/${s.id}`)}
              label={empty ? undefined : `${s.name}, ${s.completed} of ${s.lessonCount} lessons done`}
              style={{ width: `${100 / cols - 3}%`, flexGrow: 1, minWidth: 140, borderRadius: t.radius, opacity: empty ? 0.55 : 1, borderColor: empty ? colors.line : t.accent, borderWidth: empty ? 1 : 2 }}
            >
              <View style={{ width: young ? 60 : 50, height: young ? 60 : 50, borderRadius: 999, backgroundColor: t.soft, alignItems: "center", justifyContent: "center" }}>
                <Emoji size={young ? 34 : 28}>{subjectEmoji[s.id] ?? "📘"}</Emoji>
              </View>
              <Text style={{ fontWeight: "800", fontSize: t.font, color: colors.ink }}>{s.name}</Text>
              {empty ? (
                <Text style={{ color: colors.muted, fontSize: 13 }}>Coming soon</Text>
              ) : (
                <>
                  <ProgressBar value={pct} color={t.accent} height={8} label={`${s.completed} of ${s.lessonCount} done`} />
                  <Text style={{ color: doneAll ? colors.good : colors.muted, fontSize: 13, fontWeight: doneAll ? "700" : "400" }}>
                    {doneAll ? "🏅 All done!" : `${s.completed} of ${s.lessonCount} done`}
                  </Text>
                </>
              )}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
