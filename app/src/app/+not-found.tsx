import { router } from "expo-router";
import { Text, View } from "react-native";
import { Button, H1, P, Screen } from "../components/ui";

/** Shown for any address the app does not have. */
export default function NotFound() {
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 8, marginTop: 48 }}>
        <Text style={{ fontSize: 64 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">🦉</Text>
        <H1>We can't find that page</H1>
        <P muted center>The address may have a typo, or the page may have moved. Nothing is wrong with your account.</P>
      </View>
      <View style={{ gap: 10, marginTop: 16 }}>
        <Button big title="Go to the start" onPress={() => router.replace("/")} />
      </View>
    </Screen>
  );
}
