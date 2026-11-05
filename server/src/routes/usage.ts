// Screen time: minutes are counted on the server, so a child's daily limit applies on every device.
// Needs a family token (checked in app.ts for /children/*).
import { Hono } from "hono";
import { z } from "zod";
import { now } from "../db.ts";
import { Day, plausibleDay } from "../models.ts";
import type { Ctx, Env } from "../context.ts";

export function usageRoutes(ctx: Ctx) {
  const { db, loadChild } = ctx;
  const r = new Hono<Env>();

  r.get("/children/:childId/usage", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const day = Day.parse(c.req.query("day"));
    return c.json(await usageFor(ctx, child.id, day, child.daily_minutes));
  });

  /** Called by the app once a minute while a child is actively learning. */
  r.post("/children/:childId/usage/tick", async (c) => {
    const child = await loadChild(c);
    if (!child) return c.json({ error: "child_not_found" }, 404);
    const { day } = z.object({ day: Day }).parse(await c.req.json());
    if (!plausibleDay(day)) return c.json({ error: "invalid_input", details: ["day is not today"] }, 400);
    const row = await db.get<{ last_tick: string | null }>("SELECT last_tick FROM usage WHERE child_id = ? AND day = ?", [child.id, day]);
    // At most one minute counted per 50 seconds, even if several devices are open.
    if (!row?.last_tick || Date.now() - Date.parse(row.last_tick) >= 50_000) {
      await db.run(
        `INSERT INTO usage (child_id, day, minutes, last_tick) VALUES (?,?,1,?)
         ON CONFLICT (child_id, day) DO UPDATE SET minutes = usage.minutes + 1, last_tick = excluded.last_tick`,
        [child.id, day, now()],
      );
    }
    return c.json(await usageFor(ctx, child.id, day, child.daily_minutes));
  });

  return r;
}

/** Today's minutes, bonus and what's left for one child. Shared with the parent routes (extra time). */
export async function usageFor(ctx: Ctx, childId: string, day: string, dailyMinutes: number) {
  const u = await ctx.db.get<{ minutes: number; bonus: number }>("SELECT minutes, bonus FROM usage WHERE child_id = ? AND day = ?", [childId, day]);
  const minutes = u?.minutes ?? 0;
  const bonus = u?.bonus ?? 0;
  return { day, minutes, bonus, limit: dailyMinutes + bonus, remaining: Math.max(0, dailyMinutes + bonus - minutes) };
}
