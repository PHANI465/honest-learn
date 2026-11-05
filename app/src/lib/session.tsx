import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, type Child, type ContentMap } from "./api";
import { clearOfflineData, loadSavedFamily, loadSavedMap, saveFamily, saveMap, startOfflineSync } from "./offline";
import { storage } from "./storage";

const FAMILY_KEY = "hl.familyToken";

interface Session {
  ready: boolean;
  familyToken: string | null;
  /** Short-lived token after the parent enters their PIN. Kept in memory only. */
  parentToken: string | null;
  parentEmail: string | null;
  emailVerified: boolean;
  /** Optional ISO country code, used only for helpline info. */
  country: string | null;
  children: Child[];
  map: ContentMap | null;
  signup(input: { email: string; password: string; pin: string; country: string | null }): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Sign in with a token from a password reset. */
  signInWithToken(token: string): Promise<void>;
  verifyEmail(code: string): Promise<void>;
  resendVerification(): Promise<void>;
  /** Returns the short-lived parent token (also kept in state). */
  unlockParent(pin: string): Promise<string>;
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
  const [emailVerified, setEmailVerified] = useState(true);
  const [country, setCountry] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [map, setMap] = useState<ContentMap | null>(null);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFamily = useCallback(async (token: string) => {
    const fam = await api<{ parent: { email: string; emailVerified: boolean; country?: string | null }; children: Child[] }>("GET", "/family", token);
    setCountry(fam.parent.country ?? null);
    setParentEmail(fam.parent.email);
    setEmailVerified(fam.parent.emailVerified);
    setChildren(fam.children);
    void saveFamily(fam.children); // so profiles still open offline
  }, []);

  useEffect(() => {
    (async () => {
      api<ContentMap>("GET", "/content/map")
        .then((m) => {
          setMap(m);
          void saveMap(m);
        })
        .catch(async () => {
          const m = await loadSavedMap();
          if (m) setMap((current) => current ?? m);
        });
      const saved = await storage.get(FAMILY_KEY);
      if (saved) {
        try {
          await loadFamily(saved);
          setFamilyToken(saved);
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) await storage.remove(FAMILY_KEY);
          else {
            // offline: keep the session and use the saved profile list
            setChildren((await loadSavedFamily()) ?? []);
            setFamilyToken(saved);
          }
        }
      }
      setReady(true);
    })();
  }, [loadFamily]);

  // Send lessons finished offline (and learning minutes) when the connection comes back.
  useEffect(() => (familyToken ? startOfflineSync(familyToken) : undefined), [familyToken]);

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
      emailVerified,
      country,
      children,
      map,
      async signup({ email, password, pin, country: chosen }) {
        const r = await api<{ familyToken: string }>("POST", "/auth/signup", null, {
          email,
          password,
          pin,
          confirmAdult: true,
          consentVersion: map?.consentVersion,
          ...(chosen ? { country: chosen } : {}),
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
        await clearOfflineData(); // saved lessons and profiles leave the device with the account
        await storage.remove(FAMILY_KEY);
        lockParent();
        setFamilyToken(null);
        setChildren([]);
        setParentEmail(null);
      },
      async signInWithToken(token) {
        await adopt(token);
      },
      async verifyEmail(code) {
        await api("POST", "/auth/verify-email", familyToken, { code });
        setEmailVerified(true);
      },
      async resendVerification() {
        await api("POST", "/auth/resend-verification", familyToken, {});
      },
      async unlockParent(pin) {
        const r = await api<{ parentToken: string; expiresInSec: number }>("POST", "/auth/parent-unlock", familyToken, { pin });
        setParentToken(r.parentToken);
        if (lockTimer.current) clearTimeout(lockTimer.current);
        lockTimer.current = setTimeout(() => setParentToken(null), (r.expiresInSec - 5) * 1000);
        return r.parentToken;
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
    [ready, familyToken, parentToken, parentEmail, emailVerified, country, children, map, adopt, lockParent, loadFamily],
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
