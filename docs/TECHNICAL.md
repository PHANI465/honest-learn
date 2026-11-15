# Honest Learn: technical explanation

For engineers. A one-page visual version of this document is [`architecture.html`](architecture.html) (open it in a
browser). For a gentler tour see [`guide/`](guide/README.md).

## 1. System in one paragraph

Honest Learn is a single Expo (React Native) client that ships to iOS, Android and the web from one codebase, and a
stateless Hono API on Node 22 that owns every rule that matters: authentication, what a child may see, the quiz
answers, the hint ladder, screen time and the AI helper's safety pipeline. Curriculum is static JSON loaded into memory
at start. State is in SQLite locally or Postgres (Neon) when deployed, behind one small `DB` interface. On Vercel the
web export is served as static files and the API runs as one serverless function under `/api`.

## 2. Components

| Part | Technology | Entry point | Notes |
|---|---|---|---|
| Client | Expo SDK 58, React Native 0.88, expo-router, React 19 | `app/src/app/_layout.tsx` | File-based routes in `app/src/app`. Web export to `app/dist`. |
| API | Hono 4, TypeScript run by `tsx`, zod | `server/src/app.ts` (`createApp`) | Pure function of its dependencies: `{ db, content, tutor, wiki, mailer }`. |
| Local server | `@hono/node-server` | `server/src/index.ts` (API only), `server/src/preview.ts` (API + static site on one port) | `npm run dev` at the root uses `preview.ts`. |
| Vercel function | — | `api/index.ts` → `server/src/vercel.ts` | Also mounts `server/src/cron.ts` (data retention job). |
| Database | `node:sqlite`, or Postgres via `@neondatabase/serverless`; PGlite in tests | `server/src/db.ts`, `db-neon.ts`, `open-db.ts` | One `DB` interface: `get`, `all`, `run`, `exec`. SQL is written to run on both. |
| Curriculum | JSON validated with zod | `server/src/content.ts` (`loadContent`) | `content/knowledge-map.json`, `lessons/`, `puzzles/`, `facts/`, `spelling/`, `resources.json`, `helplines.json`. |
| AI helper ("Hoot") | Anthropic SDK, or any OpenAI-compatible server | `server/src/tutor.ts`, `server/src/tutor-openai.ts` | Selected by `TUTOR_MODE` (`claude`, `openai`, `mock`). |

## 3. Request path and trust model

`createApp` applies, in order: CORS, secure headers (CSP `default-src 'none'`), `Cache-Control: no-store`, a 32 KB body
limit, token-secret bootstrap, then route groups guarded by scope.

Two bearer tokens (HS256 JWT, `server/src/security.ts`):

| Token | Lifetime | Obtained by | Grants |
|---|---|---|---|
| `family` | 30 days | email + password | Everything a child does: lessons, quizzes, puzzles, Hoot, usage ticks, reports |
| `parent` | 10 minutes | family token + PIN | `/parent/*`: profiles, sensitive topics, chats, export, settings |

Both carry a session version `v`. `requireScope` (`server/src/context.ts`) loads the parent row on every request and
rejects a token whose `v` differs from `parents.token_version`; `revokeSessions()` increments it (password reset,
password change, "sign out everywhere"). Destructive account actions (`DELETE /parent/account`, `PATCH /parent/password`)
additionally require the account password via `checkPassword`.

The client is untrusted. The server never accepts a client claim that would unlock something: hint counts, quiz
scores and option positions are all recomputed or checked server-side.

### Attempt limiting

Password and PIN guesses take a numbered try with one atomic `UPDATE … RETURNING` before verification (`takeTry`), so
parallel requests cannot exceed the limit. Reaching the limit locks with escalating durations (15 min, 1 h, 6 h, 24 h;
`config.security.lockEscalation`). `/auth/*` also has a per-IP fixed-window limit stored in the `rate_limits` table by a
single upsert (`hitRateLimit`), so all serverless instances share it. Client IP comes from the platform header or the
last `X-Forwarded-For` hop (`clientIp`).

## 4. Curriculum model

- **Bands:** `b1` 3–5, `b2` 6–8, `b3` 9–11, `b4` 12–14, `b5` 15–18 (`bandForAge`, or a parent override).
- **Lesson:** `{ id, title, band, subject, outcomes[], sensitive, minutes, status, reviewers[], sources[], sections[], quiz[] }`.
  Section types: `text`, `tryit`, `parent`, `fact`, `video`. A quiz question is
  `{ q, options[2..5], answer, hints[3], explain }` with the correct option stored first (`answer: 0`).
- **Visibility** (`visibleTo`): band matches, status is `reviewed` unless `SHOW_DRAFTS`, and a `sensitive` tag
  (`religion`, `body`, `politics`) is in the child's `unlocked_topics`.
- **Projection:** `publicLesson()` strips `answer`, `hints` and `explain` and applies a per-child option permutation
  (`optionOrder(childId, lessonId, questionIndex, n)`, a seeded shuffle in `server/src/shuffle.ts`), so two children see
  different option orders and position reveals nothing.

## 5. The hint ladder (the core invariant)

Invariant: **an answer or explanation leaves the server only after a correct try, or after all three hints were opened
in order.**

- `POST …/hint { question, level }` → `openHint` refuses `level > seen + 1` and upserts the highest level into
  `hints_seen (child_id, item_id, q_index, level)`.
- `POST …/check { question, choice, hintsUsed }` maps the on-screen position back through `optionOrder`, records a
  solve in `quiz_solved`, and calls `mayReveal(correct, hintsUsed, …)`, which requires `hints_seen.level >= 2` whatever
  the client claims.
- `POST …/complete { choices }` scores first tries only and schedules a review date (`reviewIntervalDays`: spaced repetition).
- Puzzles (`routes/puzzles.ts`) reuse the same ladder with `item_id = puzzles-<band>`.

Offline (`app/src/lib/offline.ts`): the client caches the public projection of lessons a child opened and queues
completions. Because the projection has no answers, checking needs a connection; this is deliberate.

## 6. Hoot: the AI helper pipeline

`POST /children/:id/tutor/:lessonId` (`server/src/routes/tutor.ts`):

1. **Gates:** lesson visible to the child; band is not `b1`; `ai_enabled`; message ≤ 500 characters.
2. **Deterministic precheck** (`precheckConversation` in `tutor.ts`, no model involved): personal-information patterns
   (email, phone, address, school, handles, full name) and wellbeing patterns (self-harm, abuse), evaluated over the
   last three unflagged user messages so a disclosure split across messages is caught. A hit returns a fixed reply;
   wellbeing replies name a helpline for the family's country (`content/helplines.json`) and email the parent once per
   child per day, without the message text. Personal information is stored as a placeholder, never as typed.
3. **Daily limit, atomically:** insert the message, count today's messages, delete and return 429 if over the limit.
4. **Generation:** `tutor.reply()` with a per-band system prompt (`tutorSystemPrompt`), the lesson context including
   the secret answer and whether the question is solved (`lessonContext`), and the last 12 turns.
5. **Second pass:** a separate model call returns `{ safe_for_age, reveals_answer }`. Unsafe, leaking, refused or
   failed → the reply is replaced by `safeHint()` (the lesson's own pre-written hint) and the message is flagged.
6. **Deterministic backstop:** `singlesOutCorrectOption` rejects a reply that names the correct option's text but none
   of the wrong ones.

Providers implement `TutorProvider { reply(req): Promise<TutorResult> }`:

| Provider | When | Specifics |
|---|---|---|
| `MockTutor` | default | Returns `safeHint()`. No network. |
| `ClaudeTutor` | `ANTHROPIC_API_KEY` set | Prompt caching, structured output (JSON schema) for the verdict, token caps from config. |
| `OpenAICompatTutor` | `TUTOR_MODE=openai` | `POST {LLM_BASE_URL}/chat/completions`. Adds a rule reminder with examples after the lesson context, strips `<think>` blocks, applies fixed checks (links, length by band), parses the verdict leniently and **fails closed** when it cannot. |

See [`FREE_AGENTS.md`](FREE_AGENTS.md) for connecting Ollama or a hosted service.

## 7. Data model

| Table | Key | Purpose |
|---|---|---|
| `parents` | `id` | Email, scrypt password and PIN hashes, lock counters and levels, `token_version`, consent, country |
| `children` | `id` → `parents` (cascade) | Nickname, birth year, avatar, band override, unlocked topics, `ai_enabled`, daily minutes, reading and display settings |
| `progress` | `(child_id, lesson_id)` | Best score, attempts, completion and next review date |
| `quiz_solved` | `(child_id, lesson_id, q_index)` | Which questions were solved (lets Hoot explain afterwards) |
| `hints_seen` | `(child_id, item_id, q_index)` | Highest hint level opened: the ladder's source of truth |
| `usage` | `(child_id, day)` | Minutes, bonus minutes, last tick |
| `spelling_progress` | `(child_id, word)` | Leitner box (0 to 4), due day, last day tried |
| `spelling_days` | `(child_id, day)` | The words chosen for that child that day (kept so reloading never changes the set) |
| `tutor_messages` | `id` | Hoot chats with `flagged`; purged after `CHAT_RETENTION_DAYS` |
| `reports` | `id` | In-app reports (20 per family per day) |
| `auth_codes` | `(parent_id, purpose)` | Hashed 6-digit email codes with attempts and expiry |
| `rate_limits` | `key` | Shared fixed-window counters |
| `app_settings` | `key` | The generated token secret when `TOKEN_SECRET` is unset |

Schema and additive migrations live in `server/src/db.ts` (`SCHEMA`, `MIGRATIONS`). Deleting a parent cascades to
everything. `purgeOld` (start-up locally, daily cron on Vercel) removes old chats, codes and rate-limit rows.

## 8. Client structure

- **Session** (`app/src/lib/session.tsx`): family token in SecureStore on phones and `localStorage` on the web; the
  parent token only in memory with an auto-lock timer; `parentApi()` clears it on 401/403.
- **Routes:** `welcome` (web: marketing landing in `welcome.web.tsx`), `login`, `signup`, `profiles`,
  `learn/[childId]/…` (home, subject, lesson, practice, puzzles, tutor), `parent/…` (overview, child settings, chats).
- **UI kit:** `app/src/components/ui.tsx`; motion primitives in `app/src/lib/motion.tsx` (transform and opacity only,
  reduced-motion aware); colours in `app/src/lib/theme.ts`, checked by `scripts/check-contrast.mjs`.
- **PWA:** `app/public/sw.js` caches the shell and bundles; never API responses.

## 9. Security headers and deployment

Website headers (strict CSP limited to self plus the no-cookie YouTube player, HSTS, no framing, `noindex` before
launch) are defined once in `server/src/web-headers.ts` and mirrored in `vercel.json`; `server/test/web-headers.test.ts`
fails if they drift. `LAUNCH=true` flips pre-launch defaults: drafts hidden, email verification required, CORS closed,
mailer mandatory. Details: [`SECURITY.md`](SECURITY.md), [`DEPLOYMENT.md`](DEPLOYMENT.md).

## 10. Tests and checks

| Check | Command | Covers |
|---|---|---|
| API tests (SQLite) | `cd server && npm test` | 117 tests in 10 files: auth, ladder, visibility, Hoot safety patterns, lockouts, hardening, own-model provider, cron, headers, legal text sync |
| Same on Postgres | `cd server && npm run test:pg` | PGlite, one file at a time |
| Content validation | `cd server && npm run validate` | Schema, references, hints that contain the answer |
| Types and lint | `npx tsc --noEmit` in `server` and `app`; `CI=1 npx expo lint` in `app` | |
| Docs and colours | `node scripts/check-doc-counts.mjs`, `node scripts/check-contrast.mjs` | Counts in docs match content; WCAG AA contrast |

Not covered by automated tests: the React Native screens (no end-to-end suite yet), real model behaviour (the
red-team set in `content/hoot-redteam.json` must be run and read by a person), and real devices.

## 11. Extension points

| To add | Touch |
|---|---|
| A lesson | A JSON file under `content/lessons/<band>/<subject>/`, then the three generators in `CLAUDE.md` |
| A subject | `content/knowledge-map.json` (`subjects`, outcomes), `subjectEmoji` in `app/src/lib/theme.ts` |
| An AI provider | Implement `TutorProvider`, select it in `createTutor()` |
| A child-facing activity with secret answers | A route module shaped like `server/src/routes/puzzles.ts` using `openHint`/`mayReveal` |
| A database | Implement the `DB` interface (`server/src/db.ts`) |

Planned work and how to hand it to other agents: [`AGENT_TASKS.md`](AGENT_TASKS.md).
