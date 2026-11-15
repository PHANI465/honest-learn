# Standalone mode: the API inside the app

How the phone app will work with no server at all (task T8 in [`AGENT_TASKS.md`](AGENT_TASKS.md)): the app runs the server's own
code on the device. Written for **T8a**, **T8b** and **T8c** (14 November 2026) and reviewed in **T8d** (15 November 2026): what protects what is in
[`SECURITY.md`](SECURITY.md), section "Standalone mode".

**Status.** Built end to end, not yet tried on a phone. On first run the phone app asks how the family will use it (`app/start.tsx`):
**On this phone only** (standalone mode) or **Connect to a server**. In standalone mode every request goes to the API inside the
app (`lib/api.ts` → `lib/local-backend.native.ts` → `local/device.ts`), with no email: a recovery phrase replaces the password reset,
and a wellbeing alert is a notice in the parent area. Nobody has run it in Expo Go, an emulator or a phone yet (section 5).

## 0. What a family sees

1. **First run** (`app/start.tsx`): two cards, "On this phone only" and "Connect to a server", each saying plainly what it means
   (for example: if the phone is lost, the data is gone). It can be changed later from the welcome screen, but only while signed
   out; each way has its own accounts. A phone that was already pointed at a server before 8c keeps using it without asking.
2. **Sign-up on the phone**: the same form; the email is only the sign-in name ("no email is ever sent"). Afterwards the
   **recovery phrase** is shown once (`components/RecoveryPhrase.tsx`): 24 letters and numbers in six groups, with "I have
   written down my recovery phrase" before Continue. Only its scrypt hash is kept (`parents.recovery_hash`).
3. **Forgot password** on the phone goes to `app/recover.tsx`: email + phrase + new password (`POST /auth/recover`, same attempt
   limit as signing in, signs out every other session). Case, spaces and dashes do not matter, and O/I/L are read as 0/1. A forgotten
   PIN is then reset with the new password, as before. Lost the phrase too: the account cannot be opened again, and the screen says so.
   A new phrase can be made in the parent area (Account card; needs the PIN and the password; the old phrase stops working).
4. **Wellbeing alert** (both modes, task T8c; the owner chose in-app only, no phone notification, 14 Nov 2026): when Hoot answers a
   message as a wellbeing concern, the parent area shows "💛 Please check in with <name>" with **Read the chat** and **I have
   checked in** (`POST /parent/children/:id/wellbeing-seen`). The profile picker, which children see, says only "A grown-up should
   open the parent area soon", with no name and no details (`GET /family` returns `attention: true|false`). On a server the parent
   also still gets the email. Why no notification: on a shared family phone the child it is about could read it, it needs a new
   native module and a permission prompt, and Apple's Kids Category is strict about notifications.
5. Email-only routes (`/auth/forgot-password`, `reset-password`, `verify-email`, `resend-verification`) answer
   `404 not_on_this_device` in standalone mode; the email verification card is hidden. Phrase routes answer 404 on a server.

## 1. The decision: no `core/` package, the app imports `server/src`

The guide offered two ways to share the API between server and app: move it into a `core/` npm workspace package, or let the
app's bundler (Metro) read `../server/src` directly. **T8a chose the second.**

- The repository is not an npm workspace. `server/` and `app/` are installed separately, and so are the Vercel function
  (`npm ci --prefix server`) and the website build (`cd app && npm ci`). Workspaces would change how both install.
- The docs, `CLAUDE.md`, `SECURITY.md` and the tests refer to `server/src/...` in hundreds of places.
- A package boundary only helps if something enforces it. Here a test does: `server/test/portable-core.test.ts` bundles
  `createApp()` with esbuild for a browser target and fails if anything it loads uses Node (details in section 3).

How it is wired:

| Piece | Where |
|---|---|
| Metro sees `server/src`, `content/` and the packages the API and the chess game use (`hono`, `zod`, `chess.js`, `js-chess-engine`, `@noble/*`), nothing else from `server/node_modules` | `app/metro.config.js` (`watchFolders`) |
| The app's TypeScript accepts `.ts` in import paths (the server's style) | `app/tsconfig.json` (`allowImportingTsExtensions`) |
| The API inside the app | `app/src/local/core.ts`: `createLocalApi({ adapter, files, getRandomValues })` |
| The phone's database | `app/src/local/sqlite-adapter.ts`: `expoSqliteAdapter(db)` over expo-sqlite (switches foreign keys on and refuses to open if that fails; `null` rows become `undefined`) |
| The content | `app/src/local/content-files.generated.ts`, written by `node scripts/bundle-content.mjs`: one `import` per JSON file in `content/` (239 files, about 1 MB), so `content/` stays the only copy and Metro bundles the JSON itself. Left out: `hoot-redteam.json`, `facts/keywords.json`. CI fails if the index is stale |
| Everything together on a phone | `app/src/local/device.ts`: `openDeviceApi()` (database file `honest-learn.db` in the app's private storage; random bytes from expo-crypto's `getRandomValues`, never `getRandomBytes`, which falls back to `Math.random` in development) |
| CI installs the server's packages in the app job, because `tsc` in `app/` now checks the shared API too | `.github/workflows/ci.yml` |

The phone app reaches `app/src/local/` only through `lib/local-backend.native.ts`; the website uses `lib/local-backend.ts`, which
does not import it, so the website bundle is unchanged (862 modules, checked). The whole Android app now bundles to about 3.5 MB
minified (1,697 modules: React Native, the screens, the API and the content), measured 14 Nov 2026 with `expo export:embed`.
The device code and content load on the first request in standalone mode, not at start-up. expo-sqlite and expo-crypto are both in Expo Go. Standalone mode is for phones only: expo-sqlite on the web needs
WebAssembly and extra HTTP headers, and the website always has its server.

## 2. The platform: the one place that touches the machine

Everything `createApp()` loads is plain JavaScript, except one seam: `server/src/platform.ts`.

| | Server (`platform-node.ts`) | Phone and browser (`platform-portable.ts`) |
|---|---|---|
| Chosen | automatically on Node.js | everywhere else, or `setPlatform(...)` |
| Random bytes | `node:crypto` | `crypto.getRandomValues` (on a phone: expo-crypto); throws if missing, never `Math.random` |
| Password and PIN hashes | `scryptSync` (N=16384, r=8, p=1) | `@noble/hashes` scrypt, same settings |
| Sign-in tokens (HS256) | `hono/jwt` | `@noble/hashes` HMAC, byte for byte the same tokens and the same checks |
| Own AI key (AES-256-GCM, HKDF) | `node:crypto` | `@noble/ciphers`, `@noble/hashes` |
| IP address parsing | `node:net` | own parser, checked against `node:net` |
| DNS lookup of a model's address | `node:dns` | none (see section 5) |
| Content | files in `content/` | an object of parsed files (`contentFromFiles`) |
| Settings | `process.env` | what the app passes in |

Node modules are loaded with `process.getBuiltinModule` (Node 22.3+), not `import "node:..."`, so `platform-node.ts` can sit
in the phone bundle without the bundler looking for Node there. `db.ts` does the same for `node:sqlite` (only `openDb()` needs it).
Bytes are `Uint8Array` everywhere; `server/src/bytes.ts` replaces `Buffer` (text, base64, base64url).

`@noble/hashes` and `@noble/ciphers` 2.4.0 (MIT, no dependencies, independently audited) were added with the owner's agreement
(14 Nov 2026).

## 3. The rules for anyone changing the API

1. **No Node in shared code.** Code that `createApp()` loads must not import `node:*` or Node-only packages, use `Buffer`, read
   `process.*`, call `require()` or use `import.meta`. Use `pf()` from `platform.ts` and `bytes.ts`. Server-only code
   (`index.ts`, `vercel.ts`, `preview.ts`, `tutor-claude.ts`, `open-db.ts`, `db-neon.ts`, `cron.ts`, scripts) may use Node.
   `test/portable-core.test.ts` enforces this.
2. **Middleware must not rebuild responses.** Do not touch `c.res` before `next()` and do not call `c.header()` after it; set
   headers on `c.res.headers` after `next()` instead. Hono otherwise rebuilds the response from `response.body`, a stream React
   Native's `Response` does not have, and the phone gets an empty body. (The proof below found exactly this through CORS, which is
   now left out when `createApp({ device: true })`.)
3. **New packages for the shared API** must be plain JavaScript and be added to `ALLOWED_PACKAGES` in
   `test/portable-core.test.ts` and to `watchFolders` in `app/metro.config.js`.
4. **A new database driver** implements `DbAdapter` (`server/src/db.ts`), is opened with `openWithAdapter()`, and is added to
   `test/db-contract.test.ts` first. The contract: `?` placeholders, `RETURNING`, `ON CONFLICT`, foreign keys switched on (SQLite
   needs `PRAGMA foreign_keys = ON`), counts and integers returned as numbers. `INTEGER` is 32-bit on Postgres: keep values below
   2,147,483,647 (timestamps are ISO text).

## 4. How it is tested

| Check | Command | What it shows |
|---|---|---|
| Platform contract | `cd server && npm test` (`test/platform-contract.test.ts`) | Both platforms match published test vectors (SHA-256, scrypt RFC 7914, HKDF RFC 5869) and each other: a password hashed, a token signed, a key sealed on one is accepted by the other; children's option orders did not change |
| Database contract | same (`test/db-contract.test.ts`) | SQLite, Postgres (PGlite), a hand-written adapter and the app's expo-sqlite adapter (over a node:sqlite stand-in that behaves like expo-sqlite: foreign keys off until switched on, `null` for no row) behave the same; the expo-sqlite adapter refuses a database where foreign keys stay off |
| No Node in the shared API | same (`test/portable-core.test.ts`) | The bundle for a browser target has no Node imports or globals; a family's main paths work with the portable platform and content handed in as files |
| Whole suite on the portable crypto | `cd server && npm run test:portable` | All API tests with the phone's crypto, tokens and IP parsing (files and DNS still from Node) |
| **The app's own bundle runs without Node** | `cd app && npm run proof:local` | Expo's bundler (`expo export:embed --platform android`, the Android build's Metro and Babel) bundles `createLocalApi`; the bundle runs in a sandbox with only what React Native has (no `process`, `Buffer`, `require`, streams or `crypto.subtle`; `Request`/`Response` from `whatwg-fetch`, React Native's own polyfill). The bundle holds the content and the expo-sqlite adapter; only the expo-sqlite database is a stand-in. 26 steps: sign-up with a recovery phrase and no email, PIN, a child, a lesson without answers, the hint ladder, Hoot and its pre-check, the wellbeing notice, an own AI key, the data download, deleting the child and checking nothing about them is left, and resetting the password with the recovery phrase |

All of these run in CI.

## 5. Known differences and open work

| | Server | Phone (standalone) | Who |
|---|---|---|---|
| Database | SQLite file or Postgres | expo-sqlite (`sqlite-adapter.ts`) | done (8b) |
| Content | `content/` folder | bundled through `content-files.generated.ts` | done (8b) |
| Random bytes | Node | expo-crypto's `getRandomValues` | done (8b) |
| Backup | the server's database | the data download (`GET /parent/export`) and its import (`POST /parent/import`) | done (#9) |
| Email (verification, password reset, wellbeing alert) | Postmark | none (`NoMailer`): recovery phrase, parent-area notice | done (8c) |
| Token secret and AI key secret | environment or database | generated on first use into expo-secure-store (Keychain/Keystore), `hl.device.tokenSecret` and `hl.device.aiKeySecret`, so a copy of the database file alone cannot forge a sign-in | done (8c) |
| Recovery phrase | none | 120 random bits, only its scrypt hash stored; guessing is limited like the password | reviewed (8d) |
| Lockouts | timed (the server's clock) | timed, and after 2 lockouts in a row the PIN needs the password and the password needs the recovery phrase: the phone's clock can be moved | done (8d) |
| Family accounts | any number | one per phone (`phone_has_family`) | done (8d) |
| Deleted data | rows deleted | rows deleted and overwritten (`PRAGMA secure_delete`) | done (8d) |
| Backups | the server's own | the phone's own backup to the family's Google or Apple account may include the database (owner's decision, 15 Nov 2026); the security keys are excluded from Android backups (checked in the generated manifest) | done (8d) |
| CORS | on | off (no other website can call an in-app API) | done |
| Own model address | written address checked, then resolved and checked before every request, and the connection is pinned to the addresses just checked (no DNS rebinding) | written address checked only: a phone has no DNS lookup to call, so nothing to pin | accepted (8d) |
| Sign-in rate limit per address | per client IP | all requests count as one address ("unknown"): 30 sign-in requests per 10 minutes on the device (PIN unlocks count too; the per-account PIN and password limits are unchanged) | accepted (8d) |
| Moving a family between a phone and a server | the transfer screen (`app/src/app/parent/transfer.tsx`) signs in to the other server with its address, email, password and PIN, reads or writes the data download and adds the children chosen to the signed-in family | the same screen; direct transfer works on phones, a download file is restored from the website. **Not tried on a real phone or between two real servers** | done (#9) |
| Who can read the answers | only the server | anyone who can open the app's files (by design: the family's own phone, see the guide) | accepted (8d) |

**Not verified yet (needs a real phone or emulator; nobody has run `openDeviceApi()` on one):** Hermes itself (the proof runs the Android bundle in Node's V8 with React
Native's globals, not in Hermes); how long scrypt takes on a phone (measured 14 Nov 2026 on a laptop: about 75 ms per hash with
`@noble/hashes` in V8, the same as Node's own; Hermes has no JIT and may be many times slower, and it runs on every sign-in and PIN,
so measure it on a phone and consider `scryptAsync` so the screen does not freeze); the real expo-sqlite (only a stand-in with the
same interface was tested; `npx tsc` checks that the real `SQLiteDatabase` fits the adapter); whether React Native's `URL` is complete enough for the own-model address checks (the sandbox used a full
`URL`; `react-native-url-polyfill` may be needed); `TextDecoder` and `AbortSignal.timeout` on Hermes; any screen.
