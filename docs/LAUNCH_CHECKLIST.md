# Launch checklist

Status as of v0.1.0. ✅ = built, ⬜ = still to do.

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
- ✅ 16 starter lessons (all **draft**), covering all 5 age groups

## Content: before public launch

- ⬜ Hire or recruit reviewers (2 per lesson: subject expert + age/safety)
- ⬜ Review all 16 starter lessons and mark them `reviewed`
- ⬜ Write lessons for the remaining ~198 outcomes (target: at least 3 per subject per age group for launch)
- ⬜ Have someone from each major faith and region review the 🔒 religion and politics lessons
- ⬜ Pictures and illustrations for ages 3–8 (original or CC-licensed)
- ⬜ Curated, age-checked YouTube playlists (check "made for kids" status with the YouTube Data API before embedding)

## Legal and privacy: required

- ⬜ Write the real **privacy notice** and **terms**, and update `CONSENT_VERSION` in `server/src/app.ts` when they change
- ⬜ **Verifiable parental consent:** the current checkbox + email is *not* enough for COPPA (US, under 13) or India's DPDP Rules (under 18, enforceable from about May 2027). Add an FTC-approved method (e.g. a small card verification or ID check) or use a consent-management provider
- ⬜ **Email verification** and **password reset** (needs an email provider, e.g. Postmark or SES)
- ⬜ GDPR/UK Children's Code: complete a Data Protection Impact Assessment (DPIA)
- ⬜ Data processing agreement with Anthropic (AI) and your hosting provider; disclose the AI processor in the privacy notice
- ⬜ Decide data retention (e.g. delete chats after 12 months) and add a scheduled clean-up job
- ⬜ Trademark search for "Honest Learn" (USPTO, India IP office, EUIPO)

## App stores

- ⬜ **Apple Kids Category:** no third-party analytics or ads SDKs (none are used now; keep it that way); parental gate on links (✅ built); privacy "nutrition label"
- ⬜ **Google Play Families policy:** target-audience declaration, Teacher Approved application (optional), Data safety form, AI-content reporting (✅ built)
- ⬜ **Donations:** Apple only allows in-app donations for approved nonprofits. Until then, the donate button opens a website, and only from the PIN-protected parent area (✅ built that way). Check the current App Store guideline 3.2 before submitting
- ⬜ App icon, splash screen, screenshots, store descriptions
- ⬜ `eas.json` production profile with `EXPO_PUBLIC_API_URL`

## Engineering

- ⬜ Deploy the API with HTTPS, a strong `TOKEN_SECRET` and daily database backups
- ⬜ Rate limiting per IP on `/auth/*` (e.g. a reverse-proxy rule)
- ⬜ Move parent-chosen screen time to the server, so it applies across devices (now counted per device)
- ⬜ Offline mode: cache lessons a child has opened
- ⬜ Error monitoring that collects no personal data
- ⬜ Accessibility pass (screen reader, larger text, colour contrast)
- ⬜ Test on real low-end Android phones

## Later (Phase 3)

- ⬜ More languages (the content format is ready for translation files)
- ⬜ Teacher / classroom mode
- ⬜ Placement quiz per subject, to suggest a level
- ⬜ Register a nonprofit (unlocks in-app donations on iOS and grants)
