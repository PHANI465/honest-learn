import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { api } from "./api";

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

/**
 * Learning minutes are counted on the server (one tick per active minute), so the parent's daily
 * limit applies across every device. Offline, the app keeps working and simply doesn't count.
 */
export function useDailyUsage(childId: string | undefined, familyToken: string | null) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!childId || !familyToken) return;
    api<Usage>("GET", `/children/${childId}/usage?day=${localDay()}`, familyToken)
      .then(setUsage)
      .catch(() => {
        /* offline */
      });
    let active = AppState.currentState === "active" || AppState.currentState == null;
    const sub = AppState.addEventListener("change", (s) => (active = s === "active"));
    const t = setInterval(async () => {
      if (!active) return;
      try {
        setUsage(await api<Usage>("POST", `/children/${childId}/usage/tick`, familyToken, { day: localDay() }));
      } catch {
        /* offline */
      }
    }, 60_000);
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [childId, familyToken]);

  return { usage, setUsage };
}
