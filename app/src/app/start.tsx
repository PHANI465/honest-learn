import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { Banner, Button, Card, H1, P, Screen } from "../components/ui";
import { appMode, chooseThisDeviceOnly, chosenServerAddress } from "../lib/server";
import { useSession } from "../lib/session";
import { colors } from "../lib/theme";

/**
 * First run of the phone app (task T8c): use Honest Learn on this phone only (standalone mode: the lessons, the database and
 * the API live in the app) or connect to a server the family runs or trusts. Can be changed later from the welcome screen,
 * before signing in. Each way keeps its own accounts: a family made on this phone is not on a server, and the other way round.
 */
export default function Start() {
  const { reloadContent, familyToken } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (Platform.OS === "web") return <Redirect href="/" />;
  const current = appMode();

  async function deviceOnly() {
    setBusy(true);
    setError(null);
    try {
      await chooseThisDeviceOnly();
      await reloadContent();
      router.replace("/");
    } catch {
      setError("The app couldn't save that choice. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const point = (text: string) => (
    <View key={text} style={{ flexDirection: "row", gap: 8 }}>
      <Text style={{ color: colors.ink }}>•</Text>
      <Text style={{ color: colors.ink, flex: 1, lineHeight: 20 }}>{text}</Text>
    </View>
  );

  return (
    <Screen>
      <H1>How will your family use Honest Learn?</H1>
      <P muted>You can change this later, before signing in. Each way has its own accounts.</P>
      {familyToken ? <Banner tone="info">You are signed in. Sign out in the parent area first to change this.</Banner> : null}
      {error ? <Banner>{error}</Banner> : null}

      <Card style={current === "device" ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
        <Text style={{ fontWeight: "800", fontSize: 18, color: colors.ink }}>📱 On this phone only</Text>
        {[
          "Every lesson is in the app. Your account, your children's progress and Hoot chats stay on this phone.",
          "No email and no server. You get a recovery phrase instead, in case you forget your password.",
          "Hoot uses each lesson's own hints, or a model you connect yourself in the parent area.",
          "Only on this phone: if the phone is lost or the app is removed, the data is gone. You can download a copy from the parent area.",
        ].map(point)}
        <Button big title="Use on this phone only" onPress={deviceOnly} loading={busy} disabled={!!familyToken} />
      </Card>

      <Card style={current === "server" ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
        <Text style={{ fontWeight: "800", fontSize: 18, color: colors.ink }}>🖥️ Connect to a server</Text>
        {[
          "Use the same account on several phones, tablets and the website.",
          "Needs a server your family runs (for example on your computer at home) or trusts.",
          "Email is used to verify your account and reset your password.",
        ].map(point)}
        {current === "server" && chosenServerAddress() ? <P muted size={13}>Now: {chosenServerAddress()}</P> : null}
        <Button title="Connect to a server" kind="secondary" onPress={() => router.push("/server")} disabled={!!familyToken} />
      </Card>
    </Screen>
  );
}
