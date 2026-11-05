// Accounts: sign up, sign in, email codes, password and PIN resets, and the parent PIN unlock.
// Mounted at /auth. Every route here is rate limited per IP address on top of the per-account limits.
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { now } from "../db.ts";
import { hashSecret, issueToken, newId, verifySecret } from "../security.ts";
import { Code, CONSENT_VERSION, Country, Email, Password, Pin, Secret } from "../models.ts";
import type { Ctx, Env } from "../context.ts";

/** One email of each kind per account per minute (stops inbox flooding). */
const CODE_COOLDOWN_MS = 60_000;

export function authRoutes(ctx: Ctx) {
  const { db, getParent, getParentByEmail, requireScope, isLocked, takeTry, wrongTry, PIN_TRIES, LOGIN_TRIES } = ctx;
  const r = new Hono<Env>();

  // ---- per-IP rate limit (in memory: per server instance; the per-account limits below are in the database)
  const hits = new Map<string, { count: number; resetAt: number }>();
  r.use("*", async (c, next) => {
    const ip = ctx.clientIp(c);
    const t = Date.now();
    const h = hits.get(ip);
    if (!h || h.resetAt < t) hits.set(ip, { count: 1, resetAt: t + config.security.authRateWindowMinutes * 60_000 });
    else if (++h.count > config.security.authRateLimit) {
      c.header("retry-after", String(Math.ceil((h.resetAt - t) / 1000)));
      return c.json({ error: "too_many_attempts" }, 429);
    }
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt < t) hits.delete(k);
    await next();
  });

  r.post("/signup", async (c) => {
    const body = z
      .object({
        email: Email,
        password: Password,
        pin: Pin,
        confirmAdult: z.literal(true, { message: "You must confirm you are a parent or guardian aged 18+" }),
        consentVersion: z.literal(CONSENT_VERSION, { message: "Please accept the current privacy notice" }),
        country: Country.optional(),
      })
      .parse(await c.req.json());
    if (await getParentByEmail(body.email)) return c.json({ error: "email_taken" }, 409);
    const id = newId();
    await db.run(
      "INSERT INTO parents (id, email, password_hash, pin_hash, consent_version, consent_at, created_at, country) VALUES (?,?,?,?,?,?,?,?)",
      [id, body.email, hashSecret(body.password), hashSecret(body.pin), body.consentVersion, now(), now(), body.country ?? null],
    );
    await ctx.sendCode({ id, email: body.email }, "verify_email");
    return c.json({ familyToken: await issueToken(id, "family") }, 201);
  });

  r.post("/verify-email", requireScope("family"), async (c) => {
    const { code } = z.object({ code: Code }).parse(await c.req.json());
    const result = await ctx.useCode(c.get("parentId"), "verify_email", code);
    if (result !== "ok") return c.json({ error: result === "expired" ? "code_expired" : "wrong_code" }, 400);
    await db.run("UPDATE parents SET email_verified_at = ? WHERE id = ?", [now(), c.get("parentId")]);
    return c.json({ ok: true });
  });

  r.post("/resend-verification", requireScope("family"), async (c) => {
    const p = c.get("parent");
    if (p.email_verified_at) return c.json({ ok: true, alreadyVerified: true });
    const last = await ctx.lastCodeSentAt(p.id, "verify_email");
    if (last && Date.now() - last < CODE_COOLDOWN_MS) return c.json({ error: "wait_a_minute" }, 429);
    await ctx.sendCode(p, "verify_email");
    return c.json({ ok: true });
  });

  /** Always answers the same way, so it can't be used to discover which emails have accounts. */
  r.post("/forgot-password", async (c) => {
    const { email } = z.object({ email: Email }).parse(await c.req.json());
    const p = await getParentByEmail(email);
    if (p) {
      const last = await ctx.lastCodeSentAt(p.id, "reset_password");
      if (!last || Date.now() - last >= CODE_COOLDOWN_MS) await ctx.sendCode(p, "reset_password");
    }
    return c.json({ ok: true });
  });

  /** A new password signs out every other device (someone else may have had the old one). */
  r.post("/reset-password", async (c) => {
    const body = z.object({ email: Email, code: Code, newPassword: Password }).parse(await c.req.json());
    const p = await getParentByEmail(body.email);
    const result = p ? await ctx.useCode(p.id, "reset_password", body.code) : "invalid";
    if (!p || result !== "ok") return c.json({ error: result === "expired" ? "code_expired" : "wrong_code" }, 400);
    // A reset code proves access to the inbox, so it also verifies the email.
    await db.run(
      "UPDATE parents SET password_hash = ?, login_failed = 0, login_locked_until = NULL, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?",
      [hashSecret(body.newPassword), now(), p.id],
    );
    const version = await ctx.revokeSessions(p.id);
    return c.json({ familyToken: await issueToken(p.id, "family", version) });
  });

  /** Forgot the PIN: the account password can set a new one. */
  r.post("/reset-pin", requireScope("family"), async (c) => {
    const body = z.object({ password: Secret, newPin: Pin }).parse(await c.req.json());
    const p = c.get("parent");
    if (isLocked(p.login_locked_until)) return c.json({ error: "too_many_attempts" }, 429);
    const tryNo = await takeTry(LOGIN_TRIES, p.id);
    if (tryNo > LOGIN_TRIES.max()) {
      await wrongTry(LOGIN_TRIES, p.id, tryNo);
      return c.json({ error: "too_many_attempts" }, 429);
    }
    if (!verifySecret(body.password, p.password_hash)) {
      await wrongTry(LOGIN_TRIES, p.id, tryNo);
      return c.json({ error: "wrong_email_or_password" }, 401);
    }
    await db.run("UPDATE parents SET pin_hash = ?, pin_failed = 0, pin_locked_until = NULL, login_failed = 0 WHERE id = ?", [
      hashSecret(body.newPin),
      p.id,
    ]);
    return c.json({ ok: true });
  });

  r.post("/login", async (c) => {
    const body = z.object({ email: Email, password: Secret }).parse(await c.req.json());
    const p = await getParentByEmail(body.email);
    if (!p) {
      ctx.verifyAgainstNothing(body.password); // same work as a real check: timing doesn't reveal accounts
      return c.json({ error: "wrong_email_or_password" }, 401);
    }
    if (isLocked(p.login_locked_until)) return c.json({ error: "too_many_attempts", retryAt: p.login_locked_until }, 429);
    const tryNo = await takeTry(LOGIN_TRIES, p.id);
    if (tryNo > LOGIN_TRIES.max()) {
      const lock = await wrongTry(LOGIN_TRIES, p.id, tryNo);
      return c.json({ error: "too_many_attempts", retryAt: lock }, 429);
    }
    if (!verifySecret(body.password, p.password_hash)) {
      await wrongTry(LOGIN_TRIES, p.id, tryNo);
      return c.json({ error: "wrong_email_or_password" }, 401);
    }
    await db.run("UPDATE parents SET login_failed = 0, login_locked_until = NULL WHERE id = ?", [p.id]);
    return c.json({ familyToken: await issueToken(p.id, "family", p.token_version ?? 0) });
  });

  /** Parent enters their PIN to get a short-lived parent token. */
  r.post("/parent-unlock", requireScope("family"), async (c) => {
    const { pin } = z.object({ pin: Secret }).parse(await c.req.json());
    const p = c.get("parent");
    if (isLocked(p.pin_locked_until)) return c.json({ error: "too_many_attempts", retryAt: p.pin_locked_until }, 429);
    const tryNo = await takeTry(PIN_TRIES, p.id);
    if (tryNo > PIN_TRIES.max()) {
      const lock = await wrongTry(PIN_TRIES, p.id, tryNo);
      return c.json({ error: "too_many_attempts", retryAt: lock }, 429);
    }
    if (!verifySecret(pin, p.pin_hash)) {
      const lock = await wrongTry(PIN_TRIES, p.id, tryNo);
      return c.json({ error: "wrong_pin", attemptsLeft: lock ? 0 : PIN_TRIES.max() - tryNo, ...(lock ? { retryAt: lock } : {}) }, 401);
    }
    await db.run("UPDATE parents SET pin_failed = 0, pin_locked_until = NULL WHERE id = ?", [p.id]);
    return c.json({
      parentToken: await issueToken(p.id, "parent", p.token_version ?? 0),
      expiresInSec: config.security.parentTokenMinutes * 60,
    });
  });

  return r;
}
