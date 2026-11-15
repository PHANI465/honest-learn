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
   `node scripts/build-knowledge-doc.mjs`, `node scripts/bundle-content.mjs` (the phone app's content index), and update counts so
   `node scripts/check-doc-counts.mjs` passes.
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
| T2 | Quick facts between lessons | Haiku low (content), Sonnet medium (code) | S + S | none | **done** 14 Nov 2026 | 200 facts (40 per band), all draft; `FactCard`; `scripts/check-fact-sources.mjs`. A person must spot-check 1 in 5 |
| T3 | Daily spelling and vocabulary | Sonnet medium (code), Haiku low (word lists) | L | none | **done** 14 Nov 2026 | Server, screen and 605 words (120+ per band). Open: spellingVariant, reviewer pass |
| T4 | Quantitative aptitude and reasoning lessons | Sonnet medium | L | none | **done** 14 Nov 2026 | 30 lessons across b2 to b5; every band needs a human maths check |
| T5 | Games section: Sudoku, chess, memory games | Sonnet high | XL (split 5a to 5d) | none | **done** 15 Nov 2026 | 5a Sudoku, 5b chess and 5c memory games 14 Nov; 5d play chess against the computer 15 Nov (js-chess-engine, MIT, on the device). Not tried on a real phone |
| T6 | Own key in the parent area (BYOK screen) | Opus high | M | T0 | **done** 14 Nov 2026 | `parent/ai.tsx`, `ai-settings.ts`; no real model or hosted key tried; DNS rebinding open (`SECURITY.md`) |
| T7 | Red-team runner for own models | Sonnet medium | S | T0 | **done** 14 Nov 2026 | `npm run redteam`; a real local model has still not been run |
| T8 | Standalone phone app with no server | Opus high (design and core), Sonnet medium (screens) | XL (split 8a to 8d) | T6 | **done** 15 Nov 2026 (code) | 8a to 8d done 14 to 15 Nov 2026 ("On this phone only" works end to end: first-run choice, recovery phrase, wellbeing notice; [`STANDALONE.md`](STANDALONE.md)). Reviewed in 8d ([`SECURITY.md`](SECURITY.md), "Standalone mode"). **Not yet run on a phone: a person must try it in Expo Go** |
| T9 | Sign language section (ASL, BSL, ISL, LSM) | Person (videos) + Sonnet medium | L | T1 | **code done** 15 Nov 2026; lessons wait for a person | Setting, filter, validator rules, "watch in sign language" slot and [`SIGN_LANGUAGE.md`](SIGN_LANGUAGE.md) built. **No lessons**: a Deaf signer or qualified teacher must choose and approve videos, and every source checked needs permission |
| T10 | "Add your own lessons" for parents | Sonnet medium | M | none | **done** 14 Nov 2026 | `parent/lessons.tsx`; private to the family; no look at it in a browser yet |
| T11 | Android and iOS store builds | Person + Sonnet medium | M | T8 | **agent work done** 15 Nov 2026 | Build config checked and fixed, listing and form drafts in [`STORE_LISTING.md`](STORE_LISTING.md). Accounts, signed builds, the owner's decisions (section 2 there) and the forms need a person. Not built or run on a real phone |

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

**Owner's decision.** Lessons plus playable boards. A full chess game against the computer was done later, as 5d.

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

**5d. Play chess against the computer (Opus high, L). Done 15 Nov 2026** by Sonnet at the owner's go-ahead. Owner's decision:
**js-chess-engine** (MIT), not Stockfish (GPL-3.0, WebAssembly) and not a home-made engine. Why, and how it works: see the T5d
handover note below.

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
Expo with tests passing in Node against the adapter contract. **Done 14 Nov 2026**, without a `core/` package: the app imports
`server/src` directly; the decision and the rules are in [`STANDALONE.md`](STANDALONE.md). **8b done 14 Nov 2026** (the content is
bundled as an index of imports of `content/`, not a copied JSON module, so there is one copy). 8b (Sonnet medium, M): `expo-sqlite` adapter and content
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
- **T4 (done).** b2 done: `b2-math-odd-even-tricks`, `b2-math-adding-nine-quick`, `b2-math-days-calendar`, `b2-think-number-patterns`;
  outcomes `b2-math-7`, `b2-math-8`, `b2-think-5` added to `content/knowledge-map.json` (edited by hand-insert to keep its
  compact layout; do not rewrite the file with a JSON dumper). The lessons were generated by a script that asserts every
  number with code first. After each band run the three generators, then fix doc counts (`check-doc-counts.mjs` lists
  the lines; also update `CLAUDE.md`). b3 done too (5 new lessons: divisibility rules, multiply by 11, estimate first, simple ratio, calendar repeats every 7 days; the sixth listed, logic grids, already existed as `b3-think-logic-grids`; outcomes `b3-math-6` to `b3-math-10`). b4 done too (10 lessons incl. Doomsday for 2000-2099; outcomes `b4-math-6`..`11`, `b4-think-5`..`8`; the generator asserts the Doomsday formula against `datetime` for every year 2000-2099). Remaining: b5 (11 lessons), whose Doomsday-in-full lesson should extend this one (century anchors and Zeller's formula). Weekday lessons: verify every worked
  example with `new Date(Date.UTC(y, m, d)).getUTCDay()`.
  b5 done too (11 lessons: time and work, profit/loss, compound interest, permutations, probability, data interpretation, fast
  squaring, Doomsday in full + Zeller, syllogisms, seating, data sufficiency; outcomes `b5-math-6`..`13`, `b5-think-5`..`7`).
  Generators lived in the scratchpad and were not committed; to add lessons later copy the pattern: assert every number in
  code, hand-insert outcomes into `knowledge-map.json`, run the three generators, fix doc counts.
- **T2 (done).** Content: `content/facts/b1.json` to `b5.json` (40 facts each, 4 per subject for 10 subjects, all `"draft"`, every
  source a Wikipedia article); `content/facts/keywords.json` holds 1 to 3 key words per fact that must appear in the source
  article, used by `node scripts/check-fact-sources.mjs --text` (needs internet; checks that every link opens and that the
  key words appear; not run in CI). Server: `Fact`/`FactSet` in `server/src/content.ts` (a fact without an https source is
  rejected on load), `GET /children/:childId/facts?count=1..5&seen=id,id` in `routes/learn.ts` (random, skips seen ones,
  hides facts tagged `sensitive` until unlocked; none of the shipped facts use that tag), checks in `validate-content.ts`,
  tests in `server/test/facts.test.ts`. App: `app/src/components/FactCard.tsx` on the lesson result, the puzzle and practice
  results (via the new `after` prop of `QuizRunner`) and once on the child home; "Another fact" gives one more on request,
  there is no feed. Not done: offline caching of facts (the card simply does not show offline), a visual check at phone
  width, and the reviewer pass. The fact lists were written by Sonnet, not Haiku, and checked only for key words, so
  accuracy still needs a person.
- **T3 (done).** 3a (server), 3b (screen) and 3c (word lists: 120 to 122 words in each `content/spelling/<band>.json`, 3 levels,
  lower-case a-z only, `meaning` must not contain the word, `sentence` must contain it exactly; `npm run validate` checks both
  and warns below 120). To add words, append entries and re-run validate; keep out words that sound like another word
  or are spelled differently in British and American English. Logic is in
  `server/src/spelling.ts` (boxes due after 1, 3, 7, 16 days; a miss goes to box 0 due tomorrow; level up at 80% of a level in
  box 2 or higher; words a day b1 3, b2 4, b3 6, b4 8, b5 10), routes in `server/src/routes/spelling.ts`
  (`GET /children/:id/spelling/today?day=`, `POST .../spelling/check`, `GET /parent/children/:id/spelling`), tables
  `spelling_progress` and `spelling_days` (the day's words are chosen once and kept). Screen:
  `app/src/app/learn/[childId]/spelling.tsx` (four exercises: type, choose, unscramble, fill), card "Today's words" on the child
  home (`spellingAvailable` in `/home`), "Words learned" card in the parent child settings. **Decision by the owner:** each
  not-yet-tried word is sent in a `say` field for text-to-speech only; the app must never render it (see `docs/SECURITY.md`).
  Not done: the per-family `spellingVariant` (British or American) setting, so the lists avoid words that differ between
  them (colour, neighbour ...); offline use (the screen needs the internet); a visual check at phone width; a keyboard and
  screen reader pass; the b1 "tap the first letter sound" exercise (b1 gets choose and unscramble instead). A gap you could
  fill: wrong-answer distractors are generated by code, so a human should look at a sample for silly options.
- **T7 (done).** `server/src/hoot-redteam.ts` now builds its helper with `createTutor()`, so it follows `TUTOR_MODE` and the `.env`
  settings (Claude, own model, or mock); the old hard requirement for `ANTHROPIC_API_KEY` applies only when Claude is selected.
  It prints and writes an automatic pass rate per category (pre-check as expected and no automatic warning; explicitly not a safety
  verdict) and writes `server/redteam-report-<model>.md` (git-ignored). Tests: `server/test/redteam.test.ts` run the real command
  against a fake model server. **Not done:** no real Ollama or hosted model was run, so nobody knows yet how a small model scores;
  a person must read every reply in a real report. Docs updated: `docs/FREE_AGENTS.md`, `docs/HOOT_SAFETY_TESTS.md`.
- **T10 (done).** Server: `server/src/family-lessons.ts` (input schema, `buildFamilyLesson`, limits 100 lessons per family and 20 KB each,
  warnings such as a hint containing the answer), table `family_lessons`, parent-token routes `GET/POST /parent/lessons` and
  `PUT/DELETE /parent/lessons/:id`. A family lesson has the id `fam-<uuid>` and carries `family: true` and its `ownerId` inside the
  server only; `visibleTo` compares the owner with the child's parent, `ctx.visibleLessons(child)` returns built-in plus the
  family's lessons and is what the home, lesson list, review-due list, practice and parent overview use. Everything else
  (hints, checks, completion, Hoot, progress) goes through `lessonFor`, which now also finds family lessons, so the secrecy and hint
  ladder rules are unchanged. Editing a lesson clears the hints opened and questions solved for it (the questions may have moved);
  deleting removes its progress, hints, solved questions and Hoot chat. Family lessons are in `GET /parent/export` (`familyLessons`)
  and deleted with the account. App: `app/src/app/parent/lessons.tsx` (list + form), a card on the parent home, and an
  "Added by your family" pill on the lesson list and lesson screens. **Not done:** no sensitive-topic tag (the parent is
  responsible for the content; a family lesson is shown even if the topic is sensitive), no video sections, no outcomes (so family
  lessons do not feed "What they know"), no import or sharing between families, and the form has not been looked at in a browser
  or tried with a screen reader. A family lesson's text goes to Hoot's AI helper when a child asks Hoot about it (stated in the
  privacy notice).
- **T5a Sudoku (done).** Server: `server/src/games/sudoku.ts` (seeded generator, a solver that counts solutions so every puzzle has exactly one,
  the step finder behind the hints, hint texts), `server/src/routes/games.ts` (`GET /children/:id/games/sudoku`, `.../sudoku/:n?level=1..3`,
  `POST .../:n/check`, `POST .../:n/hint`), table `games_solved` (in the export, cascades on child delete). Grid size by age: b1 and b2 4x4,
  b3 6x6, b4 and b5 9x9; clues by level 9/7/6, 22/18/15, 38/32/27. Puzzles come from the seed `<childId>:<size>:<level>:<n>`, cached in memory
  only. `check` also records a finished puzzle. Hints use `hints_seen` (item `sudoku-<size>-<level>-<n>`, one "question" per hint chain, a
  new chain after the third hint); with a wrong number on the board the hints say to fix it first and never name the number. App: Games
  hub (`games/index.tsx`, card on the child home) and `games/sudoku.tsx` (level list, grid, number pad, notes, undo, check, hints, web keyboard:
  arrows, digits, Backspace; pictures instead of digits for ages 3 to 5). Content: five lessons (`b2-think-sudoku-rules`,
  `b3-think-sudoku-scanning`, `b4-think-sudoku-singles`, `b4-think-sudoku-pairs`, `b5-think-sudoku-x-wing`) with outcomes `b2-think-6`,
  `b3-think-5`, `b4-think-9`, `b4-think-10`, `b5-think-8`. Looked at in a real browser at phone width (6x6, check, hint, undo,
  keyboard entry). **Not done / for 5b to 5d:** the 4x4 picture mode and the 9x9 grid were not looked at on screen; notes mode and
  the solved screen were not clicked through; no screen reader pass; difficulty is by clue count only (a "hard" puzzle may still be
  solved with singles); the hint finder knows singles only, so on hard puzzles it falls back to naming the square with the fewest options;
  progress is not shown to parents. Pattern for the next games: a route module like `routes/games.ts`, a `games/<name>.ts` for the pure
  logic with tests, a card in `games/index.tsx`.
- **T5c memory and logic games (done).** All on the device, no server. Pure rules in `app/src/lib/games/` (`pairs.ts`, `sequence.ts`,
  `changed.ts`, `slide.ts`, `nonogram.ts`, each self-contained and taking a random function so tests can seed it) and tested from
  `server/test/memory-games.test.ts` (the app has no test runner; the tests import the app files with relative paths, so keep these
  modules free of `react-native` imports and of imports between each other). Screens in `app/src/app/learn/[childId]/games/`
  (`pairs`, `sequence`, `changed`, `slide`, `nonogram`), listed by age in `games/index.tsx`: Pairs 3 to 10 pairs by age; Copy the pattern
  3 to 6 buttons told apart by picture, name and colour, no game over, a wrong tap replays the pattern; Which one changed? a picture
  that stays until the child taps "I'm ready", with a peek button; Slide the tiles 3x3 (ages 6 to 11) and 4x4 (12+), boards made by
  sliding from the solved state so they are always solvable; Nonogram 5x5 (12 to 14) and 7x7 (15 to 18), generated with a solver
  that guarantees exactly one solution (checked against brute force on 4x4 in the tests, and independently on a live 7x7 in the
  browser). The "played" record is `lib/games/played.ts`: one count per game per child, on the device only, cleared on sign-out; no dates,
  streaks or scores. Looked at in a real browser at phone width: hub, Pairs (played to the end), pattern (replayed and repeated), spot
  the change (wrong guess and found), sliding tiles (solved), nonograms 5x5 and 7x7 (fill, cross, clear, ticks, finished). **Not done:**
  the youngest group (ages 3 to 5) has Pairs, pattern and spot-the-change but these were only looked at on the 9 to 11 screen
  size; no screen reader or keyboard pass; no sound; reduced-motion has nothing to disable because nothing moves, but the pattern
  highlight timing (750 ms, 1,000 ms for ages 3 to 5) has not been tried with real children; the in-memory shuffle uses
  `Math.random` so games are not repeatable (only the tests seed them).
- **T5b chess lessons and puzzles (done).** Dependency: `chess.js` 1.4.0 added to `server` and `app` (pinned; **licence is BSD-2-Clause, not MIT as
  this guide first said**; permissive, no dependencies, ~720 KB unpacked, pure JavaScript, no network). Server: `server/src/games/chess.ts`
  (puzzle type, `verifyPuzzle` exhaustive proof, `playStep` one-move-at-a-time checking, level by age: none at 3 to 5, level 1 at 6 to 8,
  levels 1 and 2 at 9 to 11, all three from 12), `server/src/games/compose-chess.ts` (`npm run compose:chess [seed] [levels]` rebuilds
  `content/chess/l1-l3.json` from named patterns: back-rank, queen/rook/two-rook mates, smothered mate, knight forks, skewers, queen/rook mates in
  two; each candidate is thrown away unless `verifyPuzzle` passes), routes `GET /children/:id/games/chess`, `.../chess/:puzzleId`,
  `POST .../move` (body `{step, from, to, promotion?}`; `fen` is the position after the child's move, `fenAfterReply` after Black's reply),
  `POST .../hint` (`{step, level}`; the puzzle's own three hints for the first move, then generic ones made from the line), solved puzzles in
  `games_solved` (game `chess`). The last move of a mate puzzle accepts ANY checkmating move. `npm run validate` and `test/chess.test.ts` re-prove
  all 32 puzzles. App: `app/src/components/ChessBoard.tsx` (8x8 tappable squares, Unicode pieces, legal squares shown, spoken labels like
  "White knight on g1") and `app/src/app/learn/[childId]/games/chess.tsx` (list, board, hints, explanation, next puzzle). Lessons:
  `server/src/games/gen-chess-lessons.ts` (`npm run compose:chess-lessons`) writes eight lessons and outcomes `b2-think-7`, `b3-think-6` to `8`,
  `b4-think-11` to `13`, `b5-think-9`, asserting every positional claim with chess.js first. Looked at in a real browser at phone width:
  list, mate in one (wrong move, all three hints, right move), mate in two (the reply, then the mate), a fork (explanation). A bug found
  and fixed there: the server first returned the position after Black's reply as `fen`, which the screen then tried to replay.
  **Not done:** castling, en passant and promotion are never needed by the puzzles (the board auto-promotes to a queen); no sound, no
  screen reader or keyboard pass; no pins or discovered-attack puzzles (the verifier only proves mates and 4-ply material wins); many
  positions are sparse endgames because they are composed, not taken from games; the Lichess puzzle database (CC0) was not used and could
  add natural positions later; levels use "mate in two" only (no mate in three).
- **T6 (done).** Server: `server/src/ai-settings.ts` (key encryption: AES-256-GCM, HKDF-SHA256 from `AI_KEY_SECRET` or the token secret, salt
  and GCM additional data = parent id, stored as `v1.<iv>.<tag>.<ct>`; `classifyIp`, `checkBaseUrl`, `checkResolvedHost`, `guardedFetch` (re-checks the
  resolved address before every request, `redirect: "error"`); the zod input; `publicSettings` (never the key); `errorCategory`), table `ai_settings`
  (cascades with the parent), `server/src/routes/parent-ai.ts` (`GET/PUT/DELETE /parent/ai`, `POST /parent/ai/test`, 10 tests per family per hour), and
  `routes/tutor.ts` builds `new OpenAICompatTutor(guardedFetch(), tutorOptions(row))` per request when the child's parent has settings (the pre-check
  still runs first and skips the lookup). Config: `AI_KEY_SECRET`, `ALLOW_LOCAL_LLM` (default on, forced off on Vercel). Decisions taken while building,
  not in the spec: saving needs the account password as well as the PIN; a stored key is kept only when the new address has the same **origin**
  (scheme, host and port), otherwise it is deleted and must be typed again; saving any change turns Hoot off for **every** child of the family (the
  response says how many); `lastFour` is only stored for keys of 16+ characters; the test sends one fixed prompt to the reply model and the safety model
  and returns only categories. Export: `ownAiModel` without `key_cipher`. App: `app/src/app/parent/ai.tsx` (presets, warning, "I have read the warning"
  tick box, masked key with last four, remove-key tick box, test results, stop using it), linked from the Account card. Tests:
  `server/test/own-key.test.ts` (19, also on PGlite), with a fake model server on 127.0.0.1 and every console line captured. Looked at in a real browser
  at phone width: save with Ollama preset (Hoot turned off for 5 demo children), test (could not connect, as no Ollama runs), a metadata address
  refused, stop using it. **Not done:** no real Ollama, LM Studio, OpenRouter or Groq was connected, so the presets' addresses are from their docs only;
  DNS rebinding is not prevented (pin the checked IP with an undici `Agent` `connect.lookup` to close it); `GET /content/hoot` still describes only the
  server's default helper, so the child-side "not tested" banner does not know about a family model (the parent screen says it); no screen reader pass.
  T8 can reuse `checkBaseUrl` and `classifyIp`, but a phone app with no server will need its own key storage (SecureStore), not this table.
- **Open source licences screen (done 15 Nov 2026, by Sonnet; item from `PERSON_CHECKLIST.md` part 9).** Why: the app ships software whose licences (MIT, BSD-2-Clause, ISC, OFL ...) ask for their
notice to be shown with the app, and the website served the Manrope font without its licence. `scripts/build-licences.mjs` builds the Android, iOS and web bundles with source maps (about 40 seconds), reads which
packages are really in them (the maps are indexed: sources are inside each section; Metro writes paths like `/node_modules/x/y.js`, relative to `app/`), adds the app's direct dependencies, reads each package's own
licence file and copyright lines, groups identical texts and writes `app/src/content/licences.generated.ts` (68 entries: 66 packages and 2 fonts, 10 licence wordings) and `THIRD_PARTY_NOTICES.md`.
**The guard:** it exits with an error if any shipped package has no licence, one outside the permissive list (MIT, ISC, BSD-2/3, Apache-2.0, 0BSD, CC0, Unlicense, BlueOak, OFL, Python-2.0), no licence text,
or no copyright holder, and if a package in a bundle cannot be found on disk. Seven packages ship no licence file (`expo-router`, `standard-navigation`, five `@react-native/*`): they get the standard text of their declared licence
and the copyright lines of the author or of a sibling package from the same repository (`react/react-native` and the older `facebook/react-native` URL are treated as one project); each such entry says so on the screen and in the file. Sorting is by plain
character order (never `localeCompare`) so the output is identical on every machine; two installed copies of one version are one entry. Screen: `app/src/app/licences.tsx` (public, like the privacy notice; one card per licence wording,
expandable to its packages and the full text), linked from the website footer, sign-up, the native welcome screen and the parent area Account card. Fonts: `app/public/fonts/Manrope-LICENSE.txt` added (the bundled Manrope files are
byte-identical to `@fontsource/manrope` 5.3.0: "Copyright 2019 The Manrope Project Authors", OFL-1.1). Tests: `server/test/licences.test.ts` (6, reads the committed output: only permissive licences, every entry complete, every
direct dependency and every server package the app bundles is listed, fonts and their licence files, the notices file in step; mutation checks showed a GPL entry and a missing `hono` both fail). CI: the app job runs the generator and
`git diff --exit-code` (not yet run on Linux CI). Looked at in a browser: the page, expanding BSD-2-Clause to see `chess.js`'s copyright and text, the footer link, and both font licence files being served. **Not covered, written on the page and in the file:** the native libraries
React Native and Expo bring into the Android and iOS builds (for example networking and image libraries, several Apache-2.0): they can only be listed once a real build exists, with the platform's licence tooling; whether this is enough is a question for a lawyer
(`PERSON_CHECKLIST.md` part 4). Adding a dependency now means running `node scripts/build-licences.mjs` and committing the result.
- **T9 sign language (code done by Sonnet; the content needs a person).** Nothing was invented: no sign descriptions, no lessons, no videos, because nothing here can check
that signing is correct (the guide's rule). Built, all in [`SIGN_LANGUAGE.md`](SIGN_LANGUAGE.md): `signLanguage` (asl, bsl, isl, lsm), `signVideoId` ("Watch this lesson in
sign language", an empty slot until signed versions exist) and `signReviewer` on `Lesson`; `videoChannel` and `videoLicence` on video sections; `children.sign_language`
(null = decided by the family's country: US asl, UK/GB bsl, IN isl, MX lsm, anything else none until the parent chooses) with `childSignLanguage()` and `signLanguage` plus
`signLanguageChoice` in `childPublic`; `ctx.getChild` and `ctx.listChildren` now join the parent's country (`parent_country` on `ChildRow`); `visibleTo()` hides lessons in
another sign language (listing and opening by id); `GET /content/map` returns `signLanguages` (languages that have lessons); the parent's "Sign language" card appears
only when that list is not empty. `loadContent()` enforces for sign lessons: a video and a text section, `videoMinutes`/`videoChannel`/`videoLicence`/`videoCheckedOn`, the quiz length
rule (under 2 min 2 questions, 2 to 5 min 3, 5 to 10 min 4, more 5), and a `signReviewer` (deaf-signer or qualified-teacher) before `reviewed`. Tests: `server/test/sign-language.test.ts`
(18, fixture lessons built inside the test; a mutation check showed the filter tests fail without the filter). Looked at in a browser against a temporary copy of the content
with fixture lessons (outside the repository, deleted): the setting card, the "Sign language" subject tile, only the child's language listed, the signed-version card and the
lesson video. **Deliberately not done:** the `sign` subject and its outcomes are not in `content/knowledge-map.json` (an outcome with no lesson would show as "not started" for every
child; the first reviewed lesson adds them, recipe in `SIGN_LANGUAGE.md` section 3); no separate child-home entry (the subject tile appears by itself). **Research (15 Nov 2026)**: five
sources' own terms were read and are summarised in `SIGN_LANGUAGE.md` section 4: **every one requires permission or says no**: ISLRTC (permission needed to reproduce), BSL SignBank (copyright UCL
DCAL, no licences, own-site videos so link-out only), NAD (written permission), Lifeprint (explicitly no app use or embedding, and asks not to be asked) and Mexico's SEP (all rights reserved; the LSM
dictionary found is a PDF). The data.gov.in dataset page timed out and was not read. A permission-request draft is in section 5; **a person must send it**. **Needs a person:** a reviewer per language
(also in `NEEDS_APPROVAL.md` section E), the permission replies, the first videos, captions on videos.
- **T5d play chess against the computer (done, by Sonnet at the owner's go-ahead; the guide had recommended Opus high).** **Owner's decision (15 Nov 2026):
js-chess-engine 2.4.6** (MIT, no dependencies, plain JavaScript, about 400 KB), added to `server/package.json` (exact version). Options put to the owner:
Stockfish (`stockfish` on npm is GPL-3.0 and about 205 MB unpacked, the Lichess build AGPL; either would make the project GPL, and a WebAssembly engine
probably cannot run in the standalone phone app because Hermes has no WebAssembly, **not verified**) and writing our own. The project still has **no
licence file**, so "compatible with the project licence" is an open question for the owner whatever engine is used.
**Where it runs: on the device**, like the memory games (T5c): no secret answers to protect, a search is real CPU work that a server would pay for on every
move of every child (a denial-of-service risk), and standalone mode has no server. The logic is `server/src/games/computer-opponent.ts` (kept under `server/`
so the server's CI can test it; the app imports it by relative path like the standalone API; `app/metro.config.js` watches `js-chess-engine` too). **chess.js
judges every move**: the engine only suggests, and a suggestion that is not a legal move (or an engine that throws or returns rubbish) is replaced by a random
legal move, so an engine bug can never corrupt a game; promotion is always a queen (the board has no menu, as in the puzzles). Four levels (the engine's 1 to 4;
5 is left out: 20 to 40 MB of cache and a 12-ply search): Beginner, Easy, Medium (ages 6 to 18), Hard (ages 12 to 18 only); the easiest is the default. Measured on a
laptop (Node 22): every level answers in under 70 ms; over 20 games each, level 1 almost never loses to a random mover but rarely finishes (19 draws, 1 win), level 2
wins 18 and level 3 all 20; level 3 beat level 1 ten games to none; no illegal move in any game. `computer-opponent.ts` also has `gameOutcome`, kind
`outcomeMessage` (no scores or ranks; losing is met with "everyone loses games while they learn"), `describeMove` ("Knight from g8 to f6, capturing a pawn. Check",
for the screen reader) and `takeBack` (removes the child's last move and the computer's reply). Screen: `app/src/app/learn/[childId]/games/computer.tsx` (choose level
and colour, board, "Take back my move", end card); the game is only the list of moves in React state, everything else is derived from it; the computer "thinks" at
least 450 ms so it never answers the instant a piece is released; a result adds one to the games hub's "finished n times" (a count only, as in T5c). `ChessBoard` has a
new `flipped` prop (a child playing Black sees their pieces at the bottom). The hub now reloads its counts when it regains focus (a pre-existing bug: finished games
did not show until the screen was reopened). Tests: `server/test/computer-opponent.test.ts` (25: whole games at every level with every move from the engine and
legal, mate in one and a free queen at levels 2 to 4, promotion for both colours, castling and en passant, seven kinds of failing engine, every way a game ends,
moves in words, take back); the engine also plays 24 legal moves inside the Node-free sandbox of `npm run proof:local` (27 steps now). Looked at in a browser at
phone width: setup, White (e4, the computer's Nf6, take back), Hard as Black (board flipped, the computer moves first, "You are in check!", checkmate end card), the
hub count. The website loads the engine only on this screen (a 70 KB chunk of its own); the Android bundle grew by about 70 KB. **Not done / unverified:**
**nothing was run on a real phone**, so Hermes speed and memory are unknown (a search with no JIT can be many times slower than the 70 ms measured; Hard is limited to
ages 12+ for that reason and may need a lower cap); no hints, analysis or "best move"; no clock; a game in progress is lost if the child leaves the screen (nothing is
saved); no choice of promotion piece; no human has judged whether "Beginner" is fair for a six-year-old; no screen reader or keyboard pass; the engine's README says Node
24 or newer and browsers while this project runs Node 22 (all tests pass, re-check on upgrades); chess.js is now bundled twice (the app's copy for the board, the
server folder's copy for this logic), harmless but about 70 KB wasted. Ideas for later: save an unfinished game, a hint that points at a piece (not a move), a
post-game "what happened" with the move list.
- **T8a (done).** Decision: **no `core/` package**; Metro reads `../server/src` (`app/metro.config.js` watches `server/src` and only
  `hono`, `zod`, `chess.js`, `@noble` from `server/node_modules`), the app's `tsconfig` allows `.ts` imports, and CI's app job installs the
  server's packages. Everything machine-specific goes through `server/src/platform.ts` (`pf()`, `setPlatform()`): `platform-node.ts`
  (Node, loaded with `process.getBuiltinModule` so it can sit in a phone bundle) and `platform-portable.ts` (`@noble/hashes` and
  `@noble/ciphers` 2.4.0, added with the owner's OK; `contentFromFiles()`; own `isIP`; HS256 tokens byte-identical to `hono/jwt`).
  `bytes.ts` replaces `Buffer`. Moved: `ClaudeTutor` and `createTutor()` to `tutor-claude.ts` (server only); helplines and content are read
  through the platform; `db.ts` exports `DbAdapter` and `openWithAdapter()`; `createApp({ device: true })` leaves out CORS. Found and fixed by
  the proof: Hono rebuilds a response from `response.body` when middleware touches `c.res` before `next()` (CORS did) or calls `c.header()`
  after it (our no-store header did); React Native's `Response` has no `body`, so the phone got empty bodies. Also hardened: the Node AES-GCM
  open now refuses tags shorter than 16 bytes. Tests: `test/platform-contract.test.ts` (17), `test/db-contract.test.ts` (15: SQLite, PGlite,
  a hand-made adapter), `test/portable-core.test.ts` (5: esbuild bundles `createApp()` for a browser target and fails on any Node import or
  global; a family's main paths with content handed in as files); `npm run test:portable` (the whole suite on the portable crypto);
  `cd app && npm run proof:local` (17 steps: Expo's Android bundle of `app/src/local/core.ts` run in a sandbox with only React Native's globals
  and `whatwg-fetch`). All in CI. `esbuild` (already installed by `tsx`) is now a declared dev dependency of `server`. **Not done / for 8b:**
  the expo-sqlite adapter (add it to `db-contract.test.ts`; set `PRAGMA foreign_keys = ON`), `scripts/bundle-content.mjs`, installing
  expo-crypto's `getRandomValues`, a real run in Hermes on a phone (scrypt speed there, `URL`, `TextDecoder`, `AbortSignal.timeout`). For 8c:
  nothing in the app imports `src/local/` yet; email features print to the console in device mode; the token secret is generated into the
  device database and should move to expo-secure-store. For 8d: the known differences table in `STANDALONE.md` section 5.
  **Watch:** one run of `npm run test:portable` reported 1 failed test out of 286 (the output was not kept, so which test is unknown);
  ten more full runs on both platforms, some under heavy load, all passed. If CI shows it, keep the output and look at time-window tests first.
- **T8b (done, by Opus at the owner's go-ahead).** `expo-sqlite` ~58.0.17 and `expo-crypto` ~58.0.8 added with `npx expo install`
  (both MIT, both in Expo Go; `expo install` also added expo-sqlite's config plugin to `app.json`). `app/src/local/sqlite-adapter.ts`
  (`expoSqliteAdapter(db)`: takes anything shaped like expo-sqlite's `SQLiteDatabase`, so the server's `test/db-contract.test.ts` runs the
  same code over a node:sqlite stand-in; switches `PRAGMA foreign_keys = ON` and refuses to open if it did not take; maps `null` rows to
  `undefined`). Lesson learned: `node:sqlite` switches foreign keys on by default, unlike SQLite and expo-sqlite, so the Node stand-ins now
  open with `enableForeignKeyConstraints: false`; a mutation check confirmed the contract fails an adapter that forgets the pragma.
  `scripts/bundle-content.mjs` writes `app/src/local/content-files.generated.ts` (239 imports; CI checks it is fresh; the fourth generator in
  `CLAUDE.md`). `app/src/local/device.ts`: `openDeviceApi()` = expo-sqlite file `honest-learn.db` + expo-crypto `getRandomValues` (in
  1 KB pieces; never `getRandomBytes`, which falls back to `Math.random` in development) + bundled content. `metro.config.js` also watches
  `content/`. The proof (`npm run proof:local`) now uses the bundled content and the expo-sqlite adapter inside the bundle, 20 steps,
  including deleting the child and checking the database holds nothing about them. `device.ts` bundles for Android and iOS with
  `expo export:embed` (about 2.6 MB minified with React Native). **Not done / for 8c:** nothing calls `openDeviceApi()` yet; the app's
  `api()` in `app/src/lib/api.ts` still always uses `fetch` (add the `LocalBackend` switch from the T8 design, chosen on first run next to
  the existing Server address screen); emails print to the console in device mode (replace with the recovery phrase and the in-app wellbeing
  notice); move the token secret to expo-secure-store. **Never verified:** a real phone or emulator (Hermes, the real expo-sqlite, scrypt
  speed, `URL`, `TextDecoder`, `AbortSignal.timeout`): the first thing 8c should do is run `openDeviceApi()` once in Expo Go.
- **T8c (done, by Opus at the owner's go-ahead).** Owner's decision (14 Nov 2026): the wellbeing alert is **in-app only**, no phone notification
  (a child could read it on a shared phone; it would need expo-notifications and a permission prompt; Apple's Kids Category). Server
  (all behind `createApp({ device: true })`, i.e. `ctx.device`): sign-up returns `recoveryPhrase` and sends no email; `POST /auth/recover`;
  `POST /parent/recovery-phrase` (PIN + password); email routes 404 `not_on_this_device`; `NoMailer`. Both modes: `wellbeingAlerts` per
  child in `/parent/overview`, `POST /parent/children/:id/wellbeing-seen`, `attention` in `GET /family`. Migrations: `parents.recovery_hash`,
  `children.wellbeing_seen_at`. App: `lib/server.ts` now holds the mode (`hl.mode`: `device` or `server`; a phone with a saved server address
  from before keeps `server`), `needsSetup()` replaces `needsServerAddress()`; `lib/api.ts` sends device-mode requests to
  `lib/local-backend.native.ts` (opens `local/device.ts` on first use; the `.ts` twin for the web rejects, so the website bundle is unchanged:
  checked, same 862 modules); `local/device.ts` keeps the token and AI-key secrets in expo-secure-store and passes them to `createLocalApi`
  (`secrets`). Screens: `start.tsx` (first-run choice), `recover.tsx`, `components/RecoveryPhrase.tsx` (shown after sign-up and in the
  parent area), sign-up and login wording for the phone, the wellbeing card in `parent/index.tsx`, a neutral line on `profiles.tsx`.
  Fixed in passing: `parentApi` treated a mistyped account password (401 `wrong_password`) as an expired PIN and locked the parent area.
  The privacy notice has a new "Using the app on one phone only" section (lawyer question added). Tests: `server/test/standalone.test.ts`
  (8, on SQLite, PGlite and the portable crypto); the proof is now 26 steps. Looked at in a browser at phone width (server mode, the only
  mode the website has): the neutral line on the profile picker, the notice in the parent area, "I have checked in" clearing both.
  **Not tested:** every standalone screen on a phone (start, sign-up with the phrase, recover, the parent-area phrase form): they are
  type-checked and linted only, because the website cannot enter standalone mode. **First thing for 8d or a person:** install the app in
  Expo Go (`cd app && npx expo start`, scan the QR code), choose "On this phone only", sign up, write down the phrase, add a child, do a
  lesson, ask Hoot something worrying, check the notice, then reset the password with the phrase.
- **T8d (done).** Security review of standalone mode, written up in `docs/SECURITY.md` ("Standalone mode: what protects what", findings
  20 to 24). Owner's decisions (15 Nov 2026): **keep the phone's own backups** (Android and iCloud may include the database; the privacy notice and
  the first-run card now say so) and **one family per phone**. Fixed: on a phone, after `config.security.deviceLockoutsBeforeReset` (2) lockouts in a
  row the PIN needs the password (`pin_reset_needed`) and the password needs the recovery phrase (`password_reset_needed`; sign-in, PIN reset and
  `checkPassword` all refuse), because the phone's clock can be moved to end a timed lock; sign-up on a phone with a family answers 409
  `phone_has_family`; the phone adapter sets `PRAGMA secure_delete = ON`. Checked with `npx expo config --type introspect`: Android `allowBackup` is on
  and expo-secure-store's backup rules exclude its keys. Tests: 5 more in `server/test/standalone.test.ts` (each rule also in server mode, to
  show servers are unchanged), 1 in `db-contract.test.ts`. Accepted and documented: answers readable by anyone who unpacks the app; offline
  guessing of the PIN or a weak password from a copy of the database file; daily limits reset by moving the date; no DNS check for an own model
  address; no phone notification for wellbeing alerts. **Open for a person:** run standalone mode on a real phone (the checklist in the T8c note),
  including a backup and restore on Android; consider whether a 30-day sign-in makes sense on a phone (the family must type the password monthly).
- **T11 second pass (15 Nov 2026, by Sonnet): the build configuration was checked and three things fixed; the store listing and form answers are drafted.** Findings and changes, all in
`app/app.json` unless noted: the generated Android manifest asked for `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW` and `VIBRATE`, none used by the app, so they are now in
`android.blockedPermissions` (a real `expo prebuild` showed only `INTERNET` left; the generated `android/` folder was deleted again); the iOS build carried a Face ID permission text from the
secure-storage plugin's default (`faceIDPermission: false` now); `ios.privacyManifests` now declares no tracking and the required-reason APIs taken from the installed libraries' own
`PrivacyInfo.xcprivacy` files (the installed packages declare no tracking and no collected data); seven patch-level Expo packages were aligned with `npx expo install --fix` (`expo-doctor` is 20 of 20;
that also added the `expo-status-bar` plugin entry and re-hoisted `package-lock.json`). `expo prebuild` also rewrote the `android` and `ios` scripts in `package.json`; that was reverted. Android, iOS and web
bundles, the type check, lint and the 27-step Node-free proof all pass after the changes. **New: [`STORE_LISTING.md`](STORE_LISTING.md)**: what was checked, seven decisions for the owner (which
way the store app works and whether a project server exists, Kids Category versus a normal Education listing because the app serves 3 to 18 while the Kids bands stop at 11, **export compliance**
because standalone mode ships its own AES-GCM and scrypt code while `ITSAppUsesNonExemptEncryption` is `false`, public privacy and account-deletion pages that Google Play requires and that do not exist,
a splash screen package, the version label, support contact), listing text, suggested Play and App Store answers for both cases (standalone only; with a project server), reviewer notes, the
assets a person must make, and release steps. **Not done:** no EAS build, no APK installed, no iOS native project (needs a Mac), nothing run on a real phone, no screenshots or feature graphic,
no splash screen, and none of the form answers is an attestation anyone has made. **Needs a person:** the accounts, every item in `STORE_LISTING.md` section 2, a lawyer's reading of the privacy
answers (two open questions are listed in section 4 there), real-phone testing of the `preview` APK, and the screenshots.
- **T11 (first pass, 14 Nov 2026; T8 has been done since, see the second pass above).** `T8` was not done then, so the phone app still needed a server; the guide's step 4 (a first-run server
  address) is built: `app/src/lib/server-address.ts` (pure rules: normalising, `https` outside the home network and `http` only for localhost and
  private addresses, finding the server at the root or under `/api`, a `/health` probe with a timeout; tested in `server/test/server-address.test.ts`),
  `app/src/lib/server.ts` (the address is kept in storage key `hl.serverUrl`; `apiBase()` replaces the old `API_URL` constant everywhere; on the website
  it is unchanged), `app/src/app/server.tsx` (the screen), `app/src/app/index.tsx` (redirects there when a phone app has no server), a "Server settings"
  button on the native welcome screen, and `reloadContent()` in the session. Owner's decision (14 Nov 2026): store builds allow local `http`; this uses the
  `expo-build-properties` plugin (MIT, Expo-maintained, added to `app/package.json`) with `usesCleartextTraffic` on Android and `NSAllowsLocalNetworking` plus a
  local-network usage text on iOS; the app itself refuses `http` for public addresses. `app/eas.json` now has `preview` (APK, no built-in server) and `production`
  (AAB, `autoIncrement`), with the placeholder `*.example` addresses removed. `docs/MOBILE.md` has the steps and the store checklists. **Needs a person:** an Expo
  account and a real `preview` build, a Google Play developer account (forms: target audience, data safety, content rating), an Apple Developer account
  (Kids Category, privacy answers, TestFlight), store assets and a lawyer-approved privacy notice. **Not tested:** any real EAS build, an APK on a phone, the Server
  address screen on a device (it is web-hidden, so it was only type-checked and its rules unit-tested), `http` to a computer on a real network, iOS. T8 will
  replace the need for a server; this screen can stay as the "connect to a server" option the owner asked for. Also noticed: `npx expo-doctor` reports 7
  packages out of date (not touched).
