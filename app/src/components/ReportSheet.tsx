import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { colors } from "../lib/theme";
import { Button, H2, P } from "./ui";

const REASONS = [
  ["wrong_fact", "🤔 Something is wrong"],
  ["scary", "😟 It made me feel scared or upset"],
  ["inappropriate", "🚫 It's not OK for kids"],
  ["ai_gave_answer", "🦉 Hoot gave away the answer"],
  ["bug", "🐞 Something doesn't work"],
  ["other", "💬 Something else"],
] as const;

/** In-app reporting (required by app stores for AI content, and good practice everywhere). */
export function ReportSheet({ visible, onClose, childId, lessonId, messageId }: { visible: boolean; onClose: () => void; childId: string; lessonId?: string; messageId?: string }) {
  const { familyToken } = useSession();
  const [sent, setSent] = useState(false);

  async function send(reason: string) {
    try {
      await api("POST", "/reports", familyToken, { childId, lessonId, messageId, reason });
    } finally {
      setSent(true);
    }
  }

  const close = () => {
    setSent(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: "rgba(20,20,30,0.45)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.bg, padding: 20, gap: 10, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          {sent ? (
            <>
              <H2>Thank you! 💚</H2>
              <P>We've told your grown-up and our team. If you feel upset, talk to a grown-up you trust.</P>
              <Button title="OK" onPress={close} />
            </>
          ) : (
            <>
              <H2>What's the problem?</H2>
              {REASONS.map(([id, label]) => (
                <Pressable key={id} onPress={() => send(id)} accessibilityRole="button" style={{ padding: 14, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: colors.line }}>
                  <Text style={{ fontSize: 16, color: colors.ink }}>{label}</Text>
                </Pressable>
              ))}
              <Button title="Cancel" kind="ghost" onPress={close} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
