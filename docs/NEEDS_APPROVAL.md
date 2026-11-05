# Needs a second pair of eyes before launch

Everything in Honest Learn was drafted with AI help and has **not yet been approved by a human expert**. This list ranks what to check, from most to least risky. Tick items off here (or in the [tracking issue PHANI465/honest-learn#1](https://github.com/PHANI465/honest-learn/issues/1)) as reviewers approve them.

**How to approve a lesson:** a reviewer checks it against [`REVIEWER_GUIDE.md`](REVIEWER_GUIDE.md) (the spreadsheets in `docs/review/` make this easy). After **two** approvals, set `"status": "reviewed"` and add both reviewers to the lesson file.

---

## 🔴 Priority 1: must be checked by a qualified expert

### A. Child-safety and medical content (a doctor or nurse, plus a child-safeguarding professional)
These give safety or health advice. A mistake here could cause harm.

- [ ] `b5-health-first-aid-cpr`: CPR rate/depth, hands-only CPR, AED, recovery position. **Medical review required.**
- [ ] `b3-health-first-aid-basics`: cuts, burns (20 minutes of cool water), calling emergency services
- [ ] `b2-health-staying-safe`: road, water, emergency numbers (112/911/999/000 examples)
- [ ] `b1-health-my-body` and `b2-health-body-safety`: body safety, safe and unsafe secrets. **Child-protection specialist.**
- [ ] `b4-health-substances`: nicotine, vaping, alcohol, drugs
- [ ] `b4-health-mental-health`, `b5-health-exam-stress`, `b3-health-big-feelings`: mental-health advice and when to seek help
- [ ] `b5-health-relationships-consent`: consent and abuse warning signs
- [ ] All other health lessons: `b1-health-clean-hands`, `b1-health-grow-strong`, `b1-health-my-feelings`, `b2-health-balanced-plate`, `b2-health-calm-down`, `b2-health-healthy-habits` (sleep hours), `b3-health-food-labels` (WHO sugar guidance), `b4-health-peer-pressure-friendship`, `b4-health-sleep-superpower` (sleep hours)

### B. 🔒 Sensitive topics (shown only after a parent unlocks them)
Review for accuracy, balance and age-appropriateness. Ideally include reviewers from **different faiths, regions and political views**.

- [ ] **Religion:** `b1-world-festivals`, `b2-world-religions`, `b3-world-festivals-of-light`, `b5-world-philosophy-ethics`
- [ ] **Politics and contested history:** `b4-world-government`, `b4-world-colonialism-wars`, `b5-world-citizenship`
- [ ] **Body, puberty and sexual health:** `b3-health-puberty`, `b4-health-puberty-relationships`, `b5-health-sexual-health` (a sexual-health educator or doctor; follow WHO/UNESCO sexuality-education guidance; check age-appropriateness for each country you launch in)

### C. Hoot (the AI helper): safety wording
- [ ] The tutor's instructions in `server/src/tutor.ts` (`tutorSystemPrompt`)
- [ ] The automatic replies when a child shares personal info or mentions self-harm or abuse (`precheck` and `wellbeingReply` in `server/src/tutor.ts`). A **child-safeguarding professional** should approve this wording. The helplines it names for each launch country are in `content/helplines.json` (15 countries, draft): re-check every number against its source, ideally by calling it, then change its `status`.
- [ ] Test Hoot with a real API key against the tricky child messages in `docs/HOOT_SAFETY_TESTS.md` (`cd server && ANTHROPIC_API_KEY=… npm run redteam`), and have a person read every reply in the report. None of this has run against the live AI yet.

### D. Legal (a lawyer familiar with children's privacy law)
- [ ] Privacy notice and terms: drafts in `docs/legal/PRIVACY_NOTICE.md` and `docs/legal/TERMS.md` (shown in the app from sign-up). Fill in the [bracketed] placeholders and check them against what the app does. Then run `node scripts/build-legal.mjs` and update `CONSENT_VERSION` in `server/src/app.ts`.
- [ ] Verifiable parental consent method for COPPA (US) and DPDP (India)
- [ ] Data retention period (default: chats deleted after 12 months)
- [ ] Trademark check for "Honest Learn"

---

## 🟠 Priority 2: facts and figures to double-check

- [ ] **Money lessons with country-specific rules:** `b5-money-taxes-payslips`, `b5-money-credit-loans`, `b5-money-bank-budget`, `b5-money-investment-scams`, `b5-money-living-skills`, `b5-math-financial`
- [ ] **Statistics and dates:** `b5-lang-public-speaking` ("more plastic than fish by 2050", a contested 2016 projection: consider replacing), `b3-world-maps-latitude` (Everest 8,849 m), `b3-world-child-rights`, `b4-world-history-cause-consequence`, `b5-world-globalisation`, `b3-sci-climate-environment`, `b4-sci-earth-climate-evidence`
- [ ] **All 44 brain puzzles** (`content/puzzles/*.json`): a second person should solve each one to confirm there's exactly one correct answer. One was already found ambiguous and fixed (b3-p7); `b5-p10` (the truth-teller puzzle) deserves an extra check.
- [ ] **All 27 free resources** (`content/resources.json`): confirm each is still free, has no ads aimed at children and suits the listed ages; then set `lastChecked`. Run `node scripts/check-links.mjs --write` first.
- [ ] **Validator warnings:** `npm run validate` (in `server/`) lists hints that mention the answer word-for-word. The current ones were checked and seem fine, but a reviewer should confirm.

## 🟡 Priority 3: standard two-reviewer check for everything else

- [ ] **Digital safety lessons** (scams, privacy, AI): 13 lessons (`b*-dig-*`)
- [ ] **All other lessons:** 175 lessons and 391 questions in total. Use `docs/review/lessons.csv` and `docs/review/questions.csv`.
- [ ] **Every quiz question's hints:** nudge → bigger hint → *similar* worked example, never the answer itself.

---

### Known limitations (not errors, but worth knowing)

- Newer lessons have 2 quiz questions; earlier ones have 2–3. Reviewers may want to add a third to some.
- Lessons are English-only for now.
- Wikipedia "Learn more", the link checker and the video checker were tested only with simulated responses, because the build environment had no internet access to those sites.
