# Launch checklist

Status as of 15 November 2026 (v0.5.0). ✅ = built, ⬜ = still to do. Built means written and tested by automated checks and a browser: **nothing has been run on a real phone**. **The single list of what needs a person is [`PERSON_CHECKLIST.md`](PERSON_CHECKLIST.md).**

## Built so far

- ✅ Knowledge map: 5 age groups × 11 subjects, 262 outcomes, aligned to the UNESCO Global Proficiency Framework for reading and math
- ✅ Reviewer guide (writing rules per age, hint-ladder rules, licensing, review checklist)
- ✅ Mandatory parent account (18+ confirmation + privacy-notice consent recorded with version and time)
- ✅ Parent PIN (hashed; 5 wrong tries lock it, and repeated lockouts last longer: 15 minutes, 1 hour, 6 hours, 24 hours) protecting: profiles, levels, sensitive topics, Hoot on/off, chat review, outside links, extra screen time, export/delete
- ✅ Sensitive topics (religion, body, politics) hidden server-side until a parent unlocks them per child
- ✅ Child profiles with nickname + birth year only (no real names, photos or school)
- ✅ Lessons, quizzes and a server-enforced hint ladder; answers never sent to the app before they're earned
- ✅ Spaced-repetition review, honest first-try scoring
- ✅ Hoot AI tutor: none for ages 3–5, hints only, personal-info and wellbeing pre-checks, second-pass safety + answer-leak check, daily message cap, pre-written hint fallback
- ✅ In-app report button on lessons and on every Hoot reply (Google Play requirement for AI content)
- ✅ Parents can read every chat, see flagged messages, export all data and delete the account
- ✅ Daily time limit with a break screen
- ✅ Read-aloud for ages 3–8
- ✅ 218 lessons, 630 quiz questions (all **draft**), covering **all 262** knowledge-map outcomes
- ✅ 68 brain puzzles (IQ-style reasoning practice, honest framing, no IQ score) and mixed practice quizzes per subject
- ✅ Parent overview shows this week's lessons and minutes
- ✅ Online research on what parents and kids like and dislike in learning apps (`docs/RESEARCH_USER_FEEDBACK.md`)
- ✅ Ranked list of everything that needs expert approval (`docs/NEEDS_APPROVAL.md`)
- ✅ Quiz options shuffled per child (the right answer isn't always first)
- ✅ Free-resources directory: 27 hand-picked free sites by age and subject (each needs a reviewer check)
- ✅ Wikipedia "Learn more" (Simple English for ages 9–11, English for 12+), cached, only for titles set in lessons
- ✅ Video support: privacy-enhanced YouTube player, sandboxed; `check-videos.mjs` enforces made-for-kids/embeddable/≤20 min
- ✅ Email verification, password reset by emailed code, forgot-PIN reset with account password
- ✅ Rate limiting on sign-in routes; one-time codes are hashed, expire in 15 minutes and lock after 5 wrong tries
- ✅ Screen-time limits counted on the server (work across devices); parent can add minutes with PIN
- ✅ Automatic deletion of old chats (`CHAT_RETENTION_DAYS`)
- ✅ CI workflow, EAS build profiles, reviewer spreadsheets
- ✅ Offline mode: lessons, lesson lists, puzzles and free resources a child has opened are saved on the device (never answers, parent-area data or Hoot chats) and shown with a "You're offline" notice; lessons finished and minutes learned offline are sent once when back online; the "Did you know?" card keeps up to 40 facts a child has been shown (never one behind a parent's unlock) and shows them offline
- ✅ Install the website: web app manifest, home-screen icons and a service worker, so the website can be added to a phone's home screen and opens without internet

- ✅ v0.4: third quiz question on every lesson for ages 6–18 (630 questions), 68 brain puzzles
- ✅ API runs on Postgres (Neon) or SQLite; tests pass on both; Vercel project layout (website + API on one domain) with a demo mode
- ✅ Verified helplines for 15 countries + fallback; parents can choose a country so Hoot names the right helpline
- ✅ Stronger safety/personal-info detection with 92 written test cases; `npm run redteam` for live AI testing
- ✅ Draft privacy notice and terms (in the app at /privacy and /terms), for a lawyer to review

## Added since v0.3 (13 to 15 November 2026)

Details and what is still unverified for each are in the handover notes in [`AGENT_TASKS.md`](AGENT_TASKS.md). The single list of what needs a person is [`PERSON_CHECKLIST.md`](PERSON_CHECKLIST.md).

- ✅ **Security hardening** ([`SECURITY.md`](SECURITY.md)): escalating lockouts, signing out other devices, changing the password, deleting the account needs the password, rate limits shared across servers, strict headers
- ✅ **Accessibility settings per child** (T1): text size, dyslexia-friendly font, high contrast, automatic read-aloud ([`ACCESSIBILITY.md`](ACCESSIBILITY.md)); a screen reader and keyboard pass still needs a person
- ✅ **Quick facts** between activities (T2): 200 facts, each with a source link; **daily spelling** (T3): 637 words with spaced review and a British or American spelling setting; **30 quantitative and reasoning lessons** (T4). All draft
- ✅ **Games** (T5): Sudoku (generated, one solution each, server-checked hints), chess problems (32, each proven in code), **play chess against the computer** on the device, memory games (pairs, patterns, spot the change, sliding tiles, nonograms), and 13 lessons for them. No timers, scores or rankings
- ✅ **Parents can add their own lessons** (T10), private to the family
- ✅ **A family's own AI model and key** (T0, T6, T7): Ollama, LM Studio, OpenRouter, Groq or any compatible address; the key is stored encrypted and never shown; an address guard against server-side request forgery; Hoot is switched off for children when a model is connected; `npm run redteam` tests any model. No real model has been connected yet
- ✅ **Standalone phone app** (T8, [`STANDALONE.md`](STANDALONE.md)): "On this phone only" mode runs the whole API on the device with no server and no email; recovery phrase instead of password-reset email; one family per phone; lockouts that do not depend on the phone's clock; security review done
- ✅ **Wellbeing notice** in the parent area when Hoot flags a worry (in addition to the email on a server); children see only "a grown-up should open the parent area"
- ✅ **Phone first-run choice** and server address screen ([`MOBILE.md`](MOBILE.md))
- ✅ **Sign language: the code** (T9, [`SIGN_LANGUAGE.md`](SIGN_LANGUAGE.md)): per-child sign language, lesson filtering, validator rules, "watch this lesson in sign language" slot. **No lessons exist**: they need a Deaf signer or qualified teacher and the video owners' permission
- ✅ **Store preparation** (T11, [`STORE_LISTING.md`](STORE_LISTING.md)): build configuration checked and fixed (only `INTERNET` on Android, iOS privacy manifest), listing and form answers drafted
- ✅ **Open source licences** screen, `THIRD_PARTY_NOTICES.md` and a CI check that only permissive licences ship

## Content: before public launch

- ⬜ Hire or recruit reviewers (2 per lesson: subject expert + age/safety)
- ⬜ Work through `docs/NEEDS_APPROVAL.md`: Priority 1 first (medical, safeguarding, sensitive topics, legal)
- ⬜ Review all 218 lessons and mark them `reviewed` (start with `docs/review/*.csv`)
- ⬜ **Medical review** of `b5-health-first-aid-cpr` and all health lessons
- ⬜ Add a third quiz question to the lessons that still have two, where reviewers think it helps
- ⬜ Check every entry in `content/resources.json` (free, no ads aimed at children, right ages) and set `lastChecked`
- ⬜ Have someone from each major faith and region review the 🔒 religion and politics lessons
- ⬜ Pictures and illustrations for ages 3–8 (original or CC-licensed)
- ⬜ Choose videos for lessons (reviewers watch each one fully), then run `scripts/check-videos.mjs --write` with a YouTube API key

## Legal and privacy: required

- ⬜ Write the real **privacy notice** and **terms**, and update `CONSENT_VERSION` in `server/src/app.ts` when they change
- ⬜ **Verifiable parental consent:** the current checkbox + email is *not* enough for COPPA (US, under 13) or India's DPDP Rules (under 18, enforceable from about May 2027). Add an FTC-approved method (e.g. a small card verification or ID check) or use a consent-management provider
- ⬜ Create a Postmark (or similar) account for the verification/reset emails and set `POSTMARK_TOKEN` + `MAIL_FROM`
- ⬜ GDPR/UK Children's Code: complete a Data Protection Impact Assessment (DPIA)
- ⬜ Data processing agreement with Anthropic (AI) and your hosting provider; disclose the AI processor in the privacy notice
- ⬜ Confirm the retention period (default: chats deleted after 12 months) and state it in the privacy notice
- ⬜ Trademark search for "Honest Learn" (USPTO, India IP office, EUIPO)

## App stores

- ⬜ **Apple Kids Category:** no third-party analytics or ads SDKs (none are used now; keep it that way); parental gate on links (✅ built); privacy "nutrition label"
- ⬜ **Google Play Families policy:** target-audience declaration, Teacher Approved application (optional), Data safety form, AI-content reporting (✅ built)
- ⬜ **Donations:** Apple only allows in-app donations for approved nonprofits. Until then, the donate button opens a website, and only from the PIN-protected parent area (✅ built that way). Check the current App Store guideline 3.2 before submitting
- ⬜ App icon and logo (the files are Expo's placeholders), screenshots, store descriptions. Splash screen: built with a placeholder badge
- ✅ Build configuration checked 15 Nov 2026: Android asks only for `INTERNET`, iOS declares no tracking (privacy manifest), no unused Face ID text, `expo-doctor` 20 of 20. Store listing and form answers are drafted in [`STORE_LISTING.md`](STORE_LISTING.md); its section 2 lists seven decisions for the owner (including export compliance and public privacy and account-deletion pages)
- ✅ `eas.json` has `preview` (APK) and `production` (AAB) profiles, and the phone app asks for a server address on first run (no address is baked in); see [`MOBILE.md`](MOBILE.md). ⬜ Developer accounts, signed builds and store forms still need a person

## Engineering

- ⬜ Deploy the API with HTTPS, a strong `TOKEN_SECRET` and daily database backups
- ⬜ If running more than one server instance, move rate limits and the Wikipedia cache to a shared store (e.g. Redis)
- ⬜ Error monitoring that collects no personal data
- ⬜ Accessibility pass (screen reader, larger text, colour contrast)
- ⬜ Test on real low-end Android phones

## Later (Phase 3)

- ⬜ More languages (the content format is ready for translation files)
- ⬜ Teacher / classroom mode
- ⬜ Placement quiz per subject, to suggest a level
- ⬜ Register a nonprofit (unlocks in-app donations on iOS and grants)
