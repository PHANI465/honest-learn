# Fix plan: security, gaps, and UI design and motion

Written 13 November 2026 after a full read of `server/src`, the app's security-relevant code and the docs.
This file is the single source of truth for this round of work. **Any person or AI model can pick it up
and continue**: do the tasks in order, tick the box when a task is done and verified, and add a line to the
log at the bottom.

## How to work through this file

1. Take the first unticked task. Read its "How" section and the files it names.
2. Make the change. Keep the project rules in `CLAUDE.md` (never send answers early, PIN gates, no ads,
   no streaks, drafts stay drafts).
3. Verify with the commands below. A task is done only when they pass.
4. Tick the box (`- [x]`), add a line to the **Log**, and commit with a message that names the task id (for example `S1`).

```bash
cd server && npx tsc --noEmit && npm test          # must be all green
cd app && npx tsc --noEmit && CI=1 npx expo lint   # must print no errors
node scripts/check-doc-counts.mjs                  # docs agree with content
npm run dev                                        # repo root: build and serve on http://localhost:3000
node scripts/seed-demo.mjs                         # demo family (details at the top of that script)
```

Windows notes: use `npm run test:pg` for the Postgres run; `npm run build:web` (not an inline `VAR=x` command).

---

## Part 1: security bugs (do these first)

Severity: **H** high, **M** medium, **L** low. None of these is known to be exploited; the app is pre launch.

- [ ] **S1 (M) Fixed token secret outside production.**
  `server/src/config.ts` falls back to the public string `dev-only-insecure-secret-change-me` whenever
  `NODE_ENV` is not `production` and the host is not Vercel. Anyone who deploys on another host and forgets
  `NODE_ENV` gets forgeable sign-in tokens.
  **How:** in `config.ts` keep the fixed secret only when `NODE_ENV === "test"`. In every other case leave
  `tokenSecret` empty so `ensureTokenSecret()` in `app.ts` generates a random one and stores it in the
  database (it already does this for production). Make sure the test script sets `NODE_ENV=test`
  (`server/package.json`, `server/scripts/run-pg-tests.mjs`) or tests set the secret themselves.
  **Verify:** `npm test`; start `npm run dev` twice and confirm a sign-in survives a restart.

- [ ] **S2 (M) Deleting the whole account needs only the PIN.**
  `DELETE /parent/account` (`server/src/routes/parent.ts`) accepts a parent token, which a 4 digit PIN
  unlocks. A child who has seen the PIN can erase the family. The same is true for changing the PIN.
  **How:** require `{ password }` in the body of `DELETE /parent/account` and check it with `verifySecret`
  using the same `takeTry`/`wrongTry` login limiter as `/auth/reset-pin`. Update `api.ts` and the delete
  button in `app/src/app/parent/index.tsx` to ask for the password. Add a test in `server/test/api.test.ts`.

- [ ] **S3 (M) No limit on reports.**
  `POST /reports` (`server/src/routes/tutor.ts`) stores up to 1000 characters per call with no cap, so a
  signed-in device can fill the database.
  **How:** call `ctx.hitRateLimit("reports:" + parentId, 20, 24h)` and answer 429 `too_many_reports` when over.
  Add the friendly message in `app/src/lib/api.ts` (`friendly`). Add a test.

- [ ] **S4 (L) Sign-up race returns a server error.**
  Two sign-ups with the same email at once: the second insert hits the UNIQUE constraint and returns 500.
  **How:** wrap the insert in `routes/auth.ts` in try/catch; on failure re-check `getParentByEmail` and
  return 409 `email_taken`.

- [ ] **S5 (L) Rate limit trusts the first X-Forwarded-For value.**
  `clientIp` in `context.ts` takes the left-most address, which the caller controls on hosts that append
  rather than replace the header. That lets one attacker spread auth attempts across fake addresses.
  **How:** when `trustProxy` is on prefer `x-vercel-forwarded-for`, then `x-real-ip`, then the **last**
  entry of `x-forwarded-for` (the one added by the nearest proxy). Add a unit test.

- [ ] **S6 (L) Website responses have no HSTS header.**
  The API sends HSTS (hono secureHeaders) but `server/src/web-headers.ts` and `vercel.json` do not.
  **How:** add `Strict-Transport-Security: max-age=63072000; includeSubDomains` to both lists (the test
  `server/test/web-headers.test.ts` checks they match).

- [ ] **S7 (L) CORS stays open (`*`) at launch unless someone remembers to set it.**
  **How:** in `config.ts`, when `LAUNCH=true` and `CORS_ORIGINS` is unset, default to no cross-origin
  access (empty list) instead of `*`. The website and API share one origin on Vercel, so nothing breaks.
  Update `docs/DEPLOYMENT.md` (native apps need their origin listed only for web builds on other domains).

- [ ] **S8 (L) Outside links are opened without checking the address.**
  `app/src/components/ExternalLink.tsx` and the donate button pass any string to `Linking.openURL`. The
  addresses come from our content and Wikipedia's API today, but a bad value (for example `javascript:` or
  `file:`) should never be opened.
  **How:** add `safeUrl(url)` in `app/src/lib/links.ts` that returns the URL only when it parses and uses
  `https:`; use it in `ExternalLink.tsx` and for the donate link. On the server, in `wiki.ts`, only accept
  `content_urls.desktop.page` when its host ends with `wikipedia.org`.

- [ ] **S9 (L) No password change while signed in.**
  A parent can only change the password through "forgot password".
  **How:** add `PATCH /parent/password` with `{ currentPassword, newPassword }`, same limiter as S2, then
  `revokeSessions` and return fresh tokens (like `/parent/sign-out-everywhere`). Add a small form in the
  parent area and a test.

- [ ] **S10 (doc) Update `docs/SECURITY.md`** with findings 11 to 19 (S1 to S9) once fixed, plus the two
  accepted risks found in this review: (a) repeated wrong passwords can lock a known email out for up to
  24 hours (a password reset clears it), (b) screen time is counted from the app's own ticks, so a
  modified app could under-report.

## Part 2: functional gaps

- [ ] **G1 Missing contrast checker.** `app/src/lib/theme.ts` tells people to run
  `node scripts/check-contrast.mjs`, which does not exist.
  **How:** write the script: read the colour pairs from `theme.ts` (and the landing tokens in
  `app/src/landing/styles.ts`), compute WCAG contrast, fail under 4.5:1 for text and 3:1 for controls.
  Add it to `.github/workflows/ci.yml`.

- [ ] **G2 Loading states are a bare spinner.** `Loading` in `app/src/components/ui.tsx`.
  **How:** replaced by skeleton cards as part of U3.

- [ ] **G3 Wikipedia thumbnails are blocked on the website.** The CSP allows images only from this site,
  so "Learn more" thumbnails from `upload.wikimedia.org` never show.
  **How:** add `https://upload.wikimedia.org` to `img-src` in `web-headers.ts` and `vercel.json`, only if
  the lesson screen renders the thumbnail (check `lesson/[lessonId].tsx`); otherwise stop returning it.

- [ ] **G4 Sharing preview image.** `app/public/index.html` has no `og:image` because the site address is
  not known. **How:** add it at deployment (`https://<domain>/icons/icon-512.png`). Owner task.

Still open from earlier rounds, **not solvable in code** (owner tasks, see `docs/NEEDS_APPROVAL.md` and
`docs/LAUNCH_CHECKLIST.md`): expert review of the 175 lessons, running the Hoot red team with a real API
key, Postmark and firewall setup, translations, teacher mode, audio lessons, error tracking, app end to
end tests, and rewording the 265 questions whose correct option is the longest.

## Part 3: UI design and motion

### Design direction

Honest Learn is a calm learning app for children and a trust product for parents. The design should feel
**warm, steady and kind**, never like a game that pulls for attention. That gives these rules:

- **Motion explains, it never rewards compulsively.** Movement shows where something came from or that a tap
  was felt. No confetti loops, no streak flames, no bouncing reminders, nothing that plays without a touch
  or a screen change.
- **Gentle and short.** Entrances 250 to 450 ms, presses about 120 ms, decelerating curve
  `cubic-bezier(0.22, 1, 0.36, 1)` (same as the landing page). Younger age groups (b1, b2) get slightly
  bigger, bouncier presses; teens (b4, b5) get quieter ones.
- **Respect "reduce motion".** When the device asks for less motion, movement becomes a plain fade or
  nothing. Use `AccessibilityInfo.isReduceMotionEnabled()` on phones and `prefers-reduced-motion` on the web.
- **Only transform and opacity** are animated (cheap on old phones), with `useNativeDriver: true` on phones.
- **One typeface on the website:** Manrope, already self-hosted for the landing page. Phones keep the
  system font for now (adding it needs `expo-font`; see U8).
- Colours stay as they are in `theme.ts`: they already pass contrast checks and each age group has its accent.

### Tasks

All motion is built with React Native's built-in `Animated` API (no new dependency; works on phones and web).

- [ ] **U1 Motion kit.** New file `app/src/lib/motion.tsx`:
  `useReducedMotion()`, `EASE`, `FadeInUp` (opacity 0→1, translateY 12→0, `delay` prop for staggering),
  `PressScale` (wraps Pressable, scales to 0.97 on press with a spring back), `Shake` (imperative gentle
  horizontal shake for a wrong try), `Pop` (scale 0.9→1 with fade, for a correct answer or a star),
  `Pulse` (opacity loop for skeletons, off under reduced motion).

- [ ] **U2 Buttons, cards and toggles feel pressed.** In `app/src/components/ui.tsx`: `Button` and pressable
  `Card` use `PressScale`; `Toggle` knob slides with a spring instead of jumping; `ProgressBar` fills with an
  animated scaleX from its previous value; add a visible focus ring on web for `Button` and `Card`.

- [ ] **U3 Skeleton loading.** `Loading` in `ui.tsx` becomes a column of pulsing skeleton cards shaped like
  the real layout (title bar, three cards), with `accessibilityLabel="Loading"`. Fixes G2.

- [ ] **U4 Screens arrive softly.** `Screen` in `ui.tsx` fades and rises its content once on mount. Lists
  stagger: child home subject cards (`learn/[childId]/index.tsx`), subject lesson list, profile picker
  (`profiles.tsx`), parent overview cards. Stagger 50 ms per item, capped at 8 items.

- [ ] **U5 Quiz feedback.** `app/src/components/QuizRunner.tsx`: the chosen option gently shakes when wrong
  and pops with a tick when right; a newly opened hint fades and slides in; the explanation fades in; the
  finish card pops once. No sounds, no confetti.

- [ ] **U6 PIN pad.** `app/src/components/PinPad.tsx`: each dot pops as a digit is entered, the dot row
  shakes on a wrong PIN, keys use `PressScale`, the modal sheet keeps its slide.

- [ ] **U7 Website typeface.** Add the three Manrope `@font-face` rules to `app/public/index.html` and make
  it the font for the whole web app (`#root, #root * { font-family: "Manrope", system-ui, sans-serif }`),
  then remove the duplicate `@font-face` from `app/src/landing/styles.ts`. Check headings still fit at 390 px.

- [ ] **U8 (later, needs a new dependency) Manrope on phones** with `expo-font`, and animated screen
  transitions tuned per age group. Not started on purpose: adding native dependencies needs a device test.

- [ ] **U9 Check everything in the browser** at 390 px and desktop, in light mode, with reduced motion on
  and off, and with the keyboard. Record the result in the log.

---

## Log

| Date | Task | Result | By |
|---|---|---|---|
