import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Banner, Button, Card, H1, P, Pill, Screen } from "../../../components/ui";
import { friendly, type ChatMessage } from "../../../lib/api";
import { useChild, useSession } from "../../../lib/session";
import { colors } from "../../../lib/theme";

const FLAG_TEXT: Record<string, string> = {
  personal_info: "Tried to share personal info (removed)",
  wellbeing: "May need a check-in. Please talk with your child",
  unsafe_reply: "Hoot's reply was blocked by the safety check",
  answer_leak: "Hoot's reply was blocked: it gave away an answer",
  refusal: "Hoot declined this request",
  error: "Hoot couldn't answer; a pre-written hint was shown",
};

export default function Chats() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const child = useChild(id);
  const { parentApi } = useSession();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    parentApi<{ messages: ChatMessage[] }>("GET", `/children/${id}/chats`).then((r) => setMessages(r.messages)).catch((e) => setError(friendly(e)));
  }, [id, parentApi]);

  // group by lesson
  const groups = new Map<string, ChatMessage[]>();
  for (const m of messages ?? []) groups.set(m.lessonTitle ?? "", [...(groups.get(m.lessonTitle ?? "") ?? []), m]);

  return (
    <Screen>
      <Button title="‹ Back" kind="ghost" onPress={() => router.back()} />
      <H1>{child?.nickname}'s chats with Hoot</H1>
      {error ? <Banner>{error}</Banner> : null}
      {messages && messages.length === 0 ? <P muted>No chats yet.</P> : null}
      {[...groups.entries()].map(([title, msgs]) => (
        <Card key={title}>
          <Text style={{ fontWeight: "800", fontSize: 16, color: colors.ink }}>📘 {title}</Text>
          {msgs.map((m) => (
            <View key={m.id} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", gap: 4 }}>
              <View style={{ backgroundColor: m.role === "user" ? colors.brandSoft : "#F4F1EA", padding: 10, borderRadius: 12 }}>
                <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "700" }}>{m.role === "user" ? child?.nickname : "Hoot 🦉"}</Text>
                <Text style={{ fontSize: 15, color: colors.ink, lineHeight: 21 }}>{m.content}</Text>
              </View>
              {m.flagged ? <Pill text={`⚠️ ${FLAG_TEXT[m.flagged] ?? m.flagged}`} color={colors.warn} bg={colors.warnSoft} /> : null}
              <Text style={{ fontSize: 11, color: colors.muted }}>{new Date(m.created_at).toLocaleString()}</Text>
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
