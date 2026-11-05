import { Redirect, router } from "expo-router";
import { Text, View } from "react-native";
import { DemoBanner } from "../components/DemoBanner";
import { Button, Card, H1, Loading, P, Screen } from "../components/ui";
import { useSession } from "../lib/session";
import { avatars, bandTheme, colors } from "../lib/theme";

export default function Profiles() {
  const { ready, familyToken, children, map } = useSession();
  if (!ready) return <Loading />;
  if (!familyToken) return <Redirect href="/welcome" />;

  return (
    <Screen>
      <DemoBanner />
      <View style={{ alignItems: "center", marginTop: 16, gap: 4 }}>
        <Text style={{ fontSize: 48 }}>🦉</Text>
        <H1>Who's learning today?</H1>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
        {children.map((c) => {
          const t = bandTheme[c.band];
          const band = map?.bands.find((b) => b.id === c.band);
          return (
            <Card key={c.id} onPress={() => router.push(`/learn/${c.id}`)} label={`Learn as ${c.nickname}`} style={{ width: 150, alignItems: "center", backgroundColor: t.soft, borderColor: t.accent, borderWidth: 2 }}>
              <Text style={{ fontSize: 56 }}>{avatars[c.avatar] ?? "🦉"}</Text>
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}>{c.nickname}</Text>
              <Text style={{ fontSize: 13, color: t.accent, fontWeight: "700" }}>{band?.name ?? ""}</Text>
            </Card>
          );
        })}
      </View>
      {children.length === 0 ? <P muted center>No profiles yet. A parent can add one.</P> : null}
      <View style={{ marginTop: "auto", gap: 8 }}>
        <Button title="🔒 Parent area" kind="secondary" onPress={() => router.push("/parent")} />
      </View>
    </Screen>
  );
}
