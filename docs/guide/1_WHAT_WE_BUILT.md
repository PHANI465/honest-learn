# 1. What has been built so far

A plain-English record of everything done on Honest Learn up to **5 November 2026** (version 0.5). For how it all works, see [3. The project explained](3_PROJECT_EXPLAINED.md).

## The idea

A free, ad-free "knowledge hub" for children aged 3 to 18, before college. It works in any country and has one rule above all: **help, never hand over the answer.** Parents must create the account, and a parent PIN guards everything sensitive. It is funded by optional donations only: no ads, no tracking, no selling data, no streaks or leaderboards.

The owner made these decisions at the start:

| Question | Decision |
|---|---|
| Country | Universal, not tied to one country's curriculum |
| Ages | 3–18 (everything before college) |
| Language | English for now |
| Money | Free; donations welcome |
| Content | Mostly written and hosted in the app, plus links to the best free resources |
| Accounts | Required, created by a parent, with a PIN for sensitive things |
| Platforms | Website, Android (Play Store) and iPhone (App Store) |
| Name | Honest Learn (first called "Honest AI") |

## The numbers today

| | |
|---|---|
| Age groups | **5**: Little Explorers 3–5, Early Learners 6–8, Discoverers 9–11, Thinkers 12–14, Builders 15–18 |
| Subjects | **11**: Language & Reading, Math, Science, Our World, Health/Body/Feelings, Digital Life & AI Safety, Money & Life Skills, Thinking Skills, Arts & Music, Computing, Careers & College Prep (15–18) |
| Learning outcomes | **220**, all covered by at least one lesson |
| Lessons | **175** (all *draft* until two human reviewers approve them) |
| Quiz questions | **501**, each with 3 hints (nudge → bigger hint → worked example of a different problem) |
| Brain puzzles | **68** IQ-style practice puzzles in 5 age sets (never an IQ score) |
| Free resources | **27** hand-picked free websites (Khan Academy, PhET, Scratch, NASA Space Place, OpenStax…) |
| Helplines | **15** countries, for Hoot's safety replies (to be verified before launch) |
| Hoot safety tests | **92** red-team attack cases |
| Automated tests | **62** API tests, run on both SQLite and Postgres |
| Code | about 7,100 lines of TypeScript (server + app) |

## Timeline

All of this was built with Claude Code in sessions on 5 November 2026. The full history is in the git log (`git log --oneline`, about 40 commits).

| Step | What was added |
|---|---|
| **Research and plan** | Research on teaching each age, what parents and kids like and dislike in learning apps (including Reddit and app-store reviews: [`docs/RESEARCH_USER_FEEDBACK.md`](../RESEARCH_USER_FEEDBACK.md)), and the knowledge map of 220 outcomes ([`docs/KNOWLEDGE_MAP.md`](../KNOWLEDGE_MAP.md)). |
| **v0.1: the foundation** | The API server (accounts, parent PIN, child profiles, progress, quizzes with the hint ladder, Hoot the AI helper), the app for iPhone, Android and web, and the first lessons. |
| **Free resources and safe media** | Curated free websites per age and subject, short Wikipedia summaries ("Learn more", Simple English for 9–11), YouTube videos in the privacy-enhanced player, and link and video checkers. |
| **Account safety** | Email verification, password reset by emailed code, PIN reset with the password, sign-in rate limits, server-side screen-time limits, automatic deletion of old chats. |
| **Fair quizzes** | Options shuffled per child, so answers can't be shared ("it's always B"); only first tries count; spaced repetition brings lessons back for review. |
| **v0.2: tooling** | Continuous integration on GitHub, app-store build profiles, reviewer spreadsheets, checks that warn when a hint gives the answer away, screenshots. |
| **Puzzles and practice** | Brain puzzles, mixed practice quizzes per subject, weekly stats for parents. |
| **All content** | Lessons for every age and subject, covering all 220 outcomes, with 3 questions each, written by several Claude agents in parallel. |
| **v0.3: approvals** | README content catalogue, the list of what needs a human expert ([`docs/NEEDS_APPROVAL.md`](../NEEDS_APPROVAL.md)) and GitHub issue #1 to track approvals. |
| **App quality** | Offline mode (opened lessons work without internet), an accessibility pass (screen readers, contrast, text size), installable website. |
| **Hoot safety** | Verified helplines, stronger safety pre-checks, the red-team plan, draft privacy notice and terms ([`docs/legal/`](../legal/)). |
| **Deployment** | Website and API on one Vercel project, with Neon Postgres for storage, plus zero-configuration "pre-launch mode" so it runs with no settings at all. |
| **v0.4: polish** | Country picker (for helplines), full data export, share sheet on phones, "how to see the app" guide. |
| **Visual round** | Progress card, stars, "Keep going" card, lesson search, progress bars everywhere, wider layout on tablets and computers, per-subject progress for parents. |
| **Security and structure round** | Security review with 8 fixes ([`docs/SECURITY.md`](../SECURITY.md)), the API split into clear modules, "Sign out all other devices", better lesson pages, this documentation set. |

## Features, by who uses them

### For parents
- Create the family account (email, password, PIN), confirm you're an adult, accept the privacy notice.
- Add up to 8 children (nickname, birth year, avatar). The age group is chosen from the birth year, or set by hand if a child is ahead or needs more practice.
- **Parent area** (PIN, locks itself after 10 minutes): each child's week, lessons done, quiz score, per-subject progress, puzzle best, flagged chats.
- Per child: switch Hoot on or off, unlock sensitive topics (religion, body, politics), set daily minutes, give extra time today, read every Hoot chat.
- Country (optional) so Hoot can name the right helpline.
- Download all data, sign out, **sign out all other devices**, delete everything.

### For children
- Pick your profile ("Who's learning today?").
- Home: progress (lessons, stars, minutes left today), "Keep going" to the next lesson, search (9+), brain puzzles, subjects with progress bars.
- Lessons: short sections, "Did you know?" facts, "Try it!" activities, notes for grown-ups, "Read it to me" for young children, a Wikipedia summary for 9+.
- Quizzes: try, then hints in three steps, then the explanation; stars for getting everything right first time; lessons come back later for a quick review.
- Practice quizzes mixing questions from a subject, and brain puzzles.
- Hoot (ages 6+, if a parent allows): asks questions and gives hints, never answers; safe replies with a helpline if a child seems upset.
- Works offline for lessons already opened; the daily time limit applies on every device.

### For reviewers and the owner
- Reviewer guide and spreadsheets of every lesson and question ([`docs/REVIEWER_GUIDE.md`](../REVIEWER_GUIDE.md), [`docs/review/`](../review/)).
- The approval list ranked by risk, and a tracking issue.
- A launch checklist ([`docs/LAUNCH_CHECKLIST.md`](../LAUNCH_CHECKLIST.md)).

## What's left, and who does it

| Task | Who | Where |
|---|---|---|
| **Put the website online**: import the repository in Vercel (or click *Publish* in v0), then connect Neon storage and redeploy | Owner (3 minutes) | [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) §3 |
| Approve the content: two reviewers per lesson, experts for sensitive topics, safety and helplines | Human reviewers | [`docs/NEEDS_APPROVAL.md`](../NEEDS_APPROVAL.md), GitHub issue #1 |
| Test Hoot with the real AI (needs a Claude API key) and have a child-safety expert review the results | Owner + expert | [`docs/HOOT_SAFETY_TESTS.md`](../HOOT_SAFETY_TESTS.md) |
| Legal review of the privacy notice and terms (COPPA, GDPR-K and others) | Lawyer | [`docs/legal/`](../legal/) |
| Email sending (Postmark) and `LAUNCH=true` | Owner | [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) |
| App-store builds and listings (Apple developer account needed) | Owner | [`docs/LAUNCH_CHECKLIST.md`](../LAUNCH_CHECKLIST.md) |
| An independent security test of the live site | Security tester | [`docs/SECURITY.md`](../SECURITY.md) |
