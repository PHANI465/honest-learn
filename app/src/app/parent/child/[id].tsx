import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { Banner, Button, Card, Emoji, Field, H1, H2, P, Pill, Screen, Toggle } from "../../../components/ui";
import { friendly, type BandId, type Child, type OutcomeItem, type OutcomesResponse, type OutcomeStatus, type Topic } from "../../../lib/api";
import { useChild, useSession } from "../../../lib/session";
import { colors, subjectEmoji, surfaces, topicLabels } from "../../../lib/theme";

const MINUTES = [15, 30, 45, 60, 90];

export default function ChildSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const child = useChild(id);
  const { map } = useSession();
  if (!child || !map) return <Screen><P>Loading…</P></Screen>;
  // keyed so the form resets if a different child is opened
  return <SettingsForm key={child.id} child={child} />;
}

function SettingsForm({ child }: { child: Child }) {
  const { parentApi, refreshFamily, map } = useSession();
  const [draft, setDraft] = useState<Child>(child);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!map) return null;

  const set = (patch: Partial<Child>) => {
    setDraft({ ...draft, ...patch });
    setSaved(false);
  };
  const toggleTopic = (t: Topic) =>
    set({ unlockedTopics: draft.unlockedTopics.includes(t) ? draft.unlockedTopics.filter((x) => x !== t) : [...draft.unlockedTopics, t] });

  async function save() {
    setError(null);
    try {
      await parentApi("PATCH", `/children/${draft.id}`, {
        nickname: draft.nickname,
        bandOverride: draft.bandOverride,
        unlockedTopics: draft.unlockedTopics,
        aiEnabled: draft.aiEnabled,
        dailyMinutes: draft.dailyMinutes,
      });
      await refreshFamily();
      setSaved(true);
    } catch (e) {
      setError(friendly(e));
    }
  }

  async function remove() {
    const msg = `Delete ${draft.nickname}'s profile, progress and chats? This cannot be undone.`;
    const ok = Platform.OS === "web" ? globalThis.confirm?.(msg) : await new Promise<boolean>((r) => Alert.alert("Delete profile?", msg, [{ text: "Cancel", onPress: () => r(false) }, { text: "Delete", style: "destructive", onPress: () => r(true) }]));
    if (!ok) return;
    await parentApi("DELETE", `/children/${draft.id}`);
    await refreshFamily();
    router.replace("/parent");
  }

  const ageBand = map.bands.find((b) => draft.age >= b.ages[0] && draft.age <= b.ages[1]);

  return (
    <Screen>
      <Button title="‹ Parent area" kind="ghost" onPress={() => router.replace("/parent")} label="Back to the parent area" />
      <H1>{draft.nickname}'s settings</H1>
      {error ? <Banner>{error}</Banner> : null}
      {saved ? <Banner tone="good">Saved ✓</Banner> : null}

      <Card>
        <Field label="Nickname" value={draft.nickname} onChangeText={(t) => set({ nickname: t })} maxLength={30} />
      </Card>

      <KnowledgeSection childId={draft.id} nickname={draft.nickname} />

      <H2>Learning level</H2>
      <Card>
        <P muted size={14}>By age ({draft.age}) {draft.nickname} is in {ageBand?.name}. If they're ahead or need more practice, choose a different level.</P>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[{ id: null, name: "Match age" }, ...map.bands].map((b) => {
            const selected = draft.bandOverride === b.id;
            return (
              <Pressable key={String(b.id)} onPress={() => set({ bandOverride: b.id as BandId | null })} accessibilityRole="radio" accessibilityState={{ selected, checked: selected }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: "center", borderRadius: 999, borderWidth: 2, borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brandSoft : colors.card }}>
                <Text style={{ fontWeight: "600", color: colors.ink }}>{b.name}{"ages" in b ? ` (${b.ages.join("–")})` : ""}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <H2>Sensitive topics</H2>
      <Card>
        <P muted size={14}>These lessons stay hidden until you switch them on. They are written to be factual, age-appropriate and respectful of all families.</P>
        {(Object.keys(map.sensitiveTopics) as Topic[]).map((t) => (
          <Toggle key={t} label={`${topicLabels[t]?.emoji} ${topicLabels[t]?.label ?? t}`} description={map.sensitiveTopics[t]} value={draft.unlockedTopics.includes(t)} onChange={() => toggleTopic(t)} />
        ))}
      </Card>

      <H2>Hoot, the AI helper</H2>
      <Card>
        {draft.aiAllowedForAge ? (
          <>
            <Toggle label="Allow Hoot" value={draft.aiEnabled} onChange={(v) => set({ aiEnabled: v })}
              description="Hoot gives hints and asks questions. It never gives quiz answers. Every reply is checked for safety before your child sees it, and you can read every chat." />
            <Button title="Read chats" kind="secondary" onPress={() => router.push(`/parent/chats/${draft.id}`)} />
          </>
        ) : (
          <P muted size={14}>Hoot isn't available for ages 3–5. Little Explorers learn with read-aloud lessons and a grown-up beside them.</P>
        )}
      </Card>

      <H2>Daily time</H2>
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {MINUTES.map((m) => (
            <Pressable key={m} onPress={() => set({ dailyMinutes: m })} accessibilityRole="radio" accessibilityLabel={`${m} minutes a day`} accessibilityState={{ selected: draft.dailyMinutes === m, checked: draft.dailyMinutes === m }}
              style={{ paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, minWidth: 44, justifyContent: "center", borderRadius: 999, borderWidth: 2, borderColor: draft.dailyMinutes === m ? colors.brand : colors.line, backgroundColor: draft.dailyMinutes === m ? colors.brandSoft : colors.card }}>
              <Text style={{ fontWeight: "600", color: colors.ink }}>{m} min</Text>
            </Pressable>
          ))}
        </View>
        <P muted size={13}>When time is up, the app shows a "time for a break" screen. You can add time with your PIN.</P>
      </Card>

      <Button big title="Save changes" onPress={save} />
      <Button title="Delete this profile" kind="danger" onPress={remove} />
    </Screen>
  );
}

const STATUS_LABEL: Record<OutcomeStatus, string> = { strong: "Strong", practising: "Practising", not_started: "Not started yet" };
const STATUS_TONE: Record<OutcomeStatus, { color: string; bg: string }> = {
  strong: { color: colors.good, bg: colors.goodSoft },
  practising: { color: colors.warn, bg: colors.warnSoft },
  not_started: { color: colors.muted, bg: surfaces.pill },
};

/** "What they know": per subject, how many goals are strong, being practised or not started; tap a subject to see them. */
function KnowledgeSection({ childId, nickname }: { childId: string; nickname: string }) {
  const { parentApi } = useSession();
  const [data, setData] = useState<OutcomesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    parentApi<OutcomesResponse>("GET", `/children/${childId}/outcomes`)
      .then((r) => live && setData(r))
      .catch((e) => live && setError(friendly(e)));
    return () => {
      live = false;
    };
  }, [parentApi, childId]);

  return (
    <>
      <H2>What {nickname} knows</H2>
      <Card>
        <P muted size={14}>
          The goals for {nickname}'s level, based on finished lessons. Strong means a lesson was finished with every question right first time. There is no score or ranking.
        </P>
        {error ? <Banner>{error}</Banner> : null}
        {!data && !error ? <P muted size={14}>Loading…</P> : null}
        {data?.subjects.map((s) => {
          const expanded = open === s.id;
          const total = s.strong + s.practising + s.notStarted;
          return (
            <View key={s.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 4 }}>
              <Pressable
                onPress={() => setOpen(expanded ? null : s.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${s.name}: ${s.strong} strong, ${s.practising} practising, ${s.notStarted} not started yet, out of ${total} goals`}
                accessibilityHint={expanded ? "Hides the goals" : "Shows the goals"}
                style={{ minHeight: 48, paddingVertical: 8, gap: 6 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Emoji size={20}>{subjectEmoji[s.id] ?? "📘"}</Emoji>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: colors.ink }}>{s.name}</Text>
                  <Text style={{ fontSize: 18, color: colors.muted }} aria-hidden accessibilityElementsHidden importantForAccessibility="no">{expanded ? "▾" : "▸"}</Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Pill text={`${s.strong} strong`} color={STATUS_TONE.strong.color} bg={STATUS_TONE.strong.bg} />
                  <Pill text={`${s.practising} practising`} color={STATUS_TONE.practising.color} bg={STATUS_TONE.practising.bg} />
                  <Pill text={`${s.notStarted} not started`} color={STATUS_TONE.not_started.color} bg={STATUS_TONE.not_started.bg} />
                </View>
              </Pressable>
              {expanded ? <OutcomeList items={data.outcomes.filter((o) => o.subject === s.id)} /> : null}
            </View>
          );
        })}
      </Card>
    </>
  );
}

function OutcomeList({ items }: { items: OutcomeItem[] }) {
  return (
    <View style={{ gap: 8, paddingBottom: 8 }}>
      {items.map((o) => (
        <View key={o.id} accessible accessibilityLabel={`${o.text}. ${STATUS_LABEL[o.status]}`} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
          <View style={{ marginTop: 2 }}>
            <Pill text={STATUS_LABEL[o.status]} color={STATUS_TONE[o.status].color} bg={STATUS_TONE[o.status].bg} />
          </View>
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: colors.ink }}>{o.text}</Text>
        </View>
      ))}
    </View>
  );
}
