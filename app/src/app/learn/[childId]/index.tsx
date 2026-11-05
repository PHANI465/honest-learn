import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Banner, Button, Card, H1, H2, Loading, P, Screen } from "../../../components/ui";
import { api, friendly, type Band, type Child, type LessonSummary, type Subject } from "../../../lib/api";
import { useSession } from "../../../lib/session";
import { avatars, bandTheme, colors, subjectEmoji } from "../../../lib/theme";

interface Home {
  child: Child;
  band: Band;
  subjects: Subject[];
  reviewDue: LessonSummary[];
}

export default function ChildHome() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { familyToken } = useSession();
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<Home>("GET", `/children/${childId}/home`, familyToken).then(setHome).catch((e) => setError(friendly(e)));
    }, [childId, familyToken]),
  );

  if (error) return <Screen><Banner>{error}</Banner><Button title="Back" onPress={() => router.replace("/profiles")} /></Screen>;
  if (!home) return <Loading />;
  const t = bandTheme[home.child.band];
  const young = home.child.band === "b1" || home.child.band === "b2";

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ fontSize: 52 }}>{avatars[home.child.avatar]}</Text>
        <View style={{ flex: 1 }}>
          <H1 size={young ? 30 : 26}>Hi, {home.child.nickname}!</H1>
          <Text style={{ color: t.accent, fontWeight: "700", fontSize: 15 }}>{home.band.name}</Text>
        </View>
        <Button title="Switch" kind="ghost" onPress={() => router.replace("/profiles")} />
      </View>

      {home.reviewDue.length ? (
        <Card style={{ backgroundColor: t.soft, borderColor: t.accent }}>
          <Text style={{ fontWeight: "800", fontSize: 17, color: colors.ink }}>🔁 Quick review</Text>
          <P size={14} muted>Remembering old lessons makes them stick. Try these again:</P>
          {home.reviewDue.slice(0, 3).map((l) => (
            <Button key={l.id} title={l.title} kind="secondary" color={t.accent} onPress={() => router.push(`/learn/${childId}/lesson/${l.id}`)} />
          ))}
        </Card>
      ) : null}

      <H2>{young ? "What do you want to learn? 🌟" : "Subjects"}</H2>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {home.subjects.map((s) => {
          const empty = s.lessonCount === 0;
          return (
            <Card
              key={s.id}
              onPress={empty ? undefined : () => router.push(`/learn/${childId}/subject/${s.id}`)}
              label={s.name}
              style={{ width: "47%", flexGrow: 1, minWidth: 150, borderRadius: t.radius, opacity: empty ? 0.55 : 1, borderColor: empty ? colors.line : t.accent, borderWidth: empty ? 1 : 2 }}
            >
              <Text style={{ fontSize: young ? 40 : 30 }}>{subjectEmoji[s.id] ?? "📘"}</Text>
              <Text style={{ fontWeight: "800", fontSize: t.font, color: colors.ink }}>{s.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {empty ? "Coming soon" : `${s.completed}/${s.lessonCount} done`}
              </Text>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
