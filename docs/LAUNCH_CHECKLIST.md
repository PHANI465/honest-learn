# Launch checklist

Status as of v0.3.0. ✅ = built, ⬜ = still to do.

## Built so far

- ✅ Knowledge map: 5 age groups × 11 subjects, 220 outcomes, aligned to the UNESCO Global Proficiency Framework for reading and math
- ✅ Reviewer guide (writing rules per age, hint-ladder rules, licensing, review checklist)
- ✅ Mandatory parent account (18+ confirmation + privacy-notice consent recorded with version and time)
- ✅ Parent PIN (hashed, 5 wrong tries → 15-minute lock) protecting: profiles, levels, sensitive topics, Hoot on/off, chat review, outside links, extra screen time, export/delete
- ✅ Sensitive topics (religion, body, politics) hidden server-side until a parent unlocks them per child
- ✅ Child profiles with nickname + birth year only (no real names, photos or school)
- ✅ Lessons, quizzes and a server-enforced hint ladder; answers never sent to the app before they're earned
- ✅ Spaced-repetition review, honest first-try scoring
- ✅ Hoot AI tutor: none for ages 3–5, hints only, personal-info and wellbeing pre-checks, second-pass safety + answer-leak check, daily message cap, pre-written hint fallback
- ✅ In-app report button on lessons and on every Hoot reply (Google Play requirement for AI content)
- ✅ Parents can read every chat, see flagged messages, export all data and delete the account
- ✅ Daily time limit with a break screen
- ✅ Read-aloud for ages 3–8
- ✅ 175 lessons, 391 quiz questions (all **draft**), covering **all 220** knowledge-map outcomes
- ✅ 44 brain puzzles (IQ-style reasoning practice, honest framing, no IQ score) and mixed practice quizzes per subject
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
- ✅ Offline mode: lessons, lesson lists, puzzles and free resources a child has opened are saved on the device (never answers, parent-area data or Hoot chats) and shown with a "You're offline" notice; lessons finished and minutes learned offline are sent once when back online
- ✅ Install the website: web app manifest, home-screen icons and a service worker, so the website can be added to a phone's home screen and opens without internet

## Content: before public launch

- ⬜ Hire or recruit reviewers (2 per lesson: subject expert + age/safety)
- ⬜ Work through `docs/NEEDS_APPROVAL.md`: Priority 1 first (medical, safeguarding, sensitive topics, legal)
- ⬜ Review all 175 lessons and mark them `reviewed` (start with `docs/review/*.csv`)
- ⬜ **Medical review** of `b5-health-first-aid-cpr` and all health lessons
- ⬜ Add a third quiz question to newer lessons where reviewers think it helps
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
- ⬜ App icon, splash screen, screenshots, store descriptions
- ⬜ `eas.json` production profile with `EXPO_PUBLIC_API_URL`

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
