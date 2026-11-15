// Bringing a family's data download back in: POST /parent/import (parent token). See import-family.ts for what is and is not restored.
//
// The body is { data: <the downloaded file>, only?: [child ids in the file], includeChats?: boolean }. Nothing from the file is trusted:
// every row is validated on its own, every id is made new, and a row that refers to a lesson, child or word that does not exist here
// is counted and dropped. Children are added to the signed-in family (never a new account), up to the usual 8.
//
// Not one big transaction (the database layer has no multi-statement transaction with parameters), so it is built to be safe to
// repeat: a child is skipped when it is already here (`imported_from`), rows use ON CONFLICT DO NOTHING, and if anything fails
// part-way the child being added is deleted again (its rows go with it) before the error is returned.
import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.ts";
import { now, type Param } from "../db.ts";
import { newId } from "../security.ts";
import type { Ctx, Env } from "../context.ts";
import { checkSubject, buildFamilyLesson, FamilyLessonInput, FAMILY_LESSON_PREFIX, MAX_FAMILY_LESSONS, MAX_FAMILY_LESSON_BYTES, sizeOf, toFormShape } from "../family-lessons.ts";
import {
  ImportChild,
  ImportFile,
  ImportGame,
  ImportMessage,
  ImportProgress,
  ImportSpelling,
  knownTopics,
  NOT_RESTORED_NOTES,
  validRows,
  type ImportReport,
} from "../import-family.ts";

const MAX_CHILDREN = 8;
const CHUNK = 40;

const Body = z.object({
  data: z.unknown(),
  only: z.array(z.string().max(100)).max(8).optional(),
  includeChats: z.boolean().default(false),
});

export function parentImportRoutes(ctx: Ctx) {
  const { db, content, listChildren } = ctx;
  const r = new Hono<Env>();

  /** Inserts rows in groups so a big import is a few dozen statements, not thousands. */
  async function insertRows(table: string, columns: string[], rows: Param[][], conflict = "ON CONFLICT DO NOTHING") {
    const one = `(${columns.map(() => "?").join(",")})`;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      await db.run(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${part.map(() => one).join(",")} ${conflict}`, part.flat());
    }
  }

  r.post("/import", async (c) => {
    const parentId = c.get("parentId");
    // adding children needs a verified email wherever signing up does (the same rule as POST /parent/children)
    if (config.requireEmailVerification && !c.get("parent").email_verified_at) return c.json({ error: "email_not_verified" }, 403);
    const body = Body.parse(await c.req.json().catch(() => ({})));
    const parsed = ImportFile.safeParse(body.data);
    if (!parsed.success) {
      const tooMany = parsed.error.issues.some((i) => i.code === "too_big" && i.path[0] !== "version");
      return c.json({ error: tooMany ? "file_too_big" : "not_a_download", details: [tooMany ? "This file has more than a family can have. Nothing was imported." : "This is not a Honest Learn data download."] }, 400);
    }
    const file = parsed.data;
    const report: ImportReport = { imported: [], skipped: [], lessons: { added: 0, reused: 0, skipped: 0 }, dropped: { progress: 0, chats: 0, spelling: 0, games: 0 }, notes: [...NOT_RESTORED_NOTES] };

    // ---- the family's own lessons first, so progress and chats can point at them
    const lessonMap = new Map<string, string>(); // id in the file -> id here
    const existing = await ctx.familyLessonsOf(parentId);
    const fingerprint = (x: { title: string; band: string; subject: string; minutes: number; sections: unknown; quiz: unknown }) => JSON.stringify([x.title, x.band, x.subject, x.minutes, x.sections, x.quiz]);
    const have = new Map(existing.map((l) => [fingerprint(toFormShape(l)), l.id]));
    let lessonCount = existing.length;
    const lessonIds: { sourceId: string; input: FamilyLessonInput }[] = [];
    for (const raw of file.familyLessons) {
      const sourceId = typeof (raw as { id?: unknown })?.id === "string" ? (raw as { id: string }).id : null;
      const input = FamilyLessonInput.safeParse(raw);
      if (!sourceId || !input.success || checkSubject(content.map, input.data.band, input.data.subject)) {
        report.lessons.skipped++;
        continue;
      }
      lessonIds.push({ sourceId, input: input.data });
    }
    const createdLessons: string[] = [];
    for (const { sourceId, input } of lessonIds) {
      const stored = (({ ownerId: _o, family: _f, ...rest }) => rest)(buildFamilyLesson("x", parentId, input));
      const print = fingerprint(toFormShape({ ...stored, id: "x" } as never));
      const same = have.get(print);
      if (same) {
        lessonMap.set(sourceId, same);
        report.lessons.reused++;
        continue;
      }
      if (lessonCount >= MAX_FAMILY_LESSONS) {
        report.lessons.skipped++;
        continue;
      }
      const id = FAMILY_LESSON_PREFIX + newId();
      const lesson = { ...stored, id };
      if (sizeOf(lesson) > MAX_FAMILY_LESSON_BYTES) {
        report.lessons.skipped++;
        continue;
      }
      await db.run("INSERT INTO family_lessons (id, parent_id, json, created_at, updated_at) VALUES (?,?,?,?,?)", [id, parentId, JSON.stringify(lesson), now(), now()]);
      createdLessons.push(id);
      lessonMap.set(sourceId, id);
      have.set(print, id);
      lessonCount++;
      report.lessons.added++;
    }

    /** A lesson id from the file as it is here, or null when nothing here has that id. */
    const lessonHere = (id: string): string | null => {
      if (id.startsWith(FAMILY_LESSON_PREFIX)) return lessonMap.get(id) ?? null;
      if (content.lessons.has(id)) return id;
      return null;
    };
    const progressLessonHere = (id: string) => (/^puzzles-b[1-5]$/.test(id) ? id : lessonHere(id));

    // ---- group the rows by child
    const kids = validRows(file.children, ImportChild);
    const progress = validRows(file.progress, ImportProgress);
    const chats = validRows(file.tutorMessages, ImportMessage);
    const spelling = validRows(file.spellingProgress, ImportSpelling);
    const games = validRows(file.gamesSolved, ImportGame);
    const by = <T extends { child_id: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const row of rows) (m.get(row.child_id) ?? m.set(row.child_id, []).get(row.child_id)!).push(row);
      return m;
    };
    const progressBy = by(progress.rows);
    const chatsBy = by(chats.rows);
    const spellingBy = by(spelling.rows);
    const gamesBy = by(games.rows);
    for (let i = 0; i < kids.dropped; i++) report.skipped.push({ sourceId: null, nickname: null, reason: "invalid" });

    const here = await listChildren(parentId);
    const alreadyIds = new Set(here.flatMap((k) => [k.id, k.imported_from].filter((x): x is string => !!x)));
    const seenInFile = new Set<string>();
    let room = MAX_CHILDREN - here.length;
    const createdChildren: string[] = [];

    for (const k of kids.rows) {
      if (seenInFile.has(k.id)) {
        report.skipped.push({ sourceId: k.id, nickname: k.nickname, reason: "invalid" });
        continue;
      }
      seenInFile.add(k.id);
      if (body.only && !body.only.includes(k.id)) {
        report.skipped.push({ sourceId: k.id, nickname: k.nickname, reason: "not_chosen" });
        continue;
      }
      if (alreadyIds.has(k.id)) {
        report.skipped.push({ sourceId: k.id, nickname: k.nickname, reason: "already_here" });
        continue;
      }
      if (room <= 0) {
        report.skipped.push({ sourceId: k.id, nickname: k.nickname, reason: "no_room" });
        continue;
      }
      room--;

      const id = newId();
      try {
        createdChildren.push(id);
        await db.run(
          `INSERT INTO children (id, parent_id, nickname, birth_year, avatar, band_override, unlocked_topics, ai_enabled, daily_minutes,
             text_scale, dyslexia_font, high_contrast, read_aloud_auto, sign_language, imported_from, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, parentId, k.nickname, k.birthYear, k.avatar, k.bandOverride, JSON.stringify(knownTopics(k.unlockedTopics)), 0, k.dailyMinutes, k.textScale, k.dyslexiaFont ? 1 : 0, k.highContrast ? 1 : 0, k.readAloudAuto ? 1 : 0, k.signLanguageChoice, k.id, now()],
        );

        // lesson progress: the lesson must exist here; one row per lesson
        const prog = new Map<string, Param[]>();
        for (const p of progressBy.get(k.id) ?? []) {
          const lesson = progressLessonHere(p.lesson_id);
          if (!lesson) report.dropped.progress++;
          else prog.set(lesson, [id, lesson, p.best_score, p.total, p.attempts, p.completed_at, p.review_due]);
        }
        await insertRows("progress", ["child_id", "lesson_id", "best_score", "total", "attempts", "completed_at", "review_due"], [...prog.values()]);

        const sp = new Map<string, Param[]>();
        for (const s of spellingBy.get(k.id) ?? []) sp.set(s.word, [id, s.word, s.box, s.due, s.last_day]);
        await insertRows("spelling_progress", ["child_id", "word", "box", "due", "last_day"], [...sp.values()]);

        const gm = new Map<string, Param[]>();
        for (const g of gamesBy.get(k.id) ?? []) gm.set(g.game + "\u0000" + g.puzzle_key, [id, g.game, g.puzzle_key, g.solved_at, g.hint_chains]);
        await insertRows("games_solved", ["child_id", "game", "puzzle_key", "solved_at", "hint_chains"], [...gm.values()]);

        let chatCount = 0;
        if (body.includeChats) {
          const rows: Param[][] = [];
          for (const m of (chatsBy.get(k.id) ?? []).sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))) {
            const lesson = lessonHere(m.lesson_id);
            if (!lesson) report.dropped.chats++;
            else rows.push([newId(), id, lesson, m.role, m.content, m.flagged, m.created_at]);
          }
          // one at a time per chunk, in time order, so the chat keeps its order (the ordering column counts up as rows go in)
          await insertRows("tutor_messages", ["id", "child_id", "lesson_id", "role", "content", "flagged", "created_at"], rows, "");
          chatCount = rows.length;
        }

        report.imported.push({ sourceId: k.id, id, nickname: k.nickname, progress: prog.size, spelling: sp.size, games: gm.size, chats: chatCount });
      } catch (e) {
        // undo everything this request added (rows go with their child), so a failed import leaves the family as it was
        for (const child of createdChildren) await db.run("DELETE FROM children WHERE id = ? AND parent_id = ?", [child, parentId]);
        for (const l of createdLessons) await db.run("DELETE FROM family_lessons WHERE id = ? AND parent_id = ?", [l, parentId]);
        throw e;
      }
    }

    report.dropped.progress += progress.dropped;
    report.dropped.chats += chats.dropped;
    report.dropped.spelling += spelling.dropped;
    report.dropped.games += games.dropped;
    // rows for a child the file does not list (or that failed validation) are not counted per child; say so once
    return c.json(report, report.imported.length ? 201 : 200);
  });

  return r;
}
