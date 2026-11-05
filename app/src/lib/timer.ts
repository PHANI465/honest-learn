import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { cachedGet, onUsage, recordLearningMinute, unsentMinutes } from "./offline";

export interface Usage {
  day: string;
  minutes: number;
  bonus: number;
  limit: number;
  remaining: number;
}

/** The child's local date, e.g. "2026-11-05". */
export function localDay(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Add minutes learned on this device that the server hasn't counted yet (e.g. while offline). */
function withUnsent(childId: string, u: Usage): Usage {
  const extra = unsentMinutes(childId, u.day);
  return extra ? { ...u, minutes: u.minutes + extra, remaining: Math.max(0, u.remaining - extra) } : u;
}

/**
 * Learning minutes are counted on the server (one tick per active minute), so the parent's daily
 * limit applies across every device. Offline, minutes are saved and sent when the app is back online,
 * and the limit keeps working from the last known count.
 */
export function useDailyUsage(childId: string | undefined, familyToken: string | null) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!childId || !familyToken) return;
    cachedGet<Usage>(childId, `/children/${childId}/usage?day=${localDay()}`, familyToken)
      .then((r) => setUsage(withUnsent(childId, r.data)))
      .catch(() => {
        /* offline and nothing saved yet */
      });
    const stopListening = onUsage((id, u) => {
      if (id === childId && u.day === localDay()) setUsage(withUnsent(childId, u));
    });
    let active = AppState.currentState === "active" || AppState.currentState == null;
    const sub = AppState.addEventListener("change", (s) => (active = s === "active"));
    const t = setInterval(async () => {
      if (!active) return;
      const day = localDay();
      // Count it here straight away; the server's number replaces this when the minute is delivered.
      setUsage((u) => (u && u.day === day ? { ...u, minutes: u.minutes + 1, remaining: Math.max(0, u.remaining - 1) } : u));
      await recordLearningMinute(childId, day);
    }, 60_000);
    return () => {
      clearInterval(t);
      sub.remove();
      stopListening();
    };
  }, [childId, familyToken]);

  return { usage, setUsage };
}
