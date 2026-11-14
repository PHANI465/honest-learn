# Agent tasks: the next phase, ready to hand over

Written 14 November 2026. This file lets any AI agent (or person) continue Honest Learn without starting from
scratch. Each task says what to build, how, with which files, which agent is suitable, how much effort it is, and how
to check it. Work top to bottom unless the owner says otherwise.

## Prompt to give the next agent

Copy this into a new session opened in the repository folder:

```text
You are continuing work on the Honest Learn repository. Read CLAUDE.md, then docs/AGENT_TASKS.md.
1. In the "Status board" table, find the first task whose status is "todo" and whose "Depends on" tasks are all "done".
2. Before doing anything, tell me: the task id and title, which agent and effort level the guide recommends for it,
   and whether you (the model you are now) are a good fit. If the guide recommends a different model, say so and stop
   so I can switch.
3. If you are a fit, do that ONE task exactly as its section describes. Follow every rule in "Rules for every task".
4. Run the checks in "How to verify". Fix what fails.
5. Update the task's row in the Status board (status, date, notes), add anything the next agent must know under the
   task's "Handover notes", and commit with the task id in the message. Do not push unless I ask.
6. Finish by telling me: what you did, what you could not verify, and which task and which agent should go next.
```

## Rules for every task

1. Read `CLAUDE.md` first. Its "Rules that must not be broken" apply to everything here.
2. **All new content is a draft.** Every new lesson, puzzle, word list, fact and sign lesson has `"status": "draft"` and
   stays that way until two human reviewers approve it. Never mark anything reviewed.
3. **Do not invent facts.** Facts, dates, numbers and word definitions need a source in the item's `sources` list
   (prefer Wikipedia, OpenStax, government or university pages). If you cannot source it, leave it out.
4. **Answers stay on the server.** New activities follow the existing pattern: the app asks the server to check; the
   server never sends answers, hints or explanations before they are earned.
5. **No streaks, leaderboards, timers that pressure, ads or tracking.** "Daily" features must never punish a missed day.
6. **Accessibility is part of done** (see T1): labels for screen readers, 44 px touch targets, contrast
   (`node scripts/check-contrast.mjs`), works with the keyboard on the web, respects reduced motion (`app/src/lib/motion.tsx`).
7. After changing content run: `node scripts/build-catalogue.mjs`, `node scripts/export-review-sheet.mjs`,
   `node scripts/build-knowledge-doc.mjs`, and update counts so `node scripts/check-doc-counts.mjs` passes.
8. Add each new group of content to `docs/NEEDS_APPROVAL.md` so reviewers know it exists.

### How to verify (every task)

```bash
cd server && npx tsc --noEmit && npm test && npm run validate
cd app && npx tsc --noEmit && CI=1 npx expo lint
node scripts/check-doc-counts.mjs && node scripts/check-contrast.mjs
```

On Windows run the Postgres tests with `cd server && npm run test:pg`. For anything visible, run `npm run dev` at the
repository root, then `node scripts/seed-demo.mjs`, and look at it at phone width (390 px).

### Which agent for what

| Agent | Use it for | Why |
|---|---|---|
| **Haiku**, low effort | Bulk content that follows a strict template: word lists, quick facts, simple quiz questions, doc count updates | Cheap and fast; the validator catches format mistakes |
| **Sonnet**, medium effort | Lesson writing, new screens that copy an existing screen, new server routes that copy an existing route, tests | Most tasks here |
| **Opus**, high effort | Anything that changes security, where answers are kept, the Hoot safety pipeline, or the app's architecture | A mistake is expensive or hard to notice |
| A free local model (Ollama) | Drafting word lists or facts only, and only if a stronger agent or a person checks every item | Small models make things up |
| **A person** | Reviewing content, choosing sign language videos, anything needing a Deaf reviewer, app store accounts | Cannot be delegated to AI |

Effort sizes: **S** under 2 hours of agent work, **M** half a day, **L** one to two days, **XL** several days and should be split.

## Status board

| Id | Task | Agent, effort | Size | Depends on | Status | Notes |
|---|---|---|---|---|---|---|
| T0 | Own-model layer for Hoot (Ollama, OpenAI-compatible) | Opus high | M | none | **done** 14 Nov 2026 | `server/src/tutor-openai.ts`, `docs/FREE_AGENTS.md` |
| T1 | Accessibility audit and fixes | Sonnet medium | M | none | **done** 14 Nov 2026 | `docs/ACCESSIBILITY.md`; keyboard and screen reader passes still need a person |
| T2 | Quick facts between lessons | Haiku low (content), Sonnet medium (code) | S + S | none | todo | |
| T3 | Daily spelling and vocabulary | Sonnet medium (code), Haiku low (word lists) | L | none | todo | |
| T4 | Quantitative aptitude and reasoning lessons | Sonnet medium | L | none | **in progress** | b2, b3 and b4 done 14 Nov 2026 (19 lessons). b5 todo (11 lessons), one band per session |
| T5 | Games section: Sudoku, chess, memory games | Sonnet high | XL (split 5a to 5d) | none | todo | |
| T6 | Own key in the parent area (BYOK screen) | Opus high | M | T0 | todo | Security sensitive |
| T7 | Red-team runner for own models | Sonnet medium | S | T0 | todo | |
| T8 | Standalone phone app with no server | Opus high (design and core), Sonnet medium (screens) | XL (split 8a to 8d) | T6 | todo | |
| T9 | Sign language section (ASL, BSL, ISL, LSM) | Person (videos) + Sonnet medium | L | T1 | todo | Needs a Deaf reviewer |
| T10 | "Add your own lessons" for parents | Sonnet medium | M | none | todo | |
| T11 | Android and iOS store builds | Person + Sonnet medium | M | T8 | todo | Needs developer accounts |

---

## T1. Accessibility audit and fixes

**Goal.** People with visual, hearing, motor and cognitive disabilities can use every screen.

**Already in place.** Screen reader labels on buttons and cards, 44 px targets, contrast checker, zoom allowed,
reduced motion support, keyboard focus rings on the website, read-aloud for lessons (`expo-speech` in the lesson screen).

**Approach.**
1. Walk every route in `app/src/app` with the checklist below. Fix what fails in place.
2. Add a **Reading and display** card to `app/src/app/parent/child/[id].tsx` with per-child settings stored on the
   child row (new columns in `MIGRATIONS` in `server/src/db.ts`, fields in `ChildPatch` and `childPublic` in
   `server/src/models.ts`): `textScale` (1, 1.15, 1.3), `dyslexiaFont` (boolean; bundle OpenDyslexic, which has an open
   licence, in `app/public/fonts` like Manrope), `highContrast` (boolean), `readAloudAuto` (boolean).
3. Apply them through one hook, `useChildDisplay()` in `app/src/lib/theme.ts`, used by `H1`, `P`, `Card` in `app/src/components/ui.tsx`.
4. Write `docs/ACCESSIBILITY.md`: what is supported, what is not, how to report a barrier.

**Checklist.** Every image and emoji that carries meaning has a label; decorative ones are hidden. Every form field has
a label. Errors are announced (`accessibilityRole="alert"`). Nothing depends on colour alone (quiz right and wrong
already use icons). Every action works with Tab and Enter on the web. Videos have captions or a text summary. No text
under 12 px. Nothing flashes.

**Suitable agent.** Sonnet, medium effort. **Size.** M.

**Verify.** The standard checks, plus a keyboard-only pass on the web and a screen reader pass (NVDA on Windows or
VoiceOver on a Mac or iPhone). Write down what you could not test.

---

## T2. Quick facts between lessons

**Goal.** Short, surprising, true facts appear between activities to keep learning interesting.

**What exists.** Lessons already support a `"fact"` section type (`server/src/content.ts`, `Section`), shown with the
`surfaces.fact` tint.

**Approach.**
1. Content: `content/facts/<band>.json`, shaped like `content/puzzles/<band>.json`:
   `{ "band": "b3", "status": "draft", "facts": [{ "id": "b3-f1", "subject": "science", "text": "...", "source": { "title": "...", "url": "https://..." } }] }`.
   Add a zod schema `FactSet` next to `PuzzleSet` in `content.ts`, load it in `loadContent`, validate in `validate-content.ts`.
   Aim for 40 facts per band, spread across the 11 subjects. One or two sentences, reading level right for the band.
2. Server: `GET /children/:childId/facts?count=1` in `server/src/routes/learn.ts` returns random facts for the child's
   band, skipping sensitive subjects unless unlocked. Facts hold no secrets, so they can be cached offline.
3. App: a `FactCard` component shown (a) on the quiz result screen in `QuizRunner.tsx` and the lesson finish screen,
   (b) once on the child home. Use `Card enterDelay={0}` so it fades in. A "Another fact" button is fine; an endless feed is not.

**Suitable agents.** Haiku low effort for the facts (a stronger agent or person must spot-check 1 in 5 against its
source); Sonnet medium for the code. **Size.** S + S.

**Risk.** Invented facts. Every fact needs a real source link; `validate-content.ts` should fail a fact without one.

---

## T3. Daily spelling and vocabulary

**Owner's decision.** Words by age group, the number of words also by age, adapting to progress: missed words come
back, harder words unlock as the child gets them right.

**Design.**
- Words per day: b1 **3**, b2 **4**, b3 **6**, b4 **8**, b5 **10**. A parent can lower or raise it later (optional).
- Content: `content/spelling/<band>.json`:
  `{ "band": "b2", "status": "draft", "words": [{ "word": "because", "level": 1, "meaning": "for the reason that", "sentence": "I wore a coat because it was cold.", "tip": "Big Elephants Can Always Understand Small Elephants" }] }`.
  Three levels per band, at least 120 words per band. b1 uses letter sounds and three-letter words with a picture emoji.
  Sources: public domain or openly licensed word lists (for example Dolch and Fry lists for young readers, the
  Academic Word List for teens). Record the source and licence in the file.
- Server (new `server/src/routes/spelling.ts`, mounted like `puzzles.ts`):
  - Table `spelling_progress (child_id, word, box INTEGER, due TEXT, PRIMARY KEY (child_id, word))`. This is a
    Leitner box: a correct spelling moves the word up a box (due in 1, 3, 7, 16 days), a miss sends it to box 0 (due tomorrow).
  - `GET /children/:id/spelling/today?day=YYYY-MM-DD` returns today's set: due words first, then new words from the
    child's current level, up to the daily count. Deterministic for a child and day (seed a shuffle with child id + day,
    as `server/src/shuffle.ts` does), so reloading does not change the set. It returns the meaning and sentence with the
    word blanked, **never the spelling** before the try.
  - `POST /children/:id/spelling/check { word id, typed }` compares on the server (trim, case-insensitive), updates the
    box, returns `{ correct, word }` (the spelling is revealed after the try, right or wrong: seeing it is the lesson).
  - Level up: when 80% of a level's words are in box 2 or higher, new words come from the next level.
- App: `app/src/app/learn/[childId]/spelling.tsx`. Flow per word: hear it (`expo-speech`, already a dependency), see the
  meaning and sentence, type it, get gentle feedback (`useShake` on a miss, `Pop` on a hit), see the tip. Activities
  to rotate: type the word, pick the correct spelling from three, unscramble the letters, fill the missing letters.
  For b1: tap the first letter sound. A card on the child home: "Today's words". **No streak counter.** If a day is
  missed, nothing is said about it.
- Parent view: add "Words learned" to `parent/child/[id].tsx`.

**Suitable agents.** Sonnet medium for server and app; Haiku low for word lists, checked by Sonnet for age fit and
spelling variants (decide British or American spelling per family: add `spellingVariant` to the parent's settings, default by country).
**Size.** L. Split: 3a schema, table and routes with tests; 3b screen; 3c word lists.

**Tests to write.** `server/test/spelling.test.ts`: the set is stable within a day; a miss returns tomorrow; the
spelling is absent from `today`; levels unlock; a child cannot check another family's child.

---

## T4. Quantitative aptitude, mathematics and reasoning

**Goal.** Lessons on quant, logical reasoning and problem solving by age, including surprising methods such as naming
the weekday of any date.

**Approach.** No new code: these are ordinary lessons under `content/lessons/<band>/math/` and `.../thinking/`, plus
puzzle sets. Add outcomes to `content/knowledge-map.json` first (each lesson must list the outcomes it teaches), then
write lessons in the existing JSON shape (copy any file in `content/lessons/b3/math/`). Each lesson: 3 to 5 sections,
a "tryit", a "parent" note, sources, and 3 quiz questions with the three-step hint ladder (nudge, bigger hint, worked
example of a **different** problem with a **different** result). `"answer": 0` always; the server shuffles.

**Lesson list to write (all drafts).**

| Band | Lessons |
|---|---|
| b2 (6 to 8) | Number patterns; odd and even tricks; adding 9 the quick way; days of the week and the calendar |
| b3 (9 to 11) | Divisibility rules (2, 3, 5, 9, 10); multiplying by 11; estimating before calculating; simple ratio; logic grids; the calendar repeats every 7 days |
| b4 (12 to 14) | Percentages three ways; ratio and proportion; speed, distance, time; averages; simple interest; number series; coding and decoding; blood relation puzzles; direction sense; **the weekday of any date (Doomsday method, this century)** |
| b5 (15 to 18) | Time and work; profit and loss; compound interest; permutations and combinations; probability; syllogisms; seating arrangements; data interpretation; data sufficiency; **the weekday of any date in any century (Doomsday method in full, and Zeller's formula)**; fast squaring and Vedic-style multiplication with the algebra that explains why they work |

For the weekday lessons use Conway's Doomsday rule (source: Wikipedia "Doomsday rule"). Every worked example must be
checked with code before it is written down, for example `new Date(Date.UTC(1969, 6, 20)).getUTCDay()`.

**Suitable agent.** Sonnet medium, one band per session. Every numeric answer must be computed with code, not from memory.
**Size.** L (about 30 lessons). **Risk.** Wrong arithmetic in hints and explanations; the validator does not check maths.

---

## T5. Games section: Sudoku, chess and memory games

**Owner's decision.** Lessons plus playable boards. A full chess game against the computer is a later task.

**Goal.** A "Games" area on the child home that builds logic, memory and problem solving, calmly: no clocks unless the
child turns one on, no rankings.

Split into four tasks. Do 5a first; it sets the pattern.

**5a. Sudoku (Sonnet high, L).**
- Sizes by age: 4×4 for b1 and b2 (pictures or digits 1 to 4), 6×6 for b3, 9×9 for b4 and b5, three difficulty levels.
- Puzzles are generated on the server from a seed (child id + puzzle number) in `server/src/games/sudoku.ts`: build a
  full valid grid, remove cells while a solver confirms **exactly one solution**. Test with a fixed seed.
- Routes in `server/src/routes/games.ts`: `GET .../games/sudoku/:n` returns the givens only;
  `POST .../games/sudoku/:n/check { cells }` says which filled cells are wrong (no solution sent);
  `POST .../games/sudoku/:n/hint` follows the hint ladder: (1) which technique to look for, (2) which row, column or
  box to look at, (3) one cell's value with the reason. Record hints in `hints_seen` like quizzes.
- App: `app/src/app/learn/[childId]/games/sudoku.tsx`, a grid of `Pressable` cells and a number pad, notes mode
  (pencil marks), undo. Screen reader label per cell: "Row 3, column 4, empty" or "given 7". Keyboard arrows on the web.
- Lessons (content, `thinking` subject): what the rules are; scanning; naked singles; hidden singles; pairs; for teens, X-wing as a stretch.

**5b. Chess lessons and puzzles (Sonnet high, L).**
- Add the `chess.js` library (MIT licence, pure JavaScript, no network) to **both** `server` and `app` for move rules.
  Check its licence and size before adding; ask the owner before adding any other dependency.
- Board component `app/src/components/ChessBoard.tsx`: 8×8 `Pressable` squares, Unicode pieces (♔♕♖♗♘♙) so no image
  assets are needed, tap a piece then a square, legal squares highlighted, labels like "White knight on g1".
- Lessons by level (content, new subject id `games` or under `thinking`): the board and how each piece moves; check,
  checkmate, stalemate; castling, en passant, promotion; piece values; opening principles; tactics (fork, pin, skewer,
  discovered attack); basic endgames (king and queen, king and rook); for teens, planning and common mating patterns.
- Puzzles: `content/chess/<level>.json` with `{ id, fen, solution: ["Qh5", "..."], theme, hints[3], explain }`. The app
  receives the FEN only; `POST .../games/chess/:id/move { move }` checks one move at a time on the server.
  **Every puzzle must be verified with chess.js in a test** (the solution is legal and ends in mate or wins material as claimed).
  Compose original positions or use public domain ones (the Lichess puzzle database is CC0; record the source).

**5c. Memory and logic games (Sonnet medium, M).** Pairs (matching cards), sequence recall (repeat a growing pattern),
"which one changed?", nonograms for teens, and the 15-puzzle. These can run on the device with no server (no secret
answers), with progress saved as a simple "played" record.

**5d. Play chess against the computer (later, Opus high, L).** Needs an engine: Stockfish compiled to WebAssembly is
GPL (the project licence must be compatible; ask the owner), or a small MIT engine with limited strength. Document
the choice before building.

---

## T6. Own key in the parent area (BYOK screen)

**Owner's decision.** Both: the `.env` file (done in T0) **and** a PIN-protected screen.

**Why Opus.** A stored API key is a secret. Mistakes leak it.

**Design to implement.**
- Table `ai_settings (parent_id PRIMARY KEY, provider, base_url, model, safety_model, key_cipher, key_last4, updated_at)`.
- Encrypt the key with AES-256-GCM using a key derived (HKDF) from `config.tokenSecret` plus the parent id. Store
  `iv.tag.ciphertext`. **Never return the key**: `GET /parent/ai` returns provider, model, `keyLast4` and `tested: false`.
- `PUT /parent/ai` (parent token **and** account password, using `ctx.checkPassword`) saves it; `DELETE /parent/ai` removes it.
- `POST /parent/ai/test` sends one fixed harmless prompt and reports success or the error, without echoing the key.
- **Server-side request forgery guard** on `base_url`: `https` only, except `http` to `localhost`/`127.0.0.1`/private
  ranges when `ALLOW_LOCAL_LLM=true` (default true off Vercel, false on Vercel). Resolve the host and refuse
  link-local and cloud metadata addresses (169.254.0.0/16). Never follow redirects.
- `routes/tutor.ts`: pick the provider per request: the family's own settings if present, else the server default.
  Build `new OpenAICompatTutor(fetch, familyOpts)`; the constructor already takes options.
- Hoot stays **off** for every child after a family first connects their own model until the parent turns it on again,
  and the screen shows the warning from `docs/FREE_AGENTS.md`. `GET /content/hoot` already reports `tested`.
- App: `app/src/app/parent/ai.tsx`, linked from the Account card. Presets for Ollama, LM Studio, OpenRouter, Groq, custom.
- Tests: the key never appears in any response, export (`GET /parent/export` must exclude it) or log; SSRF cases; wrong password.
- Update `docs/SECURITY.md` and `docs/legal/PRIVACY_NOTICE.md` (a new kind of data is stored; chats go to the provider the parent chose).

**Size.** M.

---

## T7. Red-team runner for own models

`server/src/hoot-redteam.ts` runs the 92 cases in `content/hoot-redteam.json` against Claude only. Make it use
`createTutor()` so it runs against whatever `.env` selects, print a pass rate per category, and write the report to
`server/redteam-report-<model>.md`. Add `npm run redteam` instructions to `docs/FREE_AGENTS.md` and
`docs/HOOT_SAFETY_TESTS.md`. **Sonnet medium, S.** A person must still read every reply in the report.

---

## T8. Standalone phone app with no server

**Owner's decision.** A standalone app with no server, with the option to connect to a server too.

**The hard part.** Today the server guards the answers, the PIN, the hint ladder and Hoot's safety checks. In a
standalone app all of that lives on the device, where a determined person can read it. That is acceptable for a
family's own phone (the "attacker" is their own child) but it must be said plainly in the docs, and the standalone
mode must not weaken the server mode.

**Design.**
- One interface, two backends. In `app/src/lib/api.ts` everything goes through `api(method, path, token, body)`. Add
  `app/src/lib/backend.ts`: `RemoteBackend` (today's fetch) and `LocalBackend`, chosen on first run ("Use on this
  device only" or "Connect to a server", with the server address typed by the parent).
- `LocalBackend` runs the **same route logic** on the device. The server's routes are Hono and Hono runs anywhere
  JavaScript runs: call `createApp({ db, content, tutor }).request(path, init)` in-process. What must be swapped:
  - `db`: an adapter over `expo-sqlite` implementing the `DB` interface in `server/src/db.ts` (`get`, `all`, `run`, `exec`).
  - `content`: bundle `content/` into the app as one generated JSON module (`scripts/bundle-content.mjs`).
  - Node-only APIs: `node:crypto` (scrypt, randomBytes, randomUUID) → `expo-crypto` plus a pure JS scrypt
    (`@noble/hashes`); `hono/jwt` works as is; `@hono/node-server/conninfo` is not needed locally.
  - Move the shared code to a `core/` package imported by both `server` and `app` (npm workspaces), or have Metro
    resolve `../server/src`. Decide in 8a and write it down.
- Hoot on the device: `OpenAICompatTutor` already only needs `fetch`. The key lives in `expo-secure-store`
  (Keychain/Keystore). A phone cannot run Ollama itself, but it can reach Ollama on the family's computer over home
  Wi-Fi (`http://192.168.x.x:11434/v1`; Ollama must be started with `OLLAMA_HOST=0.0.0.0`) or any hosted service.
- Parent email features (verification, password reset, wellbeing alert email) do not exist locally. Replace with: the
  PIN and a recovery phrase shown once at setup; a wellbeing alert shown in the parent area and as a local notification.
- Backup: export and import the family's data as a file (the export route exists).

**Split.** 8a (Opus high, M): shared `core/` package, DB adapter interface, proof that `createApp` runs under
Expo with tests passing in Node against the adapter contract. 8b (Sonnet medium, M): `expo-sqlite` adapter and content
bundling. 8c (Sonnet medium, M): first-run mode choice, local recovery phrase, local wellbeing notice. 8d (Opus high,
S): security review and `docs/SECURITY.md` section "Standalone mode: what protects what".

**Simpler path available today (no code).** The website already installs to the home screen and works offline for
opened lessons. A family can run the server on a home computer and open it from phones on the same Wi-Fi. Document
this in the README (done) so nobody waits for T8.

---

## T9. Sign language section

**Owner's decisions.** Teach **American (ASL), British (BSL), Indian (ISL) and Mexican (LSM)** sign languages. Show
signs with **vetted free videos, played inside our site where the owner allows embedding, otherwise a link out**. After
each video, a **quiz of 2 to 5 questions** depending on the video's length and type, to check it was watched.

**What cannot be delegated to AI.** An AI model cannot check that a signer is signing correctly. A person, ideally a Deaf
signer or a qualified teacher of that sign language, must choose and approve every video. AI can prepare the list of
candidates and build everything around it.

**What exists.** Lessons support `"video"` sections with a YouTube id, played in the privacy-enhanced player
(`app/src/components/VideoEmbed*.tsx`); `scripts/check-videos.mjs` checks a video is still embeddable; outside links
need the parent PIN under 13 (`ExternalLink.tsx`).

**Approach.**
1. New subject `sign` in `content/knowledge-map.json` (`bands`: all five), with outcomes per language: fingerspelling
   alphabet, numbers, greetings, family, feelings, school words, question words, everyday phrases, Deaf culture and etiquette.
2. A per-child setting `signLanguage` (`asl` | `bsl` | `isl` | `lsm`), default from the family's country (US → ASL,
   GB → BSL, IN → ISL, MX → LSM), changeable in the parent area. Lessons carry `"signLanguage": "asl"` and are filtered
   in `visibleTo` (`server/src/context.ts`).
3. Lesson shape: a short text introduction; one `video` section; a `text` section describing each sign in words
   (handshape, location, movement) for people who cannot see the video well; a `parent` note; a quiz.
4. Quiz length rule: videos under 2 minutes get 2 questions, 2 to 5 minutes get 3, 5 to 10 minutes get 4, longer get 5.
   Questions ask about what was shown ("Which handshape starts the sign for 'thank you'?"), so they cannot be answered
   without watching. Record `videoMinutes` (already in the schema).
5. Candidate sources to offer the human reviewer (check each one's embedding and licence terms yourself; do not assume):
   national Deaf associations and government or university channels for each language. In India, the Indian Sign
   Language Research and Training Centre publishes an ISL dictionary. Record for every video: channel, licence or
   permission, date checked, reviewer name.
6. "Explain lessons in sign language" (the owner's wider wish): add an optional `signVideoId` to any lesson, shown as
   "Watch this lesson in sign language". This only becomes real when signed versions of lessons exist; there is no
   honest automatic way to produce them. Build the slot, leave it empty.
7. A separate **Sign language** entry on the child home, and a line in `docs/NEEDS_APPROVAL.md` under Priority 1
   naming the reviewer needed for each language.

**Suitable agents.** A person for video choice and review. Sonnet medium for schema, the setting, the screen and quiz
writing once videos are chosen. **Size.** L. **Depends on** T1 (captions and text descriptions matter most here).

---

## T10. "Add your own lessons" for parents

**Goal.** A parent can add lessons they think their child needs.

**Works today.** Anyone who clones the repository can add a JSON file under `content/lessons/<band>/<subject>/`
(README, "Adding content") and run `npm run validate`.

**To build.** A form in the parent area (`app/src/app/parent/lessons.tsx`): title, age group, subject, text sections,
optional quiz questions each with three hints. Stored per family in a new table `family_lessons (id, parent_id, json,
created_at)`, validated with the existing `Lesson` zod schema, merged into what `visibleTo` returns for that family's
children only, marked "Added by your family" in the app. Limits: 100 lessons per family, 20 KB each. Family lessons
are private to that family and are included in export and deletion. **Sonnet medium, M.**

---

## T11. Android and iOS builds

**Goal.** People install the app without the owner hosting anything.

**Steps.**
1. Android APK that anyone can install directly: `cd app && npx eas build -p android --profile preview` (needs a free
   Expo account). Attach the APK to a GitHub Release. Add an `eas.json` with `preview` (APK) and `production` (AAB) profiles.
2. Google Play: a developer account (one-time fee), the Families policy forms, the data safety form.
3. iOS: an Apple Developer account (yearly fee) is required even for TestFlight. Without one, iPhone users use the
   installable website. Kids Category rules apply.
4. Until T8 is done the app needs a server address: add a first-run "Server address" field (small; can be done now by
   Sonnet medium) so a family can point the app at their own computer or host.
5. Write `docs/MOBILE.md` with these steps and the store checklists already in `docs/LAUNCH_CHECKLIST.md`.

**Suitable agents.** A person for accounts and store forms; Sonnet medium for `eas.json`, the server address screen and the doc.

---

## Handover notes

- **T0 (done).** `TUTOR_MODE=openai` uses `server/src/tutor-openai.ts`. `GET /content/hoot` tells the app which helper is
  active and whether it is tested. Not done in T0: a warning banner in the parent area that reads `/content/hoot`
  (small; fold into T6), and running the red-team set against a local model (T7). The provider was tested with a fake
  model server only; **no real Ollama was run**.
- **T1 (done).** Per-child display settings (`textScale`, `dyslexiaFont`, `highContrast`, `readAloudAuto`) live in
  `children` (migrations in `server/src/db.ts`), `ChildPatch`/`childPublic`, and `useChildDisplay()` in
  `app/src/lib/theme.ts`. `app/src/app/learn/[childId]/_layout.tsx` applies them and holds back the screens one frame
  until they are in place; new learning screens should use `scaledBandTheme(band)` instead of `bandTheme[band]`, and the
  `ui.tsx` components so the settings apply. OpenDyslexic (OFL) is web-only (`app/public/fonts`, rule in
  `app/public/index.html`); phones get wider spacing. Not done: native font bundling, a real keyboard-only and screen
  reader pass (needs a person), text scaling on the landing/sign-in screens. T9 must add captions/text for sign videos.
- **T4 (in progress).** b2 done: `b2-math-odd-even-tricks`, `b2-math-adding-nine-quick`, `b2-math-days-calendar`, `b2-think-number-patterns`;
  outcomes `b2-math-7`, `b2-math-8`, `b2-think-5` added to `content/knowledge-map.json` (edited by hand-insert to keep its
  compact layout; do not rewrite the file with a JSON dumper). The lessons were generated by a script that asserts every
  number with code first. After each band run the three generators, then fix doc counts (`check-doc-counts.mjs` lists
  the lines; also update `CLAUDE.md`). b3 done too (5 new lessons: divisibility rules, multiply by 11, estimate first, simple ratio, calendar repeats every 7 days; the sixth listed, logic grids, already existed as `b3-think-logic-grids`; outcomes `b3-math-6` to `b3-math-10`). b4 done too (10 lessons incl. Doomsday for 2000-2099; outcomes `b4-math-6`..`11`, `b4-think-5`..`8`; the generator asserts the Doomsday formula against `datetime` for every year 2000-2099). Remaining: b5 (11 lessons), whose Doomsday-in-full lesson should extend this one (century anchors and Zeller's formula). Weekday lessons: verify every worked
  example with `new Date(Date.UTC(y, m, d)).getUTCDay()`.
