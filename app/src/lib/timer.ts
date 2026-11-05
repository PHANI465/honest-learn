import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { storage } from "./storage";

const key = (childId: string) => `hl.minutes.${childId}.${new Date().toISOString().slice(0, 10)}`;

/** Counts learning minutes per child per day (only while the app is open and active). */
export function useDailyMinutes(childId: string | undefined) {
  const [used, setUsed] = useState(0);
  const [bonus, setBonus] = useState(0);

  useEffect(() => {
    if (!childId) return;
    let active = AppState.currentState === "active" || AppState.currentState == null;
    storage.get(key(childId)).then((v) => setUsed(Number(v ?? 0)));
    const sub = AppState.addEventListener("change", (s) => (active = s === "active"));
    const t = setInterval(() => {
      if (!active) return;
      setUsed((u) => {
        const n = u + 1;
        storage.set(key(childId), String(n));
        return n;
      });
    }, 60_000);
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [childId]);

  return { used, bonus, addBonus: (m: number) => setBonus((b) => b + m) };
}
