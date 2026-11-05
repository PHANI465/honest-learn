# Security

How Honest Learn protects children and families, what the last security review found and fixed, and what is still open. Last reviewed: 5 November 2026.

## How the app protects families

| Area | How it works | Where in the code |
|---|---|---|
| **Accounts** | Passwords and PINs are hashed with scrypt and a random salt per hash. Sign-in tokens are signed (HS256) and checked on every request. | `server/src/security.ts` |
| **Two kinds of sign-in** | A *family token* (30 days) lets children use the app on a device. A *parent token* (10 minutes, from the PIN) is needed for settings, sensitive topics, chats, outside links, extra time, export and delete. | `server/src/context.ts` → `requireScope` |
| **Signing out other devices** | Each account has a session version. "Sign out all other devices" and every password reset raise it, so all older tokens stop working at once. | `revokeSessions` in `context.ts`; `POST /parent/sign-out-everywhere` |
| **Guessing limits** | 5 wrong PINs or 8 wrong passwords lock the account for 15 minutes. Each try is counted in the database *before* checking, so parallel requests can't sneak extra guesses. `/auth/*` also has a per-IP limit (30 per 10 minutes). | `takeTry` / `wrongTry` in `context.ts`; `routes/auth.ts` |
| **Email codes** | 6-digit codes, hashed, valid 15 minutes, 5 tries. At most one email of each kind per account per minute (no inbox flooding). "Forgot password" answers the same way whether or not the email has an account. | `sendCode` / `useCode` in `context.ts` |
| **No account fishing** | Signing in with an unknown email takes the same time as a wrong password (a dummy hash is checked), so response times don't reveal who has an account. | `verifyAgainstNothing` in `context.ts` |
| **Answers stay on the server** | The app never receives quiz answers, hints or explanations up front. Options are shuffled per child. The server records which hints a child actually opened: hints must be opened in order, and an answer is revealed only after all three were opened, whatever the app claims. | `routes/learn.ts`, `routes/puzzles.ts`, `openHint` / `mayReveal` in `context.ts` |
| **Sensitive topics** | Religion, body and politics lessons are filtered out on the server until a parent unlocks them with the PIN. A child's request for a locked lesson gets "needs a parent's permission". | `visibleTo` in `context.ts` |
| **Hoot (AI helper)** | Personal information and wellbeing messages are answered by fixed, safe replies before any AI call (with a helpline for the family's country). Every AI reply then passes a second safety and answer-leak check. Personal information is never stored as typed. Chats are deleted after 365 days. | `server/src/tutor.ts`, `routes/tutor.ts`, `content/hoot-redteam.json` |
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

Each fix has an automated test in `server/test/api.test.ts` ("security hardening").

## Known and accepted

- **Expo build tools** (`npm audit` in `app/`): 5 moderate advisories in `glob`/`minimatch`, used only by Expo's command-line tools on the build machine. They are not part of the app that families download. The suggested fix would downgrade Expo by six major versions, so we wait for Expo to update them. The server has **0** known vulnerabilities.
- **Per-IP rate limit is per server instance.** On Vercel each function instance counts on its own. The per-account limits (PIN, password, codes) are in the database and hold everywhere. At scale, use Vercel's firewall rate limiting or a shared store (see `docs/guide/5_SCALING_PLAN.md`).
- **`CORS_ORIGINS` defaults to `*`.** Safe here because sign-in uses bearer tokens, not cookies, so other websites can't act as a signed-in user. Set it to the real site address at launch anyway.
- **Web storage.** In the browser the family token is kept in local storage (standard for web apps). The strict CSP is the main protection against scripts that could read it.
- **Hoot red-team.** The 92 attack cases in `content/hoot-redteam.json` must be run against the real AI (`cd server && npm run redteam` with `ANTHROPIC_API_KEY` set) and reviewed by a child-safety expert before launch. See `docs/HOOT_SAFETY_TESTS.md`.

## Before launch

1. Set `LAUNCH=true`, `TOKEN_SECRET`, `POSTMARK_TOKEN` + `MAIL_FROM` and `CORS_ORIGINS` (see `docs/DEPLOYMENT.md`).
2. Run the Hoot red-team with the real AI and have it reviewed.
3. Ask an independent security tester to look at the deployed site (the checklist in `docs/LAUNCH_CHECKLIST.md`).
4. Set up `security@` email for reports and add it here.

## Reporting a problem

Until a security contact exists, please open a private security advisory on GitHub: **Security → Advisories → Report a vulnerability** in `PHANI465/honest-learn`. (The owner switches this on once under **Settings → Code security → Private vulnerability reporting**.) Please don't open a public issue for security problems.
