import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { PinModal } from "../../../components/PinPad";
import { Button, H1, P, Screen } from "../../../components/ui";
import { useChild, useSession } from "../../../lib/session";
import { api } from "../../../lib/api";
import { localDay, useDailyUsage, type Usage } from "../../../lib/timer";
import { colors } from "../../../lib/theme";

/** Wraps every learning screen: checks the profile and enforces the parent's daily time limit. */
export default function LearnLayout() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { ready, familyToken } = useSession();
  const child = useChild(childId);
  const { usage, setUsage } = useDailyUsage(childId, familyToken);
  const [pin, setPin] = useState(false);

  if (ready && !familyToken) return <Redirect href="/welcome" />;
  if (ready && !child) return <Redirect href="/profiles" />;
  if (!child) return null;

  if (usage && usage.remaining <= 0) {
    return (
      <Screen>
        <View style={{ alignItems: "center", gap: 12, marginTop: 40 }}>
          <Text style={{ fontSize: 72 }}>🌳</Text>
          <H1>Time for a break, {child.nickname}!</H1>
          <P center muted size={18}>You learned for {usage.minutes} minutes today. Great job! Go play, move, or read a book. See you tomorrow. 💚</P>
        </View>
        <View style={{ gap: 10, marginTop: "auto" }}>
          <Button title="Back to profiles" onPress={() => router.replace("/profiles")} />
          <Button title="Grown-up: add 15 minutes" kind="ghost" color={colors.muted} onPress={() => setPin(true)} />
        </View>
        <PinModal visible={pin} onClose={() => setPin(false)} onSuccess={async (token) => {
          try {
            setUsage(await api<Usage>("POST", `/parent/children/${child.id}/bonus`, token, { day: localDay(), minutes: 15 }));
          } catch {
            /* offline: nothing to extend */
          }
        }} subtitle="Enter your PIN to add 15 more minutes today." />
      </Screen>
    );
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
