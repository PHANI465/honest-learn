# Honest Learn: notes for Claude Code

Free, ad-free learning app for ages 3–18 (iOS, Android, web) with a parent-controlled account, a hint-only AI helper ("Hoot") and 175 draft lessons. Owner: PHANI465. Nothing is public-launch ready until humans approve the content (see `docs/NEEDS_APPROVAL.md` and issue #1).

## Layout
- `server/`: Hono API on Node 22 (TypeScript via tsx). `src/app.ts` wires shared protections and mounts `src/routes/*` (public, auth, learn, puzzles, usage, tutor, parent); shared helpers in `src/context.ts`, shapes and input rules in `src/models.ts`. SQLite locally; Postgres (Neon) when `DATABASE_URL`/`POSTGRES_URL` is set; in-memory demo DB on Vercel without one.
- `app/`: Expo SDK 58 + expo-router (routes in `app/src/app`). Web export in `app/dist`.
- `content/`: the curriculum as JSON: `knowledge-map.json` (5 age bands × 11 subjects, 220 outcomes), `lessons/<band>/<subject>/*.json`, `puzzles/<band>.json`, `resources.json`, `helplines.json`, `hoot-redteam.json`.
- `docs/`: `guide/` (what's built, where it lives, how it works, navigation, scaling), `SECURITY.md`, reviewer guide, approval list, launch checklist, deployment, legal drafts, research.
- `scripts/`: generators and checkers (see below).

## Commands
```bash
cd server && npm test            # API tests (SQLite); also `npm run test:pg` if present (Postgres via PGlite)
cd server && npm run validate    # validates all content; warns on hints that contain the answer
cd server && npx tsc --noEmit
cd server && npm run dev         # API on :8787 (mock tutor unless ANTHROPIC_API_KEY is set)
npm run dev                      # repo root: install, build website, serve website + API on :3000 (what v0 uses)
cd app && npx tsc --noEmit && CI=1 npx expo lint
cd app && npx expo start         # w = web; scan the QR code with Expo Go on a phone
node scripts/build-catalogue.mjs     # README "What's inside" (CI fails if stale)
node scripts/export-review-sheet.mjs # docs/review/*.csv (CI fails if stale)
node scripts/build-knowledge-doc.mjs # docs/KNOWLEDGE_MAP.md (CI fails if stale)
```
After changing content, run all three generators before committing.

## Rules that must not be broken
- **Never send quiz answers, hints or explanations to the app before they're earned.** The server keeps them; the app asks `/check` and `/hint`. Offline caching must strip them.
- **Hint ladder:** nudge → bigger hint → worked example of a *different* problem with a *different* result. Never the answer. Correct option is always first in the JSON (`"answer": 0`); the server shuffles options per child.
- **Sensitive topics** (`religion`, `body`, `politics`) are hidden server-side until a parent unlocks them with the PIN. Teach descriptively and with multiple perspectives.
- **Parent PIN** gates settings, sensitive topics, chat review, outside links (under 13), extra screen time, export/delete.
- **No ads, no third-party analytics, no selling data, no streaks or leaderboards.**
- New or edited content stays `"status": "draft"` until two human reviewers approve it.
- Hoot replies pass a second safety/answer-leak check; `precheck()` in `server/src/tutor.ts` handles personal info and wellbeing messages before any AI call.
- The server records opened hints (`hints_seen`); answers are revealed only after all three, in order. Never trust the app's `hintsUsed` alone.
- Tokens carry a session version (`v`); bump it with `revokeSessions()` to sign out every device. Website security headers live in `server/src/web-headers.ts` and must match `vercel.json` (a test checks).

## Deployment
Pre-launch mode is the default (drafts shown, no email verification, token secret auto-generated in the DB); `LAUNCH=true` switches to strict launch defaults.
Vercel project at the repo root (`vercel.json`): web app static from `app/dist`, API as a function under `/api`. See `docs/DEPLOYMENT.md` for env vars and how to attach Neon Postgres.
