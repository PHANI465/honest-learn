import { router } from "expo-router";
import { Text, View } from "react-native";
import { Button, Card, H1, P, Screen } from "../components/ui";
import { colors } from "../lib/theme";

const PROMISES = [
  ["🧭", "Right for every age", "Lessons for ages 3–18, matched to what each age needs to know."],
  ["🦉", "Helps, never cheats", "Hoot the helper gives hints and asks questions. It never just hands over answers."],
  ["🔒", "Parents stay in control", "Your PIN protects settings, sensitive topics and chat history."],
  ["🚫", "No ads. No data selling.", "Free for everyone, funded by donations. No endless feeds."],
];

export default function Welcome() {
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 8, marginTop: 24 }}>
        <Text style={{ fontSize: 64 }}>🦉</Text>
        <H1 size={34}>Honest Learn</H1>
        <P muted center size={17}>Free knowledge for every age, safe for kids and worth adults' time.</P>
      </View>
      <View style={{ gap: 10 }}>
        {PROMISES.map(([icon, title, body]) => (
          <Card key={title} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Text style={{ fontSize: 30 }}>{icon}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: "700", fontSize: 16, color: colors.ink }}>{title}</Text>
              <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{body}</Text>
            </View>
          </Card>
        ))}
      </View>
      <View style={{ gap: 10, marginTop: 8 }}>
        <Button big title="I'm a parent — create an account" onPress={() => router.push("/signup")} />
        <Button title="I already have an account" kind="secondary" onPress={() => router.push("/login")} />
      </View>
      <P muted center size={13}>A parent or guardian (18+) creates the account. Children use profiles inside it.</P>
    </Screen>
  );
}
