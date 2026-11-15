# Security

How Honest Learn protects children and families, what the last security review found and fixed, and what is still open. Last reviewed: 13 November 2026; own-model settings added 14 November 2026; standalone mode reviewed 15 November 2026.

## How the app protects families

| Area | How it works | Where in the code |
|---|---|---|
| **Accounts** | Passwords and PINs are hashed with scrypt and a random salt per hash. Sign-in tokens are signed (HS256) and checked on every request. | `server/src/security.ts` |
| **Two kinds of sign-in** | A *family token* (30 days) lets children use the app on a device. A *parent token* (10 minutes, from the PIN) is needed for settings, sensitive topics, chats, outside links, extra time, export and delete. | `server/src/context.ts` → `requireScope` |
| **Signing out other devices** | Each account has a session version. "Sign out all other devices" and every password reset raise it, so all older tokens stop working at once. | `revokeSessions` in `context.ts`; `POST /parent/sign-out-everywhere` |
| **Guessing limits** | 5 wrong PINs or 8 wrong passwords lock the account. Repeated lockouts last longer: 15 minutes, then 1 hour, 6 hours and 24 hours (it stays at 24 hours), and a correct PIN or password, or a PIN/password reset, starts again at 15 minutes. The PIN and the password escalate separately (`pin_lock_level`, `login_lock_level`). Each try is counted in the database *before* checking, so parallel requests can't sneak extra guesses. `/auth/*` also has a per-IP limit (30 per 10 minutes) counted in the database (`rate_limits` table), so every server instance shares it. | `takeTry` / `wrongTry` / `hitRateLimit` in `context.ts`; `routes/auth.ts`; `server/test/lockout.test.ts` |
| **Email codes** | 6-digit codes, hashed, valid 15 minutes, 5 tries. At most one email of each kind per account per minute (no inbox flooding). "Forgot password" answers the same way whether or not the email has an account. | `sendCode` / `useCode` in `context.ts` |
| **No account fishing** | Signing in with an unknown email takes the same time as a wrong password (a dummy hash is checked), so response times don't reveal who has an account. | `verifyAgainstNothing` in `context.ts` |
| **Answers stay on the server** | The app never receives quiz answers, hints or explanations up front. Options are shuffled per child. The server records which hints a child actually opened: hints must be opened in order, and an answer is revealed only after all three were opened, whatever the app claims. | `routes/learn.ts`, `routes/puzzles.ts`, `openHint` / `mayReveal` in `context.ts` |
| **Sudoku: the solution stays on the server** | `GET .../games/sudoku/:n` sends only the clues. `check` names the wrong squares and `hint` follows the three-step ladder (technique, where to look, the number with its reason), recorded in `hints_seen` so the app cannot skip ahead; the app never receives the solution. Puzzles come from a seed (child id, grid size, level, number), so nothing about a puzzle is stored, and every puzzle is checked to have exactly one solution. Finished puzzles are kept in `games_solved` only (no scores, ranks or streaks). | `routes/games.ts`, `games/sudoku.ts`, `test/sudoku.test.ts` |
| **Chess: the solution stays on the server** | `GET .../games/chess/:id` sends only the position (FEN) and the goal. The app sends one move at a time to `.../move`; a wrong move just returns "wrong" and says nothing about the answer, a right move returns the opponent's reply, and the explanation and the rest of the line are sent only once the puzzle is solved. Hints use the same ladder as quizzes (`hints_seen`, item `chess-<id>`, one step per move). Move rules come from the `chess.js` library (BSD-2-Clause licence, no dependencies, no network), used on the server and in the app only to draw legal squares. | `routes/games.ts`, `games/chess.ts`, `test/chess.test.ts` |
| **Chess against the computer runs on the device** | Nothing is sent anywhere and there are no secrets in it (no answers), so it needs no server. The moves are judged by `chess.js`; the engine (js-chess-engine, MIT) only suggests a move, and a suggestion that is illegal, or an engine that fails, is replaced by a random legal move. Only a count of finished games is kept, on the device, as for the memory games. | `server/src/games/computer-opponent.ts`, `app/src/app/learn/[childId]/games/computer.tsx`, `server/test/computer-opponent.test.ts` |
| **Memory games keep nothing but a count** | Pairs, Copy the pattern, Which one changed?, Slide the tiles and Nonograms run entirely on the device. They have no secret answers to protect and send nothing to the server. The only thing kept is how many times a child finished each game, stored on the device (`hl.games.played`) and removed on sign-out. No dates, streaks, scores or comparisons. | `app/src/lib/games/played.ts`, `lib/offline.ts` (`clearOfflineData`) |
| **Family lessons stay private** | A lesson a parent adds is stored per parent (`family_lessons`), can only be written with the parent PIN token, is shown only to that parent's children (the lesson carries its owner inside the server and `visibleTo` compares it with the child's parent; the owner id is stripped before anything is sent), and is included in the export and erased with the account. Quiz answers, hints and explanations of family lessons follow the same server-side rules as built-in ones. They are never `reviewed` and carry no sources, so the app labels them "Added by your family". | `family-lessons.ts`, `context.ts` (`visibleTo`, `visibleLessons`), `routes/parent.ts`, `test/family-lessons.test.ts` |
| **Spelling words: one deliberate exception** | The daily spelling screen never receives the spelling as text to show, but the server does send each not-yet-tried word in a separate `say` field so the phone can read it aloud (decision by the owner, 14 Nov 2026: hearing the word is the point of spelling practice). The app must never render `say`. The typed answer is always compared on the server, a word cannot be promoted twice in one day, and the clues (meaning, blanked sentence) never contain the word. | `routes/spelling.ts`, `spelling.ts`, `test/spelling.test.ts` |
| **Sensitive topics** | Religion, body and politics lessons are filtered out on the server until a parent unlocks them with the PIN. A child's request for a locked lesson gets "needs a parent's permission". | `visibleTo` in `context.ts` |
| **Hoot (AI helper)** | Personal information and wellbeing messages are answered by fixed, safe replies before any AI call (with a helpline for the family's country). Every AI reply then passes a second safety and answer-leak check. Personal information is never stored as typed. Chats are deleted after 365 days. | `server/src/tutor.ts`, `routes/tutor.ts`, `content/hoot-redteam.json` |
| **A family's own AI model and key** | A parent can point Hoot at their own model (parent area, "Hoot's AI"). Saving needs the PIN token **and** the account password. The API key is stored only encrypted (AES-256-GCM, key derived with HKDF from `AI_KEY_SECRET` or the token secret plus the parent id, bound to that parent) and is **never returned**: not by any route, not in the data download, not in logs. Only its last four characters are shown. A stored key is only ever sent to the address it was typed for: changing the address (scheme, host or port) deletes it. Saving turns Hoot off for every child until the parent turns it on again. Address guard against server-side request forgery: `https` only, `http` only to this machine or a private network when `ALLOW_LOCAL_LLM` is on (always off on Vercel); the name is resolved before **every** request and refused if any address is link-local or cloud metadata (169.254.0.0/16, `fd00:ec2::`), unspecified or multicast; redirects are never followed; the test button and errors give only a short category, never the model server's own words. All of Hoot's protections stay on for every model. | `server/src/ai-settings.ts`, `routes/parent-ai.ts`, `routes/tutor.ts`, `server/test/own-key.test.ts` |
| **Same crypto on server and phone** | The API's hashing, tokens and key encryption go through `server/src/platform.ts`: Node's crypto on the server, `@noble/hashes` and `@noble/ciphers` (MIT, audited, no dependencies) in the app's standalone mode. Both use the same algorithms and formats and are checked against published test vectors and each other; a shortened AES-GCM tag is refused on both (Node alone would accept one). The standalone mode's own risks are reviewed in task T8d. | `server/src/platform*.ts`, `server/test/platform-contract.test.ts`, `docs/STANDALONE.md` |
| **Standalone mode (no server, no email)** | The phone app can run the API on the phone itself (`docs/STANDALONE.md`). A recovery phrase replaces the password-reset email: 120 random bits shown once at sign-up, only its scrypt hash kept, guesses limited like the password (`POST /auth/recover`, signs out every other session); a new one needs the PIN and the password. The sign-in and AI-key secrets are generated into the phone's Keychain/Keystore, not the database. Email routes answer 404 on the phone, phrase routes 404 on a server. The full review of this mode (who can read what on a family's own phone) is task T8d. | `routes/auth.ts`, `security.ts` (`newRecoveryPhrase`), `app/src/local/device.ts`, `server/test/standalone.test.ts` |
| **Wellbeing notice** | When Hoot answers a message as a wellbeing concern, the PIN-protected parent area shows "Please check in with <name>" until the parent marks it seen; the profile picker, which children see, only says a grown-up should open the parent area (no name, no details). On a server the parent also gets the email; on a phone this notice is the only alert (no phone notification, by the owner's choice: a child could read it on a shared phone). | `routes/parent.ts` (`wellbeingAlerts`, `wellbeing-seen`), `routes/learn.ts` (`attention`), `app/src/app/parent/index.tsx`, `profiles.tsx` |
| **Input checks** | Every request body is validated (zod) with length limits, and bodies over 32 KB are refused. All SQL uses bound parameters. | `server/src/models.ts`, `app.ts` |
| **API headers** | `Content-Security-Policy: default-src 'none'`, no framing, `nosniff`, `no-referrer`, HSTS and `Cache-Control: no-store` (family data never sits in caches). | `app.ts` |
| **Website headers** | A strict Content-Security-Policy (only this site, plus the privacy-enhanced YouTube player), no framing, `nosniff`, a referrer policy, a permissions policy that turns off camera, microphone and location, and `noindex` until launch. The same list is used by Vercel and the preview server; a test fails if they differ. | `server/src/web-headers.ts`, `vercel.json`, `server/test/web-headers.test.ts` |
| **On the device** | Phones keep the family token in the secure keystore (SecureStore). Lessons saved for offline use never include answers. The parent token lives in memory only. Signing out deletes saved lessons and profiles. | `app/src/lib/storage.ts`, `app/src/lib/offline.ts`, `app/src/lib/session.tsx` |
| **Outside links** | Children under 13 need the parent PIN to open any website outside the app; teens see a "you're leaving Honest Learn" notice. Videos play in YouTube's privacy-enhanced player in a sandboxed frame. | `app/src/components/ExternalLink.tsx`, `VideoEmbed*.tsx` |
| **Data rights** | Parents can download everything held about the family, or delete the account and all data. | `GET /parent/export`, `DELETE /parent/account` |
| **No tracking** | No ads, no analytics, no third-party SDKs that collect data. | — |

## Review of 5 November 2026: findings and fixes

| # | Finding | Risk | Fix |
|---|---|---|---|
| 1 | Sign-in tokens couldn't be revoked: after a password reset (for example a lost phone), old devices stayed signed in for up to 30 days. | High | Session versions; a password reset signs out every other device; new **Sign out all other devices** button in the parent area. |
| 2 | The server trusted the app's "I used all 3 hints" claim, so a hand-made request could reveal any quiz answer without trying. | Medium (breaks the core "never give the answer" rule) | The server records the hints a child opened; answers are revealed only after all three, in order. |
| 3 | Sign-in with an unknown email answered faster than with a wrong password, revealing which emails have accounts. | Low–medium | Same amount of work for both. |
| 4 | "Forgot password" could be used to send many emails to someone's inbox. | Low–medium | One email per account per minute (the answer to the caller stays the same). |
| 5 | No request size limit. | Low | 32 KB limit, plus length limits on every text field. |
| 6 | No security headers on the website or the API. | Medium | Strict CSP and the headers listed above, on Vercel and in the preview server. |
| 7 | Preview server: a malformed web address crashed the request (500), and file paths weren't checked to stay inside the app folder. | Low (preview only) | Bad addresses get 400; files are only ever served from `app/dist`. |
| 8 | Invalid JSON in a request returned a server error (500). | Low | Returns 400 "invalid input". |

| 9 | The per-IP rate limit on `/auth/*` was counted in each server instance's memory, so on Vercel every function instance had its own count. | Low–medium | The count now lives in the database (`rate_limits`, one atomic upsert per request), shared by all instances; old rows are removed by the retention purge. |
| 10 | A lockout was a flat 15 minutes however often it repeated, so a patient attacker could keep guessing about 20 PINs an hour. | Low–medium | Escalating lockouts: 15 minutes, 1 hour, 6 hours, 24 hours; reset by a successful sign-in or PIN. |

## Review of 13 November 2026: findings and fixes

| # | Finding | Risk | Fix |
|---|---|---|---|
| 11 | Outside production the sign-in token secret fell back to a fixed, public string. A host set up without `NODE_ENV=production` would have had forgeable tokens. | Medium | The fixed secret is used only by automated tests. Everywhere else a random secret is generated once and kept in the database. |
| 12 | Deleting the whole account needed only the parent PIN, which a child may have seen. | Medium | Deleting the account now also needs the account password, with the same attempt limit as signing in. |
| 13 | Reports had no limit, so one signed-in device could fill the database. | Medium | 20 reports per family per 24 hours. |
| 14 | Two sign-ups with the same email at the same moment returned a server error. | Low | The second one gets "email taken". |
| 15 | The per-address limit used the first `X-Forwarded-For` value, which the caller can invent on some hosts. | Low | Uses the platform's own header, or the last entry (added by the nearest proxy). |
| 16 | Website pages had no HSTS header (the API did). | Low | Added to the preview server and `vercel.json`. |
| 17 | Cross-origin access stayed open (`*`) at launch unless `CORS_ORIGINS` was set. | Low | After `LAUNCH=true` the default is no cross-origin access. |
| 18 | Outside links were opened without checking the address. | Low | Only `https` addresses are opened; "read more" links must be on wikipedia.org. |
| 19 | The password could only be changed through "forgot password". | Low | New **Change password** in the parent area (needs the current password, signs out other devices). |

Findings 11 to 19 are tested in `server/test/hardening.test.ts`.

Each earlier fix has an automated test in `server/test/api.test.ts` ("security hardening"); findings 9 and 10 are tested in `server/test/lockout.test.ts`.

## Standalone mode (the phone app with no server): what protects what

Reviewed 15 November 2026 (task T8d), from the code; **nobody has tried it on a real phone yet** (see `docs/STANDALONE.md`). In this mode the
API, the database, every lesson and its answers live in the app on the family's phone. On a server, the server is the boundary that the app
cannot cross. On a phone there is no such boundary: whoever holds the phone and has the skill to read an app's files can read everything in
it. That is accepted for a family's own phone, where the realistic "attacker" is a curious child (decision in `AGENT_TASKS.md`, T8). The
protections below aim at that child, at someone who finds the phone, and at other apps; none of them stops a determined expert with the
unlocked phone, and the server mode is unchanged by any of it.

| What | Protected by | What remains |
|---|---|---|
| **Quiz answers, hints, explanations** | The app's screens follow the same rules as on a server: the API inside the app keeps the answers and the hint ladder (`hints_seen`), and the screens get only what has been earned. | The answers are inside the app package and its database. A child who can unpack an app (or who looks up the lesson files on GitHub) can read them. By design. |
| **Parent PIN** | scrypt hash (never the PIN itself). 5 wrong PINs lock it for 15 minutes; **after 2 lockouts in a row only the account password can set a new PIN** (`deviceLockoutsBeforeReset`), so moving the phone's clock forward gives no more guesses: 10 guesses in total, a 0.1% chance for a 4-digit PIN. | With a copy of the database file (a rooted phone or an unpacked backup), a 4 to 6 digit PIN can be tried offline in hours. The PIN guards settings inside the app, not the file. A 6-digit PIN helps. |
| **Account password** | scrypt hash. 8 wrong passwords lock for 15 minutes; **after 2 lockouts in a row only the recovery phrase opens the account** (sign-in, PIN reset and the password-checking forms all refuse). | Offline guessing of a weak password from a copy of the file, as for the PIN. |
| **Recovery phrase** | 24 characters, 120 random bits, shown once; only its scrypt hash is stored; guesses count against the password limit. A new phrase needs the PIN and the password, and the old one stops working. | Whoever finds the paper can reset the password. The phrase can be selected and copied, so it can end up on the clipboard. |
| **Sign-in tokens** | Signed with a secret generated into the Keychain (iOS) or Keystore (Android), not the database, so a copy of the database alone cannot forge a sign-in. The family token is in the Keychain/Keystore; the parent token is in memory only and the app locks the parent area after 10 minutes. | Moving the clock back can stretch a parent token that was already issued (the parent must have left the area unlocked). |
| **A second family account** (a child making their own account with no parental controls) | **One family per phone**: sign-up is refused when the phone already has one (`phone_has_family`). Starting over needs the old account deleted (password). | Removing and reinstalling the app wipes the family's data and allows a new account. Only the phone's own parental controls (app installs need a parent) stop that. |
| **Children's data** (progress, Hoot chats, wellbeing flags) | The app's private storage, which other apps cannot read on a phone that is not rooted. Deleted rows are overwritten (`PRAGMA secure_delete`). Nothing is sent to the project. The data download needs the PIN. | **The phone's own backup** to the family's Google or Apple account may include it, if backups are on (owner's decision, 15 Nov 2026: keep backups so a family changing phones keeps its data; the privacy notice says so). The security keys are not restored from an Android backup, so the family signs in again and retypes any AI key. |
| **Wellbeing alerts** | A notice in the PIN-protected parent area; the profile picker, which children see, only says that a grown-up should open it (no name, no details). | No email exists on a phone and there is no phone notification (owner's choice): if a parent never opens the parent area, nobody is told. |
| **Daily limits** (screen minutes, 40 Hoot messages a day) | Counted by the API inside the app. | Moving the phone's date resets them. As on a server, these are family tools, not security boundaries. |
| **A family's own AI model and key** | The key is sealed with AES-256-GCM under a secret in the Keychain/Keystore. The written address is checked as on a server (https, no metadata or link-local addresses). | A phone has no DNS lookup to call, so a name is not resolved and checked before each request. The parent sets the address with the password, and a phone has no cloud metadata service to protect. |
| **What the app sends anywhere** | Nothing to the project. The phone itself fetches Wikipedia summaries for the fixed article titles in lessons, plays YouTube videos in the privacy-enhanced player, and calls the family's own AI model if one is set. | Wikipedia, YouTube and the model provider see the phone's address, as they do on the website. |

### Review of 15 November 2026 (standalone mode): findings and fixes

| # | Finding | Risk | Fix |
|---|---|---|---|
| 20 | PIN and password lockouts are timed, and on a phone the clock belongs to whoever holds it: moving it forward after each lockout would allow unlimited guesses (a 4-digit PIN in about 2,000 rounds). | Medium | After 2 lockouts in a row the PIN needs the password and the password needs the recovery phrase, whatever the clock says. Servers unchanged. |
| 21 | Anyone at the welcome screen (for example a child after the 30-day sign-in expired) could create a second account with their own PIN and no parental controls. | Medium | One family per phone. |
| 22 | Deleting a child or the account left the deleted rows in free pages of the SQLite file. | Low | `PRAGMA secure_delete = ON` in the phone's database adapter. |
| 23 | The privacy notice and first-run screen said the data stays "only on this phone", but the phone's own backup may include it. | Low (honesty) | Wording corrected in both, after the owner chose to keep phone backups. |
| 24 | (Found in T8a.) Node's AES-GCM accepted shortened authentication tags. | Low | Both platforms refuse any tag shorter than 16 bytes. |

Findings 20 to 22 are tested in `server/test/standalone.test.ts` and `server/test/db-contract.test.ts`; 24 in `server/test/platform-contract.test.ts`.

The Android backup set-up was checked in the generated manifest (`npx expo config --type introspect`, 15 Nov 2026): `allowBackup` is on and
expo-secure-store's rules (`secure_store_backup_rules`, `secure_store_data_extraction_rules`) keep its keys out of backups. **Still to check on a
real phone** (needs a person; see `docs/STANDALONE.md`): a backup and restore, that Hermes runs the shared code, and how long scrypt takes there.

## Known and accepted

- **Expo build tools** (`npm audit` in `app/`): 5 moderate advisories in `glob`/`minimatch`, used only by Expo's command-line tools on the build machine. They are not part of the app that families download. The suggested fix would downgrade Expo by six major versions, so we wait for Expo to update them. The server has **0** known vulnerabilities.
- **`CORS_ORIGINS` is `*` before launch.** Safe here because sign-in uses bearer tokens, not cookies, so other websites can't act as a signed-in user. After `LAUNCH=true` it defaults to no cross-origin access.
- **Locking someone out on purpose.** Anyone who knows a parent's email can enter wrong passwords until the account locks (up to 24 hours after repeated lockouts). A password reset by email clears the lock. We accept this in exchange for strong guessing limits.
- **Screen time is counted from the app's own ticks.** A modified app could report less time. The limit is a family tool, not a security boundary.
- **Web storage.** In the browser the family token is kept in local storage (standard for web apps). The strict CSP is the main protection against scripts that could read it.
- **Family model addresses and DNS rebinding.** The model address is checked by resolving its name before each request, but a name whose DNS answer changes between that check and the connection could still reach an address the check refused. Redirects are refused and responses are never shown, which limits what such a request can do. Pinning the checked address for the connection would close this; not done yet.
- **The key secret and the database.** With neither `AI_KEY_SECRET` nor `TOKEN_SECRET` set, the generated token secret is kept in the database, next to the encrypted keys, so a copy of the database would expose them. Set `AI_KEY_SECRET` for a real deployment. Changing it makes stored keys unreadable (the parent area says so, and the family types the key again).
- **Hoot red-team.** The 92 attack cases in `content/hoot-redteam.json` must be run against the real AI (`cd server && npm run redteam` with `ANTHROPIC_API_KEY` set) and reviewed by a child-safety expert before launch. See `docs/HOOT_SAFETY_TESTS.md`.

## Before launch

1. Set `LAUNCH=true`, `TOKEN_SECRET`, `AI_KEY_SECRET`, `POSTMARK_TOKEN` + `MAIL_FROM` and `CORS_ORIGINS` (see `docs/DEPLOYMENT.md`).
2. Run the Hoot red-team with the real AI and have it reviewed.
3. Ask an independent security tester to look at the deployed site (the checklist in `docs/LAUNCH_CHECKLIST.md`).
4. Set up `security@` email for reports and add it here.

## Reporting a problem

Until a security contact exists, please open a private security advisory on GitHub: **Security → Advisories → Report a vulnerability** in `PHANI465/honest-learn`. (The owner switches this on once under **Settings → Code security → Private vulnerability reporting**.) Please don't open a public issue for security problems.
