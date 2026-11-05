import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Banner, Button, Card, Field, H1, P, Screen } from "../../components/ui";
import { friendly, type Child } from "../../lib/api";
import { useSession } from "../../lib/session";
import { avatars, colors } from "../../lib/theme";

export default function AddChild() {
  const { parentApi, refreshFamily, map } = useSession();
  const [nickname, setNickname] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [avatar, setAvatar] = useState("owl");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const year = Number(birthYear);
  const age = birthYear.length === 4 ? new Date().getFullYear() - year : null;
  const band = age === null ? null : map?.bands.find((b) => age >= b.ages[0] && age <= b.ages[1]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await parentApi<{ child: Child }>("POST", "/children", { nickname: nickname.trim(), birthYear: year, avatar });
      await refreshFamily();
      router.replace("/parent");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Add a child</H1>
      <P muted>We only need a nickname and birth year. No real names, photos or school details.</P>
      {error ? <Banner>{error}</Banner> : null}
      <Card>
        <Field label="Nickname" value={nickname} onChangeText={setNickname} maxLength={30} hint="Shown on their profile. A nickname is safest." />
        <Field label="Birth year" value={birthYear} onChangeText={(t) => setBirthYear(t.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={4} placeholder={String(new Date().getFullYear() - 8)} />
        {age !== null ? (
          band ? (
            <Banner tone="good">Age {age}: {band.name} (ages {band.ages.join("–")}). You can change their level later if they're ahead or need more practice.</Banner>
          ) : (
            <Banner>Honest Learn is designed for ages 3–18.</Banner>
          )
        ) : null}
      </Card>
      <Card>
        <Text style={{ fontWeight: "600", fontSize: 15, color: colors.ink }}>Pick an avatar</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {Object.entries(avatars).map(([id, emoji]) => (
            <Pressable key={id} onPress={() => setAvatar(id)} accessibilityRole="radio" accessibilityLabel={`${id} avatar`} accessibilityState={{ selected: avatar === id, checked: avatar === id }}
              style={{ width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: avatar === id ? colors.brand : "transparent", backgroundColor: "#F4F1EA" }}>
              <Text style={{ fontSize: 32 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <Button big title="Save" onPress={save} disabled={!nickname.trim() || !band} loading={busy} />
      <Button title="Cancel" kind="ghost" onPress={() => router.replace("/parent")} />
    </Screen>
  );
}
