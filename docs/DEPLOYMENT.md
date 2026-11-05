# Deployment

## 1. API server

The server is a single Node process with a SQLite file. Any host with a **persistent disk** works, for example Railway, Render, Fly.io or a small VPS. Serverless platforms without a disk (such as plain Vercel functions) won't keep the database. Move to Postgres before scaling beyond one server.

### Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | yes | — | Set to `production`. |
| `TOKEN_SECRET` | **yes** | — | Long random string (e.g. `openssl rand -base64 48`). The server refuses to start in production without it. |
| `DB_PATH` | no | `server/data/honest-learn.db` | Put it on the persistent disk. Back it up daily. |
| `CONTENT_DIR` | no | `../content` | Folder with `knowledge-map.json` and `lessons/`. |
| `SHOW_DRAFTS` | no | `false` in production | Keep `false` for the public. Use `true` on a staging server for reviewers. |
| `CORS_ORIGINS` | no | `*` | Comma-separated web origins, e.g. `https://app.honestlearn.org`. |
| `ANTHROPIC_API_KEY` | for AI | — | Turns on the real AI tutor. Without it, Hoot answers with the lesson's pre-written hints. |
| `TUTOR_MODEL` | no | `claude-opus-5-5` | Model that writes Hoot's replies. |
| `TUTOR_SAFETY_MODEL` | no | `claude-opus-5-5` | Model that checks every reply before a child sees it. |
| `TUTOR_EFFORT` | no | `low` | `low` / `medium` / `high`. Higher means slower and more expensive. |
| `TUTOR_DAILY_LIMIT` | no | `40` | Messages per child per day. |

**AI cost:** each child message makes two model calls (the reply and the safety check). To cut cost, you can set `TUTOR_MODEL` and/or `TUTOR_SAFETY_MODEL` to `claude-haiku-5-5` (much cheaper). Test quality on real lesson chats before switching, and keep the safety check on either way.

### Start command

```bash
cd server && npm ci && npm start
```

Health check: `GET /health` returns `{ ok, lessons, tutor }`.

## 2. Apps (iOS, Android, web)

The app is built with Expo, so builds run in the cloud with EAS and you don't need a Mac.

```bash
cd app
npx eas-cli@latest login
npx eas-cli@latest build:configure
# point the app at your API:
#   in eas.json → build.production.env.EXPO_PUBLIC_API_URL = "https://api.honestlearn.org"
#   optional: EXPO_PUBLIC_DONATE_URL = "https://…"
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform android
npx eas-cli@latest submit --platform ios
```

Accounts needed: Apple Developer Program ($99/year) and Google Play Console ($25 one-time).

Web: `cd app && EXPO_PUBLIC_API_URL=https://api.honestlearn.org npx expo export --platform web`, then host the `dist/` folder on any static host (Vercel, Netlify, Cloudflare Pages).
