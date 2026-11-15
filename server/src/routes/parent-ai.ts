// The family's own AI model for Hoot. Mounted at /parent, so every route needs the parent token (the PIN). Saving also needs the
// account password, because a child may have seen the PIN. The API key is never returned (see ai-settings.ts).
import { Hono } from "hono";
import { now } from "../db.ts";
import {
  AiSettingsInput,
  checkBaseUrl,
  checkResolvedHost,
  errorCategory,
  guardedFetch,
  lastFour,
  publicSettings,
  sealKey,
  tutorOptions,
  type AiSettingsRow,
} from "../ai-settings.ts";
import type { Ctx, Env } from "../context.ts";

/** Test calls a family may make in an hour. Each one is a request to a server the family chose. */
export const AI_TESTS_PER_HOUR = 10;

export const loadAiSettings = (ctx: Ctx, parentId: string) =>
  ctx.db.get<AiSettingsRow>("SELECT * FROM ai_settings WHERE parent_id = ?", [parentId]);

/** Scheme, host and port: a stored key is only sent where it was entered (http and https, or another port, count as different). */
const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

export function parentAiRoutes(ctx: Ctx) {
  const { db } = ctx;
  const r = new Hono<Env>();

  r.get("/ai", async (c) => c.json({ settings: publicSettings(await loadAiSettings(ctx, c.get("parentId"))) }));

  r.put("/ai", async (c) => {
    const parentId = c.get("parentId");
    const b = AiSettingsInput.parse(await c.req.json().catch(() => ({})));
    const check = await ctx.checkPassword(c.get("parent"), b.password);
    if (check === "locked") return c.json({ error: "too_many_attempts" }, 429);
    if (check === "wrong") return c.json({ error: "wrong_password" }, 401);

    const url = checkBaseUrl(b.baseUrl);
    if (!url.ok) return c.json({ error: "invalid_input", details: [url.error] }, 400);
    const resolved = await checkResolvedHost(url.host);
    if (!resolved.ok) {
      const why = resolved.error === "blocked_address" ? "That address is not allowed from this server." : "That address could not be found from this server. Check the spelling.";
      return c.json({ error: "invalid_input", details: [why] }, 400);
    }

    const prev = await loadAiSettings(ctx, parentId);
    let keyCipher = prev?.key_cipher ?? null;
    let keyLast4 = prev?.key_last4 ?? null;
    let keyCleared = false;
    let newKey = false;
    if (b.apiKey === undefined) {
      // A stored key is only ever sent to the host it was entered for. A new host needs the key typed again.
      if (prev?.key_cipher && originOf(prev.base_url) !== originOf(url.url)) {
        keyCipher = null;
        keyLast4 = null;
        keyCleared = true;
      }
    } else if (b.apiKey === null || b.apiKey === "") {
      keyCipher = null;
      keyLast4 = null;
    } else {
      keyCipher = sealKey(b.apiKey, parentId);
      keyLast4 = lastFour(b.apiKey);
      newKey = true;
    }

    const safety = b.safetyModel ?? null;
    const changed =
      !prev || newKey || keyCleared || prev.provider !== b.provider || prev.base_url !== url.url || prev.model !== b.model || (prev.safety_model ?? null) !== safety || (prev.key_cipher ?? null) !== keyCipher;
    await db.run(
      `INSERT INTO ai_settings (parent_id, provider, base_url, model, safety_model, key_cipher, key_last4, updated_at) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT (parent_id) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url, model = excluded.model,
         safety_model = excluded.safety_model, key_cipher = excluded.key_cipher, key_last4 = excluded.key_last4, updated_at = excluded.updated_at`,
      [parentId, b.provider, url.url, b.model, safety, keyCipher, keyLast4, now()],
    );
    // A new, untested model must be switched on again child by child, after the parent has read the warning.
    let hootTurnedOff = 0;
    if (changed) {
      const on = await db.get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM children WHERE parent_id = ? AND ai_enabled = 1", [parentId]);
      hootTurnedOff = on?.n ?? 0;
      await db.run("UPDATE children SET ai_enabled = 0 WHERE parent_id = ?", [parentId]);
    }
    return c.json({ settings: publicSettings(await loadAiSettings(ctx, parentId)), hootTurnedOff, keyCleared });
  });

  r.delete("/ai", async (c) => {
    await db.run("DELETE FROM ai_settings WHERE parent_id = ?", [c.get("parentId")]);
    return c.json({ ok: true, settings: publicSettings(null) });
  });

  /** Sends one fixed, harmless message to each chosen model and reports only whether it answered. */
  r.post("/ai/test", async (c) => {
    const parentId = c.get("parentId");
    const row = await loadAiSettings(ctx, parentId);
    if (!row) return c.json({ error: "not_configured" }, 404);
    const limit = await ctx.hitRateLimit(`ai-test:${parentId}`, AI_TESTS_PER_HOUR, 60 * 60 * 1000);
    if (!limit.allowed) return c.json({ error: "too_many_attempts", retryAfterSec: limit.retryAfterSec }, 429);
    const shown = publicSettings(row);
    if (shown.configured && shown.keyUnreadable) return c.json({ ok: false, results: [], error: "key_unreadable" });
    const opts = tutorOptions(row);
    const doFetch = guardedFetch();
    const models = [...new Set([opts.model, opts.safetyModel])];
    const results: { model: string; ok: boolean; error: string | null; ms: number }[] = [];
    for (const model of models) {
      const started = Date.now();
      try {
        const res = await doFetch(`${opts.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
          body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word: ready" }], max_tokens: 10, temperature: 0, stream: false }),
          signal: AbortSignal.timeout(opts.timeoutMs),
        });
        if (!res.ok) throw new Error(`model server answered ${res.status}`);
        const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
        const answered = typeof json?.choices?.[0]?.message?.content === "string";
        results.push({ model, ok: answered, error: answered ? null : "bad_response", ms: Date.now() - started });
      } catch (err) {
        results.push({ model, ok: false, error: errorCategory(err), ms: Date.now() - started });
      }
    }
    return c.json({ ok: results.every((x) => x.ok), results });
  });

  return r;
}
