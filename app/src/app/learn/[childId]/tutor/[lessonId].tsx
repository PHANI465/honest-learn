import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ReportSheet } from "../../../../components/ReportSheet";
import { Banner, Button } from "../../../../components/ui";
import { api, friendly, type ChatMessage } from "../../../../lib/api";
import { useChild, useSession } from "../../../../lib/session";
import { bandTheme, colors } from "../../../../lib/theme";

export default function Tutor() {
  const { childId, lessonId, question } = useLocalSearchParams<{ childId: string; lessonId: string; question?: string }>();
  const { familyToken } = useSession();
  const child = useChild(childId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const path = `/children/${childId}/tutor/${lessonId}`;
  const qIndex = question !== undefined ? Number(question) : null;

  useEffect(() => {
    api<{ messages: ChatMessage[] }>("GET", path, familyToken).then((r) => setMessages(r.messages)).catch((e) => setError(friendly(e)));
  }, [path, familyToken]);

  if (!child) return null;
  const t = bandTheme[child.band];

  async function send() {
    const msg = text.trim();
    if (!msg || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", content: msg, flagged: null, created_at: new Date().toISOString() }]);
    try {
      const r = await api<{ reply: string; messageId: string; yourMessage: string }>("POST", path, familyToken, { message: msg, question: qIndex });
      // Show what was actually saved (personal info is replaced on the server).
      setMessages((m) => [
        ...m.map((x) => (x.id === tempId ? { ...x, content: r.yourMessage } : x)),
        { id: r.messageId, role: "assistant", content: r.reply, flagged: null, created_at: new Date().toISOString() },
      ]);
    } catch (e) {
      setError(friendly(e));
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setText(msg);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  const starters = qIndex !== null ? ["I don't understand the question", "Can you give me a clue?", "Is my thinking right?"] : ["Can you explain this simply?", "Give me an example", "Quiz me!"];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderColor: colors.line, maxWidth: 720, width: "100%", alignSelf: "center" }}>
          <Button title="‹" kind="ghost" color={t.accent} onPress={() => router.back()} />
          <Text style={{ fontSize: 30 }}>🦉</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "800", fontSize: 18, color: colors.ink }}>Hoot</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>A computer helper. It can make mistakes, and your grown-up can read this chat.</Text>
          </View>
        </View>

        <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 720, width: "100%", alignSelf: "center" }} onContentSizeChange={() => scroll.current?.scrollToEnd()}>
          {messages.length === 0 ? (
            <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line }}>
              <Text style={{ fontSize: t.font - 1, color: colors.ink, lineHeight: (t.font - 1) * 1.4 }}>
                Hi {child.nickname}! I'm Hoot. I won't tell you the answer, but I'll help you figure it out. What are you thinking? 🦉
              </Text>
            </View>
          ) : null}
          {messages.map((m) => (
            <View key={m.id} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", gap: 2 }}>
              <View style={{ backgroundColor: m.role === "user" ? t.accent : "#fff", padding: 12, borderRadius: 16, borderWidth: m.role === "user" ? 0 : 1, borderColor: colors.line }}>
                <Text style={{ color: m.role === "user" ? "#fff" : colors.ink, fontSize: t.font - 1, lineHeight: (t.font - 1) * 1.4 }}>{m.content}</Text>
              </View>
              {m.role === "assistant" ? (
                <Pressable onPress={() => setReportId(m.id)} accessibilityRole="button" accessibilityLabel="Report this reply">
                  <Text style={{ fontSize: 12, color: colors.muted, paddingHorizontal: 6 }}>⚑ Report</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {busy ? <Text style={{ color: colors.muted }}>Hoot is thinking… 🤔</Text> : null}
          {error ? <Banner>{error}</Banner> : null}
        </ScrollView>

        <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderColor: colors.line, maxWidth: 720, width: "100%", alignSelf: "center" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {starters.map((s) => (
              <Pressable key={s} onPress={() => setText(s)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: t.soft }}>
                <Text style={{ color: t.accent, fontWeight: "600" }}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Type your question…"
              placeholderTextColor="#9AA0AA"
              multiline
              maxLength={500}
              accessibilityLabel="Message to Hoot"
              style={{ flex: 1, borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, padding: 12, fontSize: 16, backgroundColor: "#fff", maxHeight: 120, color: colors.ink }}
              onSubmitEditing={send}
            />
            <Button title="Send" color={t.accent} onPress={send} disabled={!text.trim()} loading={busy} />
          </View>
        </View>
      </KeyboardAvoidingView>
      <ReportSheet visible={!!reportId} onClose={() => setReportId(null)} childId={child.id} lessonId={lessonId} messageId={reportId ?? undefined} />
    </SafeAreaView>
  );
}
