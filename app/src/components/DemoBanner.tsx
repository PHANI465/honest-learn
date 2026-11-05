import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";
import { Banner } from "./ui";

/** Shown when the server runs without a real database (GET /health → demo: true). */
export function DemoBanner() {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(API_URL + "/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((h: { demo?: boolean } | null) => {
        if (live && h?.demo === true) setDemo(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!demo) return null;
  return <Banner>Demo mode: accounts and progress may reset</Banner>;
}
