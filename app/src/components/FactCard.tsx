import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api, ApiError, type BandId } from "../lib/api";
import { forgetFacts, loadFacts, rememberFacts } from "../lib/facts";
import { pickOffline } from "../lib/fact-pool";
import { isOffline, isOfflineError } from "../lib/offline";
import { useSession } from "../lib/session";
import { colors, scaledBandTheme, surfaces } from "../lib/theme";
import { Button, Card, Emoji } from "./ui";
import { useExternalLink } from "./ExternalLink";

export interface Fact {
  id: string;
  subject: string;
  text: string;
  source: { title: string; url: string };
  /** Set when a parent must unlock the topic. Such a fact is shown online only and never kept on the device (lib/fact-pool.ts). */
  sensitive?: string | null;
}

/** Facts already shown in this session, per child, so "Another fact" does not repeat one. */
const shown = new Map<string, Set<string>>();
/** Facts fetched in a batch but not shown yet, per child: "Another fact" uses them before asking again. */
const queued = new Map<string, Fact[]>();
const BATCH = 5;

/**
 * A short, true, surprising fact. Shown after a quiz or lesson and once on the home screen.
 * "Another fact" gives one more on request; there is no endless feed. Facts come from the server in small batches; the ones a child
 * has been given are kept on the device (never the ones behind a parent's unlock), so with no internet the card still shows facts
 * seen before. If there are none (nothing saved yet, no facts for this age group) nothing is shown at all.
 */
export function FactCard({ childId, band }: { childId: string; band: BandId }) {
  const { familyToken } = useSession();
  const [fact, setFact] = useState<Fact | null>(null);
  const [busy, setBusy] = useState(false);
  // Under 13 a parent must enter their PIN before an outside website opens.
  const link = useExternalLink(band === "b1" || band === "b2" || band === "b3");
  const t = scaledBandTheme(band);

  const fetchFact = useCallback(async (): Promise<Fact | null> => {
    try {
      const seen = shown.get(childId) ?? new Set<string>();
      let next: Fact | null = queued.get(childId)?.shift() ?? null;
      // already known to be offline: a saved fact right away, without waiting for a request that will fail
      if (!next && isOffline()) next = pickOffline(await loadFacts(childId, band), seen);
      if (!next) {
        try {
          const recent = [...seen].slice(-40).join(",");
          const r = await api<{ facts: Fact[] }>("GET", `/children/${childId}/facts?count=${BATCH}${recent ? `&seen=${encodeURIComponent(recent)}` : ""}`, familyToken);
          void rememberFacts(childId, band, r.facts);
          next = r.facts[0] ?? null;
          queued.set(childId, r.facts.slice(1));
        } catch (e) {
          if (e instanceof ApiError && (e.status === 403 || e.status === 404)) void forgetFacts(childId);
          if (!isOfflineError(e)) return null;
          next = pickOffline(await loadFacts(childId, band), seen);
        }
      }
      if (next) shown.set(childId, new Set([...seen, next.id]));
      return next;
    } catch {
      return null;
    }
  }, [childId, band, familyToken]);

  useEffect(() => {
    let live = true;
    void fetchFact().then((f) => live && setFact(f));
    return () => {
      live = false;
    };
  }, [fetchFact]);

  async function another() {
    setBusy(true);
    const next = await fetchFact();
    if (next) setFact(next);
    setBusy(false);
  }

  if (!fact) return null;
  return (
    <Card enterDelay={0} style={{ backgroundColor: surfaces.fact, borderRadius: t.radius }}>
      <Text style={{ fontWeight: "800", color: colors.ink }}><Emoji size={16}>💡</Emoji> Did you know?</Text>
      <Text style={{ fontSize: t.font, lineHeight: t.font * 1.45, color: colors.ink }} accessibilityLiveRegion="polite">{fact.text}</Text>
      <Pressable
        onPress={() => link.open(fact.source.url)}
        accessibilityRole="link"
        accessibilityLabel={`Source: ${fact.source.title}`}
        accessibilityHint="Opens a website outside Honest Learn"
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: colors.muted, fontSize: 13 }}>Source: <Text style={{ textDecorationLine: "underline" }}>{fact.source.title}</Text></Text>
      </Pressable>
      <View style={{ alignItems: "flex-start" }}>
        <Button title="Another fact" kind="secondary" color={t.accent} loading={busy} onPress={() => void another()} />
      </View>
      {link.modal}
    </Card>
  );
}
