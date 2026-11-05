import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { PinModal } from "../../../components/PinPad";
import { Button, H1, P, Screen } from "../../../components/ui";
import { useChild, useSession } from "../../../lib/session";
import { useDailyMinutes } from "../../../lib/timer";
import { colors } from "../../../lib/theme";

/** Wraps every learning screen: checks the profile and enforces the parent's daily time limit. */
export default function LearnLayout() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { ready, familyToken } = useSession();
  const child = useChild(childId);
  const { used, bonus, addBonus } = useDailyMinutes(childId);
  const [pin, setPin] = useState(false);

  if (ready && !familyToken) return <Redirect href="/welcome" />;
  if (ready && !child) return <Redirect href="/profiles" />;
  if (!child) return null;

  if (used >= child.dailyMinutes + bonus) {
    return (
      <Screen>
        <View style={{ alignItems: "center", gap: 12, marginTop: 40 }}>
          <Text style={{ fontSize: 72 }}>🌳</Text>
          <H1>Time for a break, {child.nickname}!</H1>
          <P center muted size={18}>You learned for {used} minutes today. Great job! Go play, move, or read a book. See you tomorrow. 💚</P>
        </View>
        <View style={{ gap: 10, marginTop: "auto" }}>
          <Button title="Back to profiles" onPress={() => router.replace("/profiles")} />
          <Button title="Grown-up: add 15 minutes" kind="ghost" color={colors.muted} onPress={() => setPin(true)} />
        </View>
        <PinModal visible={pin} onClose={() => setPin(false)} onSuccess={() => addBonus(15)} subtitle="Enter your PIN to add 15 more minutes today." />
      </Screen>
    );
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
