// Everything the route modules share: dependencies, sign-in checks, one-time codes, attempt limits
// and the hint ladder bookkeeping. Created once per app in createApp (app.ts).
import { randomInt } from "node:crypto";
import type { Context, Next } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { config } from "./config.ts";
import { now, type DB } from "./db.ts";
import type { ContentStore, Lesson } from "./content.ts";
import type { TutorProvider } from "./tutor.ts";
import type { WikiClient } from "./wiki.ts";
import type { Mailer } from "./mailer.ts";
import { hashSecret, readToken, verifySecret, type Scope } from "./security.ts";
import { childBand, type ChildRow, type ParentRow } from "./models.ts";

export type Env = { Variables: { parentId: string; scope: Scope; parent: ParentRow } };

export interface Deps {
  db: DB;
  content: ContentStore;
  tutor: TutorProvider;
  wiki: WikiClient;
  mailer: Mailer;
}

type Purpose = "verify_email" | "reset_password";
type Tries = {
  failed: "pin_failed" | "login_failed";
  lockedUntil: "pin_locked_until" | "login_locked_until";
  max: () => number;
  lockMinutes: () => number;
};

export function createContext(deps: Deps) {
  const { db, content, mailer } = deps;

  // ---------------------------------------------------------------- lookups
  const getParent = (id: string) => db.get<ParentRow>("SELECT * FROM parents WHERE id = ?", [id]);
  const getParentByEmail = (email: string) => db.get<ParentRow>("SELECT * FROM parents WHERE email = ?", [email]);
  const getChild = (id: string, parentId: string) =>
    db.get<ChildRow>("SELECT * FROM children WHERE id = ? AND parent_id = ?", [id, parentId]);
  const listChildren = (parentId: string) =>
    db.all<ChildRow>("SELECT * FROM children WHERE parent_id = ? ORDER BY created_at", [parentId]);

  // ---------------------------------------------------------------- sign-in checks
  /**
   * "family": any signed-in device (children use the app with it). "parent": the short-lived token from the PIN.
   * Tokens from before a password reset or "sign out everywhere" are rejected (session version).
   */
  const requireScope = (needed: Scope) => async (c: Context<Env>, next: Next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const claims = token ? await readToken(token) : null;
    if (!claims) return c.json({ error: "not_signed_in" }, 401);
    if (needed === "parent" && claims.scope !== "parent") return c.json({ error: "parent_pin_required" }, 403);
    const parent = await getParent(claims.sub);
    if (!parent || (claims.v ?? 0) !== (parent.token_version ?? 0)) return c.json({ error: "not_signed_in" }, 401);
    c.set("parentId", claims.sub);
    c.set("scope", claims.scope);
    c.set("parent", parent);
    await next();
  };

  const loadChild = async (c: Context<Env>): Promise<ChildRow | null> =>
    (await getChild(c.req.param("childId") ?? "", c.get("parentId"))) ?? null;

  // ---------------------------------------------------------------- what a child may see
  function visibleTo(child: ChildRow, l: Lesson): boolean {
    if (l.band !== childBand(child)) return false;
    if (l.status !== "reviewed" && !config.showDrafts) return false;
    if (l.sensitive && !(JSON.parse(child.unlocked_topics) as string[]).includes(l.sensitive)) return false;
    return true;
  }

  async function lessonFor(c: Context<Env>): Promise<{ child: ChildRow; lesson: Lesson } | Response> {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const lesson = content.lessons.get(c.req.param("lessonId") ?? "");
    if (!lesson) return c.json({ error: "lesson_not_found" }, 404);
    if (!visibleTo(child, lesson)) {
      return c.json({ error: lesson.sensitive ? "needs_parent_permission" : "lesson_not_available" }, 403);
    }
    return { child, lesson };
  }

  // ---------------------------------------------------------------- hint ladder
  // The server remembers the highest hint a child opened for each question. Hints must be opened in
  // order, and the answer is only revealed after all three — whatever the app claims.
  async function hintLevel(childId: string, itemId: string, q: number): Promise<number> {
    const row = await db.get<{ level: number }>("SELECT level FROM hints_seen WHERE child_id = ? AND item_id = ? AND q_index = ?", [
      childId,
      itemId,
      q,
    ]);
    return row?.level ?? -1;
  }
  /** Records an opened hint. False when it skips ahead of the ladder. */
  async function openHint(childId: string, itemId: string, q: number, level: number): Promise<boolean> {
    if (level > (await hintLevel(childId, itemId, q)) + 1) return false;
    await db.run(
      `INSERT INTO hints_seen (child_id, item_id, q_index, level) VALUES (?,?,?,?)
       ON CONFLICT (child_id, item_id, q_index) DO UPDATE
         SET level = CASE WHEN excluded.level > hints_seen.level THEN excluded.level ELSE hints_seen.level END`,
      [childId, itemId, q, level],
    );
    return true;
  }
  /** The explanation (and, after a wrong try, the answer) is shown only after success or every hint. */
  async function mayReveal(correct: boolean, hintsUsed: number, childId: string, itemId: string, q: number): Promise<boolean> {
    if (correct) return true;
    return hintsUsed >= 3 && (await hintLevel(childId, itemId, q)) >= 2;
  }

  // ---------------------------------------------------------------- attempt limits
  const isLocked = (until: string | null) => !!until && new Date(until) > new Date();
  const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

  // Each guess first takes a numbered try with one atomic UPDATE, so parallel requests (or several
  // servers) can't get more guesses than the limit. Reaching the limit locks for a while and resets the count.
  const PIN_TRIES: Tries = {
    failed: "pin_failed",
    lockedUntil: "pin_locked_until",
    max: () => config.security.pinMaxAttempts,
    lockMinutes: () => config.security.pinLockMinutes,
  };
  const LOGIN_TRIES: Tries = {
    failed: "login_failed",
    lockedUntil: "login_locked_until",
    max: () => config.security.loginMaxAttempts,
    lockMinutes: () => config.security.loginLockMinutes,
  };
  async function takeTry(t: Tries, parentId: string): Promise<number> {
    const row = await db.get<{ n: number }>(`UPDATE parents SET ${t.failed} = ${t.failed} + 1 WHERE id = ? RETURNING ${t.failed} AS n`, [
      parentId,
    ]);
    return row!.n;
  }
  /** After a wrong guess: locks once this was the last allowed try. Returns the lock end, or null. */
  async function wrongTry(t: Tries, parentId: string, tryNo: number): Promise<string | null> {
    if (tryNo < t.max()) return null;
    const lock = minutesFromNow(t.lockMinutes());
    await db.run(`UPDATE parents SET ${t.failed} = 0, ${t.lockedUntil} = ? WHERE id = ?`, [lock, parentId]);
    return lock;
  }

  // A real hash of a throwaway secret: checking a password for an unknown email costs the same time
  // as for a real account, so response times don't reveal who has an account.
  let dummyHash: string | null = null;
  const verifyAgainstNothing = (secret: string) => verifySecret(secret, (dummyHash ??= hashSecret("no-account-timing-balance")));

  /** Raises the session version (signs out every device) and returns the new version. */
  async function revokeSessions(parentId: string): Promise<number> {
    const row = await db.get<{ v: number }>("UPDATE parents SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ? RETURNING token_version AS v", [
      parentId,
    ]);
    return row!.v;
  }

  // ---------------------------------------------------------------- one-time email codes
  async function lastCodeSentAt(parentId: string, purpose: Purpose): Promise<number | null> {
    const row = await db.get<{ sent_at: string }>("SELECT sent_at FROM auth_codes WHERE parent_id = ? AND purpose = ?", [parentId, purpose]);
    return row ? Date.parse(row.sent_at) : null;
  }
  async function sendCode(p: { id: string; email: string }, purpose: Purpose) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.run(
      `INSERT INTO auth_codes (parent_id, purpose, code_hash, expires_at, attempts, sent_at) VALUES (?,?,?,?,0,?)
       ON CONFLICT (parent_id, purpose) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`,
      [p.id, purpose, hashSecret(code), minutesFromNow(config.security.codeMinutes), now()],
    );
    const subject = purpose === "verify_email" ? "Your Honest Learn verification code" : "Reset your Honest Learn password";
    const text =
      purpose === "verify_email"
        ? `Welcome to Honest Learn!\n\nYour verification code is: ${code}\n\nIt expires in ${config.security.codeMinutes} minutes.`
        : `Someone (hopefully you) asked to reset your Honest Learn password.\n\nYour reset code is: ${code}\n\nIt expires in ${config.security.codeMinutes} minutes. If you didn't ask for this, you can ignore this email.`;
    try {
      await mailer.send(p.email, subject, text);
    } catch (e) {
      console.error("mail failed", e);
    }
  }
  async function useCode(parentId: string, purpose: Purpose, code: string): Promise<"ok" | "invalid" | "expired"> {
    // Count the try before checking it, in one statement, so parallel requests can't get extra guesses.
    const row = await db.get<{ code_hash: string; expires_at: string; attempts: number }>(
      "UPDATE auth_codes SET attempts = attempts + 1 WHERE parent_id = ? AND purpose = ? RETURNING code_hash, expires_at, attempts",
      [parentId, purpose],
    );
    if (!row) return "invalid";
    if (new Date(row.expires_at) < new Date() || row.attempts > config.security.codeMaxAttempts) return "expired";
    if (!verifySecret(code, row.code_hash)) return "invalid";
    await db.run("DELETE FROM auth_codes WHERE parent_id = ? AND purpose = ?", [parentId, purpose]);
    return "ok";
  }

  // ---------------------------------------------------------------- client address (rate limits)
  function clientIp(c: Context): string {
    if (config.trustProxy) {
      const fwd = c.req.header("x-forwarded-for");
      if (fwd) return fwd.split(",")[0]!.trim();
    }
    try {
      return getConnInfo(c).remote.address ?? "unknown";
    } catch {
      return "unknown";
    }
  }

  return {
    ...deps,
    getParent,
    getParentByEmail,
    getChild,
    listChildren,
    requireScope,
    loadChild,
    visibleTo,
    lessonFor,
    hintLevel,
    openHint,
    mayReveal,
    isLocked,
    minutesFromNow,
    PIN_TRIES,
    LOGIN_TRIES,
    takeTry,
    wrongTry,
    verifyAgainstNothing,
    revokeSessions,
    lastCodeSentAt,
    sendCode,
    useCode,
    clientIp,
  };
}

export type Ctx = ReturnType<typeof createContext>;
