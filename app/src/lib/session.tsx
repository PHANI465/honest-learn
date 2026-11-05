import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, type Child, type ContentMap } from "./api";
import { storage } from "./storage";

const FAMILY_KEY = "hl.familyToken";

interface Session {
  ready: boolean;
  familyToken: string | null;
  /** Short-lived token after the parent enters their PIN. Kept in memory only. */
  parentToken: string | null;
  parentEmail: string | null;
  children: Child[];
  map: ContentMap | null;
  signup(input: { email: string; password: string; pin: string }): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  unlockParent(pin: string): Promise<void>;
  lockParent(): void;
  refreshFamily(): Promise<void>;
  /** Calls the API with the parent token; if it expired, clears it so the PIN screen shows again. */
  parentApi<T>(method: string, path: string, body?: unknown): Promise<T>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children: kids }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [familyToken, setFamilyToken] = useState<string | null>(null);
  const [parentToken, setParentToken] = useState<string | null>(null);
  const [parentEmail, setParentEmail] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [map, setMap] = useState<ContentMap | null>(null);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFamily = useCallback(async (token: string) => {
    const fam = await api<{ parent: { email: string }; children: Child[] }>("GET", "/family", token);
    setParentEmail(fam.parent.email);
    setChildren(fam.children);
  }, []);

  useEffect(() => {
    (async () => {
      api<ContentMap>("GET", "/content/map").then(setMap).catch(() => {});
      const saved = await storage.get(FAMILY_KEY);
      if (saved) {
        try {
          await loadFamily(saved);
          setFamilyToken(saved);
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) await storage.remove(FAMILY_KEY);
          else setFamilyToken(saved); // offline: keep the session
        }
      }
      setReady(true);
    })();
  }, [loadFamily]);

  const adopt = useCallback(
    async (token: string) => {
      await storage.set(FAMILY_KEY, token);
      setFamilyToken(token);
      await loadFamily(token);
    },
    [loadFamily],
  );

  const lockParent = useCallback(() => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    setParentToken(null);
  }, []);

  const value = useMemo<Session>(
    () => ({
      ready,
      familyToken,
      parentToken,
      parentEmail,
      children,
      map,
      async signup({ email, password, pin }) {
        const r = await api<{ familyToken: string }>("POST", "/auth/signup", null, {
          email,
          password,
          pin,
          confirmAdult: true,
          consentVersion: map?.consentVersion,
        });
        await adopt(r.familyToken);
        // A new parent goes straight into the parent area to add a child, so unlock it now.
        const p = await api<{ parentToken: string; expiresInSec: number }>("POST", "/auth/parent-unlock", r.familyToken, { pin });
        setParentToken(p.parentToken);
      },
      async login(email, password) {
        const r = await api<{ familyToken: string }>("POST", "/auth/login", null, { email, password });
        await adopt(r.familyToken);
      },
      async logout() {
        await storage.remove(FAMILY_KEY);
        lockParent();
        setFamilyToken(null);
        setChildren([]);
        setParentEmail(null);
      },
      async unlockParent(pin) {
        const r = await api<{ parentToken: string; expiresInSec: number }>("POST", "/auth/parent-unlock", familyToken, { pin });
        setParentToken(r.parentToken);
        if (lockTimer.current) clearTimeout(lockTimer.current);
        lockTimer.current = setTimeout(() => setParentToken(null), (r.expiresInSec - 5) * 1000);
      },
      lockParent,
      async refreshFamily() {
        if (familyToken) await loadFamily(familyToken);
      },
      async parentApi<T>(method: string, path: string, body?: unknown) {
        try {
          return await api<T>(method, "/parent" + path, parentToken, body);
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setParentToken(null);
          throw e;
        }
      },
    }),
    [ready, familyToken, parentToken, parentEmail, children, map, adopt, lockParent, loadFamily],
  );

  return <Ctx.Provider value={value}>{kids}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

export function useChild(childId: string | undefined): Child | undefined {
  return useSession().children.find((c) => c.id === childId);
}
