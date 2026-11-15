# What needs a person

Everything an AI agent could build for Honest Learn has been built. What remains is work only a person can do: decide, try it on real
phones, review content, sign things, create accounts, ask permission. This page gathers every such item in one place, in a sensible order.
Collected on 15 November 2026 from `NEEDS_APPROVAL.md`, `LAUNCH_CHECKLIST.md`, `SECURITY.md`, `STORE_LISTING.md`, `SIGN_LANGUAGE.md`, `MOBILE.md` and the
handover notes in `AGENT_TASKS.md`. Those documents have the detail; this page says who, what and why, and where to look.

**How to use it.** Tick boxes here as you go. The rule that governs everything: **nothing is public-launch ready until humans approve the content**
(all 218 lessons are still drafts, and the AI helper has had no independent safety review). The app already labels every lesson "Draft: being checked by teachers".

| Part | For | Time it unblocks |
|---|---|---|
| 1. Decisions | The owner | Everything else; each takes minutes |
| 2. Try it on real devices | Anyone with an Android phone, ideally an iPhone, and a spare hour | Finds what automated tests cannot |
| 3. Expert content review | Doctors, safeguarding, teachers, faith and region reviewers | The biggest and slowest block |
| 4. Legal and privacy | A lawyer who knows children's privacy law | Store submission and launch |
| 5. Accounts and running it | The owner or a developer | Real builds and a real server |
| 6. Stores | The owner | Publishing |
| 7. Sign language | Deaf signers, qualified teachers, the owner | A whole subject that does not exist yet |
| 8. Other content | Illustrators, video choosers | Polish |
| 9. What an agent can do next | The owner decides | Nothing here needs a person except saying "go" |

---

## 1. Decisions only the owner can make

Quick, and they unblock the rest.

- [ ] **Project licence.** The repository has **no licence file** and no `license` field in any `package.json`. Everything about "compatible licences" (for example GPL software) depends on this. Decide, then add a `LICENSE`.
- [ ] **Does the project run a public server for families, or is the store app phone-only?** The store app asks on first run ("On this phone only" or "Connect to a server"). If no project server exists, the project collects nothing and the privacy forms say so. If one exists, it collects accounts, progress and chats. See `STORE_LISTING.md` section 4. This is the most important decision for the legal work.
- [ ] **Apple category.** Kids Category only covers ages 5 and under, 6 to 8 and 9 to 11; the app serves 3 to 18. Kids Category, or a normal Education listing with an age rating? (`STORE_LISTING.md` decision 2.)
- [ ] **Export compliance.** `ITSAppUsesNonExemptEncryption` is `false`, but standalone mode ships its own AES-GCM and scrypt code. Get the right answer before the first upload (`STORE_LISTING.md` decision 3).
- [ ] **Who is "Honest Learn"?** Legal name and address of the organisation, a support email, a privacy email, a `security@` email (`SECURITY.md` asks for it), and for India a Grievance Officer. These fill the bracketed placeholders in the privacy notice and terms.
- [ ] **Data retention.** Chats are deleted after 365 days by default. Confirm or change (`CHAT_RETENTION_DAYS`) and state it in the privacy notice.
- [ ] **May a pre-review build be shared** with a few families (for example a GitHub Release APK)? If yes, its listing must say lessons are drafts. If no, nothing is shared until content is approved.
- [ ] **A splash screen.** There is an image (`splash-icon.png`) but no splash package; adding `expo-splash-screen` needs your agreement.
- [ ] **Version label.** The app is `0.5.0`. Do not call it 1.0 before the lessons are approved.
- [ ] **Budget and pace for reviewers** (part 3): how many lessons, by whom, by when.

---

## 2. Try it on real devices

Nobody has run any of this on a real phone. All of it passes automated tests and a browser, which is not the same thing. Start with the `preview` Android
build (`MOBILE.md` section 2; it needs a free Expo account) or Expo Go (`cd app && npx expo start`, scan the QR code).

- [ ] **Standalone mode ("On this phone only").** Choose it, create a family, **write down the recovery phrase**, add a child, finish a lesson, open the hint ladder, play a game, ask Hoot something worrying and check the notice in the parent area, then reset the password with the recovery phrase. (`STANDALONE.md`, `AGENT_TASKS.md` T8c note.)
- [ ] **Speed on a cheap phone.** Signing in and entering the PIN use password hashing that has only been timed on a laptop (about 75 ms there). On a phone it could be many times slower. Also try chess against the computer on **Hard** (`SECURITY.md`, `STANDALONE.md` section 5).
- [ ] **Android backup and restore.** Confirm the family's data comes back and the app asks for the password again (the secret keys are deliberately not backed up).
- [ ] **"Connect to a server"** on the home Wi-Fi: run the server on your computer (`TRY_IT.md`), type its address, sign in. Also confirm plain `http` works only for a computer on the home network.
- [ ] **A real child, or a patient adult playing as one.** Is "Beginner" chess fair for a six-year-old? Are the games, the spelling screen and the hint ladder understandable? Is anything frightening, confusing or too long?
- [ ] **A real screen reader and the keyboard**, on the website and the phone app (TalkBack, VoiceOver): lessons, quiz, Sudoku, chess, the parent area. Never done (`ACCESSIBILITY.md`).
- [ ] **A low-end Android phone** and a slow connection: offline lessons, loading, memory.
- [ ] **An iPhone**, even without an Apple developer account: use the installed website (Safari, Add to Home Screen) and note anything wrong.
- [ ] **Hoot with a real model.** Run the red-team against Claude and read **every reply** (`cd server && ANTHROPIC_API_KEY=… npm run redteam`, `HOOT_SAFETY_TESTS.md`). The pass rate is not a verdict; a person ticks each reply pass or fail.
- [ ] **Hoot with a family's own model** (Ollama, LM Studio, OpenRouter or Groq): none has ever been connected for real, so the preset addresses come from their documentation only. Try the parent area's "Hoot's AI" screen, the test button, and one chat; run the red-team on that model too (`FREE_AGENTS.md`).
- [ ] **An independent security test** of the deployed site (`SECURITY.md` "Before launch"). The review so far is by the same project that wrote the code.

---

## 3. Expert content review

Every lesson needs **two reviewers** before it can be marked `reviewed`. Start with the risky ones (`NEEDS_APPROVAL.md` has the full ranked list; the spreadsheets in `docs/review/` make
checking easy; the writing rules are in `REVIEWER_GUIDE.md`).

**Priority 1: a qualified expert**

- [ ] **Medical:** a doctor or nurse for the first-aid lessons (especially CPR: rate, depth, hands-only, AED, recovery position) and every health lesson.
- [ ] **Child protection:** a safeguarding professional for body safety and "safe and unsafe secrets", consent and abuse warning signs, substances, and mental health.
- [ ] **Sensitive topics (hidden until a parent unlocks them):** reviewers from **different faiths, regions and political views** for the religion, politics and contested-history lessons; a sexual-health educator or doctor for the puberty and sexual-health lessons (WHO and UNESCO guidance).
- [ ] **Hoot's safety wording:** a child-safeguarding professional approves the tutor's instructions (`tutorSystemPrompt`) and the fixed replies for personal information, self-harm and abuse (`server/src/tutor.ts`).
- [ ] **Helplines:** someone checks each of the 15 countries' numbers in `content/helplines.json` (marked draft).

**Priority 2 and 3: standard two-reviewer checks**

- [ ] **All 218 lessons** marked `reviewed` by two people each (a subject expert plus an age and safety reviewer).
- [ ] **Maths:** a person checks every quantitative lesson, by age group (ages 6 to 18), especially the Doomsday and Zeller calendar lessons, compound interest and probability.
- [ ] **Quick facts:** spot-check at least 1 fact in 5 against its Wikipedia source (200 facts; each has a source link).
- [ ] **Spelling lists:** 637 words; check meanings and sentences, and the 32 words that differ between British and American spelling, which are new and written by Claude (`NEEDS_APPROVAL.md`, `SPELLING.md`).
- [ ] **Chess and Sudoku lessons and the 32 chess puzzles:** a chess player checks the lessons' explanations (the positions were proven by code, the teaching was not).
- [ ] **Free resources:** check each of the 27 websites (free, no ads aimed at children, right ages) and set `lastChecked`.
- [ ] **Quiz fairness:** `npm run validate` warns about 265 questions where the correct option is the longest, so children can guess it. Reviewers should rebalance these.
- [ ] **Wikipedia and video links:** run `node scripts/check-links.mjs`; videos need `scripts/check-videos.mjs --write` with a YouTube API key.

---

## 4. Legal and privacy

A lawyer familiar with children's privacy (COPPA, GDPR and the UK Children's Code, India's DPDP Act).

- [ ] **Privacy notice and terms.** Drafts in `docs/legal/` (shown in the app). Fill the brackets, check them against what the app really does, then bump `CONSENT_VERSION` in `server/src/models.ts` so families agree again. The text exists twice (`docs/legal/` and `app/src/content/legal.ts`); regenerate with `node scripts/build-legal.mjs`.
- [ ] **Verifiable parental consent.** A checkbox plus email is not enough for COPPA (US, under 13) or India's DPDP Rules (under 18, enforceable from about May 2027). Choose a method.
- [ ] **A Data Protection Impact Assessment** (UK/EU).
- [ ] **Data processing agreements** with the AI provider (Anthropic) and the hosting provider; check the AI provider does not train on the data and how long it keeps it.
- [ ] **The two open questions for the Play data safety form** (`STORE_LISTING.md` section 4): is text sent to an AI model a *parent* configured "shared" by the developer? How should the phone's fetching of Wikipedia summaries and YouTube videos (those sites see its internet address) be described?
- [ ] **The roles in "this phone only" mode,** where the organisation never receives the data (the privacy notice has a bracketed question for you).
- [ ] **Open-source notices.** Built 15 Nov 2026: an "Open source licences" screen (website footer, sign-up, welcome screen, parent area), `THIRD_PARTY_NOTICES.md` and the Manrope font licence, all generated from the packages that are really in the app (`node scripts/build-licences.mjs`; CI fails if stale or if a non-permissive licence appears). **For a lawyer to confirm:** is this enough? It does **not** yet list the native libraries React Native and Expo bring into the Android and iOS builds (networking, image and other libraries, several under Apache-2.0); those can only be listed once a real build exists, with the platform's licence tooling.
- [ ] **Apple and donations:** read the current App Store guideline 3.2 before submitting; until the project is an approved nonprofit the donate button only opens a website from the parent area.
- [ ] **Trademark search** for "Honest Learn" (USPTO, India IP office, EUIPO).
- [ ] **Project licence** (part 1) reviewed.

---

## 5. Accounts and running it

- [ ] **Expo account** (free) for builds. **Google Play developer account** (one-time fee). **Apple Developer Program** (yearly fee; needed even for TestFlight).
- [ ] **Hosting:** a Vercel project with the Neon database attached (`DEPLOYMENT.md`), a domain, HTTPS.
- [ ] **Secrets:** a strong `TOKEN_SECRET`, `AI_KEY_SECRET` (encrypts families' own AI keys) and `CRON_SECRET` (the daily deletion job refuses to run on Vercel without it), set in the host, never in the repository.
- [ ] **Email:** a Postmark (or similar) account for verification and reset emails; `POSTMARK_TOKEN` and `MAIL_FROM`.
- [ ] **Backups** of the database, daily; test one restore.
- [ ] **Error monitoring** that collects no personal data.
- [ ] **The switch:** set `LAUNCH=true` only after parts 3 and 4 (it hides unreviewed lessons and turns on email verification). With zero reviewed lessons the app would be empty, which is the point.
- [ ] **A `security@` mailbox** and switch on GitHub's private vulnerability reporting (`SECURITY.md`).

---

## 6. The stores

Drafts of everything are in `STORE_LISTING.md`; the answers are attestations a person makes.

- [ ] Public **privacy policy page**, **support page** and an **account-deletion page** (Google Play requires the last one).
- [ ] **Screenshots from a real phone** (and iPad, since the app supports tablets) and a **feature graphic** (1024×500) for Google Play.
- [ ] Google Play: target audience and Families policy, Data safety, content rating, AI-generated content declaration, listing text; upload to the internal test track.
- [ ] Apple: privacy "nutrition label", age rating, review notes, export compliance; upload to TestFlight.
- [ ] A **real EAS build** (`cd app && npx eas-cli@latest build --platform android --profile production`, and iOS) and a first install of the APK (`MOBILE.md`).
- [ ] Re-read both stores' rules on the day you submit; they change.

---

## 7. Sign language (ASL, BSL, ISL, LSM)

The code is ready and **no lesson exists**, by design: no AI can check that signing is correct. Full detail in `SIGN_LANGUAGE.md`.

- [ ] **A reviewer per language:** a Deaf signer or a qualified teacher of ASL, of BSL, of ISL and of LSM.
- [ ] **Ask permission before using any video.** Every source checked needs it: ISLRTC (India), UCL's BSL SignBank (link-out only; its videos are not on YouTube), the National Association of the Deaf (ASL), Mexico's SEP. Lifeprint (ASL) refuses use in apps and asks not to be asked: do not use it. A draft request is in `SIGN_LANGUAGE.md` section 5; **send it in your own name** and keep the replies.
- [ ] **Choose the first videos** with the reviewer; find better sources than the five that were checked (Gallaudet, the British Deaf Association and Mexican Deaf associations were not).
- [ ] **Check each video has captions** and run `scripts/check-videos.mjs`.
- [ ] Then an agent (or you) adds the first lesson by the recipe in `SIGN_LANGUAGE.md` section 3, together with the `sign` subject and its outcomes.

---

## 8. Other content

- [ ] **Pictures and illustrations for ages 3 to 8** (original or properly licensed).
- [ ] **Videos for ordinary lessons:** choose, watch fully, check embedding and licence.
- [ ] **Translations:** the content format is ready; no language beyond English exists.
- [ ] **Signed versions of lessons** ("Watch this lesson in sign language"): the slot exists and is empty.

---

## 9. What an agent can do next (you only need to say go)

None of these needs a person's expertise, only a decision to start.

| Task | Notes | Suggested model |
|---|---|---|
| ~~An "Open source licences" screen and a `NOTICE` file~~ **done 15 Nov 2026** | `THIRD_PARTY_NOTICES.md`, the screen, a CI guard. Open: the native libraries (part 4) | Sonnet, medium |
| **Add the `LICENSE` file** | After you decide the licence (part 1) | Any |
| **Fix the stale lines in `LAUNCH_CHECKLIST.md`** ("Built so far" stops at v0.3.0, and the README and `docs/README.md` said 220 outcomes instead of 262) | Docs only; the two README counts are fixed with this page | Haiku or Sonnet |
| **Stop a family's AI address being re-pointed between the check and the request** (DNS rebinding) | Pin the checked address for the connection (`SECURITY.md`, accepted risk) | Opus, high |
| **Show on the child side** that Hoot is using a family's own, untested model | `GET /content/hoot` only knows the default helper | Sonnet, medium |
| ~~Spelling: a British or American setting~~ **done 15 Nov 2026** | A per-family setting, 32 words that differ, `docs/SPELLING.md`. Open: a reviewer for the new words (part 3) | Sonnet, medium |
| ~~Save an unfinished chess game; hints that point at a piece~~ **done 15 Nov 2026** | Against the computer. Open: try it on a real phone and with a real child (part 2); the chess *puzzles* have their own server hints | Sonnet, medium |
| ~~Move a family between a phone and a server~~ **done 15 Nov 2026** | `POST /parent/import` and the transfer screen. Open: try it between a real phone and a real server (part 2) | Opus, high |
| **A splash screen** | After you agree to the package (part 1) | Sonnet, low |
| **Rebalance the 265 "longest correct option" quiz questions** | A reviewer must still approve the result | Haiku, low, with review |
| **Offline caching of quick facts** | Facts need the internet today | Sonnet, medium |

---

## If you want a first, careful release

1. Part 1 decisions (an afternoon).
2. Part 2 on your own phone, then on two or three trusted families' phones, clearly told it is a test.
3. Part 3 Priority 1 reviewers for health, safeguarding, sensitive topics and Hoot; then everything else, subject by subject.
4. Part 4 with a lawyer, in parallel.
5. Part 5, then part 6. Switch `LAUNCH=true` last.
