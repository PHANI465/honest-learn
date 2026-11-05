# Deployment

## 1. API server

The server is a single Node process with a SQLite file. Any host with a **persistent disk** works, for example Railway, Render, Fly.io or a small VPS. Set `DATABASE_URL` to use Postgres instead (needed for serverless hosts and for more than one server). To run the website and the API together on Vercel with Neon Postgres, see [section 3](#3-deploy-on-vercel-website--api-on-one-domain).

### Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | yes | — | Set to `production`. |
| `TOKEN_SECRET` | **yes** | — | Long random string (e.g. `openssl rand -base64 48`). The server refuses to start in production without it. |
| `DB_PATH` | no | `server/data/honest-learn.db` | SQLite file. Put it on the persistent disk. Back it up daily. Ignored when `DATABASE_URL` is set. |
| `DATABASE_URL` (or `POSTGRES_URL`) | no | — | Postgres connection string. When set, the server uses Postgres (via Neon's HTTPS driver) instead of SQLite. Tables are created on first use. |
| `CONTENT_DIR` | no | `../content` | Folder with `knowledge-map.json` and `lessons/`. |
| `SHOW_DRAFTS` | no | `false` in production | Keep `false` for the public. Use `true` on a staging server for reviewers. |
| `CORS_ORIGINS` | no | `*` | Comma-separated web origins, e.g. `https://app.honestlearn.org`. |
| `ANTHROPIC_API_KEY` | for AI | — | Turns on the real AI tutor. Without it, Hoot answers with the lesson's pre-written hints. |
| `TUTOR_MODEL` | no | `claude-opus-5-5` | Model that writes Hoot's replies. |
| `TUTOR_SAFETY_MODEL` | no | `claude-opus-5-5` | Model that checks every reply before a child sees it. |
| `TUTOR_EFFORT` | no | `low` | `low` / `medium` / `high`. Higher means slower and more expensive. |
| `TUTOR_DAILY_LIMIT` | no | `40` | Messages per child per day. |
| `POSTMARK_TOKEN`, `MAIL_FROM` | **yes** | — | Sends verification and password-reset codes. Without them, production refuses to start; in development, emails are printed to the console. |
| `MAIL_MODE` | no | — | `console` prints emails (and their codes) to the server log instead of sending them, even in production. Only for demos. |
| `REQUIRE_EMAIL_VERIFICATION` | no | `true` in production | Parents must verify their email before adding children. |
| `TRUST_PROXY` | no | `false` (`true` on Vercel) | Set `true` only behind your own reverse proxy, so rate limits use the real client IP. Vercel sets `X-Forwarded-For` itself, so it is on there by default. |
| `AUTH_RATE_LIMIT` | no | `30` | Requests per IP per 10 minutes on `/auth/*`. |
| `CHAT_RETENTION_DAYS` | no | `365` | Hoot chats older than this are deleted automatically (checked daily). |

**AI cost:** each child message makes two model calls (the reply and the safety check). To cut cost, you can set `TUTOR_MODEL` and/or `TUTOR_SAFETY_MODEL` to `claude-haiku-5-5` (much cheaper). Test quality on real lesson chats before switching, and keep the safety check on either way.

### Start command

```bash
cd server && npm ci && npm start
```

Health check: `GET /health` returns `{ ok, lessons, tutor, demo }`. `demo` is `true` only when the data lives in memory (Vercel without a database).

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

`app/eas.json` already has `development`, `preview` and `production` profiles. Replace the placeholder `EXPO_PUBLIC_API_URL` values with your real API addresses.

Accounts needed: Apple Developer Program ($99/year) and Google Play Console ($25 one-time).

Web: `cd app && EXPO_PUBLIC_API_URL=https://api.honestlearn.org npx expo export --platform web`, then host the `dist/` folder on any static host (Vercel, Netlify, Cloudflare Pages).

## 3. Deploy on Vercel (website + API on one domain)

One Vercel project serves both: the web app (built from `app/`) and the API as one Vercel Function under `/api` (code in `server/`, entry point `api/index.ts`). Data goes into Neon Postgres, added from the Vercel Marketplace. Everything is configured in [`vercel.json`](../vercel.json) at the repository root:

- **Install:** `npm ci --prefix server` (the API's dependencies).
- **Build:** `cd app && npm ci && EXPO_PUBLIC_API_URL=/api npx expo export --platform web` (the app calls the API on the same domain).
- **Output:** `app/dist`. Deep links such as `/parent` or `/learn/…` are rewritten to `index.html`; `/api/*` goes to the function.
- **Function:** `api/index.ts` (Node.js 22, from `engines` in the root `package.json`), bundled with `content/**`.
- **Header:** every response carries `X-Robots-Tag: noindex, nofollow`, because the lessons are not reviewed yet.

### Project settings

| Setting | Value |
|---|---|
| Repository | `PHANI465/honest-learn` |
| Root Directory | *(leave empty: the repository root)* |
| Framework Preset | **Other** (`vercel.json` sets `"framework": null`) |
| Build, Output, Install commands | Leave the overrides **off**; `vercel.json` sets them. |
| Node.js Version | 22.x (the root `package.json` pins `22.x`) |

### Environment variables

**None are required.** Until you set `LAUNCH=true`, the app runs in *pre-launch mode*: draft lessons are shown, email verification is off, sign-in codes are written to the function logs, Hoot uses pre-written hints, and a strong `TOKEN_SECRET` is generated automatically and stored in the database.

Optional settings (Project → Settings → Environment Variables):

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Added automatically when you connect Neon (see below). Without a database, the site runs in **demo mode** and forgets accounts. |
| `TOKEN_SECRET` | Your own sign-in signing secret (otherwise one is generated and stored in the database). Changing it signs everyone out. |
| `ANTHROPIC_API_KEY` | Turns on the real AI tutor. Without it, Hoot answers with the lessons' pre-written hints. |
| `LAUNCH` | Set to `true` only for the public launch: hides unreviewed lessons and requires email verification. Then you also need `POSTMARK_TOKEN` + `MAIL_FROM` so emails are actually sent. |
| `SHOW_DRAFTS`, `REQUIRE_EMAIL_VERIFICATION`, `MAIL_MODE`, `TUTOR_MODE` | Override the pre-launch/launch defaults individually. |

**Demo mode:** with no database connected, the API keeps everything in memory. It works, but accounts and progress disappear whenever Vercel starts a new instance. The welcome screen then shows "Demo mode: accounts and progress may reset". Connect Neon to make data stick.

### If you imported the repo into v0

v0 previews the app with `npm run dev`, which installs everything, builds the website and starts the website and API together (about 2–3 minutes the first time). To put it online, click **Publish** in v0. That creates the Vercel project using `vercel.json`. Then follow steps 2–5 below to add the database.

### Step by step

1. **Import the project:** in Vercel, **Add New… → Project**, pick the GitHub repository `PHANI465/honest-learn`, keep the settings above, and click **Deploy** (no environment variables needed). The first deployment runs in demo mode.
2. **Add Neon Postgres:** open the project, go to **Storage → Create Database**, choose **Neon** (Serverless Postgres), pick the free plan and a region close to your users (ideally the same region as your functions, e.g. Washington D.C. `iad1`), and create it.
3. **Connect it to the project:** on the next screen (or later from the database's page: **Connect Project**), choose this project and tick **Production** and **Preview** (and **Development** if you use `vercel dev`). Keep the default environment-variable prefix, so Neon adds `DATABASE_URL` (plus `POSTGRES_URL` and others). If you change the prefix, also add a plain `DATABASE_URL` variable with the connection string.
4. **Redeploy:** environment variables only apply to new deployments. Go to **Deployments**, open the latest one, choose **⋯ → Redeploy**. (Or push a commit.)
5. **Check it:** open `https://<your-project>.vercel.app/api/health`. You should see `"demo": false`. The tables are created automatically on the first request. Then open the site, create a parent account (the verification code is in **Logs** if you need it) and add a child.

### Good to know

- **Data retention** runs inside the function: each instance deletes expired data (old chats, codes, usage) at most once a day, on its first request.
- **Rate limits** on sign-in are kept in memory per function instance, so they are looser than on a single server.
- **Preview deployments** share the same Neon database unless you connect a separate Neon branch to Preview.
- **Local development is unchanged:** `cd server && npm run dev` uses SQLite. To try Postgres locally, set `DATABASE_URL` to a Neon connection string. Tests run on SQLite (`npm test`) and on Postgres in-process (`npm run test:pg`, using PGlite).
- **Try the Vercel build locally:** `npx vercel build` (needs `vercel link`, or a `.vercel/project.json`), then `npx vercel deploy --prebuilt` if you want to deploy that build.
