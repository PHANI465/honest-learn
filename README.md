# Honest Learn 🦉

Free, safe, age-appropriate learning for ages 3–18. It runs on iOS, Android and the web, and has no ads.

- **Right for every age:** 5 age groups, 11 subjects and 220 "minimum knowledge" outcomes (see [`docs/KNOWLEDGE_MAP.md`](docs/KNOWLEDGE_MAP.md)).
- **Helps, never cheats:** quizzes use a hint ladder (nudge → bigger hint → worked example of a *similar* problem). Hoot, the AI helper, never gives quiz answers, and an independent check reviews every reply before a child sees it.
- **Parents in control:** a parent account is required. A parent PIN protects settings, sensitive topics (religion, body, politics), chat history, outside links and extra screen time.
- **Honest by design:** no ads, no tracking and no data selling. Every lesson lists its sources and shows whether teachers have reviewed it. Families can export or delete all their data.

## Repository layout

| Path | What it is |
|---|---|
| `content/knowledge-map.json` | Age groups, subjects and learning outcomes. The source of truth for the curriculum. |
| `content/lessons/<band>/<subject>/*.json` | Lessons and quizzes. One file per lesson. |
| `docs/KNOWLEDGE_MAP.md` | Generated, human-readable knowledge map for reviewers. |
| `docs/REVIEWER_GUIDE.md` | Rules for content writers and reviewers. |
| `docs/LAUNCH_CHECKLIST.md` | What must be done before the public and store launch. |
| `docs/DEPLOYMENT.md` | How to run the server and build the apps. |
| `server/` | API (Node + Hono + SQLite): accounts, PIN, profiles, progress, AI tutor. |
| `app/` | Expo (React Native) app for iOS, Android and web. |

## Run it locally

You need Node 22+.

```bash
# 1. API (uses the mock tutor unless ANTHROPIC_API_KEY is set)
cd server && npm install && npm run dev        # http://localhost:8787

# 2. App (in a second terminal)
cd app && npm install && npx expo start        # press w for web, or scan the QR code with Expo Go
```

On a phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN address, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:8787 npx expo start`.

## Everyday commands

```bash
cd server && npm test             # API test suite
cd server && npm run validate     # check every lesson against the schema + knowledge map
node scripts/build-knowledge-doc.mjs   # regenerate docs/KNOWLEDGE_MAP.md after editing the map
cd app && npm run typecheck
```

## Adding content

1. Pick outcome IDs from `docs/KNOWLEDGE_MAP.md`.
2. Write a lesson JSON file following `docs/REVIEWER_GUIDE.md`, with `"status": "draft"`.
3. Run `npm run validate` in `server/`.
4. After two reviews, set `"status": "reviewed"` and add both reviewers.

Draft lessons are shown only when `SHOW_DRAFTS=true` (the default in development, off in production).
