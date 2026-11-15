# Honest Learn: notes for Claude Code

Free, ad-free learning app for ages 3–18 (iOS, Android, web) with a parent-controlled account, a hint-only AI helper ("Hoot") and 218 draft lessons. Owner: PHANI465. Nothing is public-launch ready until humans approve the content (see `docs/NEEDS_APPROVAL.md` and issue #1).

## Layout
- `server/`: Hono API on Node 22 (TypeScript via tsx). `src/app.ts` wires shared protections and mounts `src/routes/*` (public, auth, learn, puzzles, usage, tutor, parent); shared helpers in `src/context.ts`, shapes and input rules in `src/models.ts`. The same code also runs inside the app (standalone mode, T8): machine-specific things go through `src/platform.ts` (see `docs/STANDALONE.md`). SQLite locally; Postgres (Neon) when `DATABASE_URL`/`POSTGRES_URL` is set; in-memory demo DB on Vercel without one.
- `app/`: Expo SDK 58 + expo-router (routes in `app/src/app`). Web export in `app/dist`. The website landing page is `welcome.web.tsx` (+ `src/landing/`); the native app uses `welcome.tsx`. Landing copy may only use facts from the app's content or docs.
- `content/`: the curriculum as JSON: `knowledge-map.json` (5 age bands × 11 subjects, 262 outcomes), `lessons/<band>/<subject>/*.json`, `puzzles/<band>.json`, `facts/<band>.json` (quick facts, each with a source link), `spelling/<band>.json` (daily spelling words), `chess/l1-l3.json` (chess puzzles, composed and proven by `server/src/games/`), `resources.json`, `helplines.json`, `hoot-redteam.json`.
- `docs/`: `guide/` (what's built, where it lives, how it works, navigation, scaling), `SECURITY.md`, reviewer guide, approval list, launch checklist, deployment, legal drafts, research.
- `scripts/`: generators and checkers (see below).
- **What needs a person (decisions, real-phone tests, expert review, legal, accounts, stores):** `docs/PERSON_CHECKLIST.md`.
- **Next work:** `docs/AGENT_TASKS.md` (status board, one section per task, which model and effort to use). Technical overview: `docs/TECHNICAL.md`. Own-model setup for Hoot (`TUTOR_MODE=openai`, Ollama etc.): `docs/FREE_AGENTS.md`, code in `server/src/tutor-openai.ts`.

## Commands
```bash
cd server && npm test            # API tests (SQLite); `npm run test:pg` runs the same on Postgres via PGlite (one file at a time; works on Windows)
cd server && npm run validate    # validates all content; warns on hints that contain the answer
cd server && npm run test:portable  # all API tests on the phone app's pure-JavaScript crypto
cd app && npm run proof:local     # Expo's Android bundle of the API runs without Node.js
cd server && npx tsc --noEmit
cd server && npm run dev         # API on :8787 (mock tutor unless ANTHROPIC_API_KEY is set)
npm run dev                      # repo root: install, build website, serve website + API on :3000 (what v0 uses)
cd app && npx tsc --noEmit && CI=1 npx expo lint
cd app && npx expo start         # w = web; scan the QR code with Expo Go on a phone
node scripts/build-catalogue.mjs     # README "What's inside" (CI fails if stale)
node scripts/export-review-sheet.mjs # docs/review/*.csv (CI fails if stale)
node scripts/build-knowledge-doc.mjs # docs/KNOWLEDGE_MAP.md (CI fails if stale)
node scripts/bundle-content.mjs      # app/src/local/content-files.generated.ts, the phone app's content index (CI fails if stale)
node scripts/check-doc-counts.mjs    # docs must agree with content counts (CI)
node scripts/seed-demo.mjs           # demo family on a running local API; see docs/TRY_IT.md
```
After changing content, run all four generators before committing (`bundle-content.mjs` only changes when files are added, removed or renamed).

## Rules that must not be broken
- **Never send quiz answers, hints or explanations to the app before they're earned.** The server keeps them; the app asks `/check` and `/hint`. Offline caching must strip them.
- **Hint ladder:** nudge → bigger hint → worked example of a *different* problem with a *different* result. Never the answer. Correct option is always first in the JSON (`"answer": 0`); the server shuffles options per child.
- **Sensitive topics** (`religion`, `body`, `politics`) are hidden server-side until a parent unlocks them with the PIN. Teach descriptively and with multiple perspectives.
- **Parent PIN** gates settings, sensitive topics, chat review, outside links (under 13), extra screen time, export/delete.
- **No ads, no third-party analytics, no selling data, no streaks or leaderboards.**
- New or edited content stays `"status": "draft"` until two human reviewers approve it.
- Hoot replies pass a second safety/answer-leak check; `precheck()` in `server/src/tutor.ts` handles personal info and wellbeing messages before any AI call.
- The server records opened hints (`hints_seen`); answers are revealed only after all three, in order. Never trust the app's `hintsUsed` alone.
- **Code that `createApp()` loads must not use Node APIs** (`node:*`, `Buffer`, `process`, `require`, `import.meta`): use `pf()` from `server/src/platform.ts` and `bytes.ts`. Middleware must not touch `c.res` before `next()` or call `c.header()` after it (phones lose the body). `test/portable-core.test.ts` enforces the first.
- Tokens carry a session version (`v`); bump it with `revokeSessions()` to sign out every device. Website security headers live in `server/src/web-headers.ts` and must match `vercel.json` (a test checks).

## Deployment
Pre-launch mode is the default (drafts shown, no email verification, token secret auto-generated in the DB); `LAUNCH=true` switches to strict launch defaults.
Vercel project at the repo root (`vercel.json`): web app static from `app/dist`, API as a function under `/api`. See `docs/DEPLOYMENT.md` for env vars and how to attach Neon Postgres.
