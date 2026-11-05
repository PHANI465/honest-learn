# 5. How Honest Learn can scale

How the project can grow from a test site to millions of families, more languages and countries, and much more content, without losing its rules (free, no ads, no tracking, never give the answer). Each section says what is true **today**, where the **limits** are, and what to do **at each stage**.

## Where it stands today

| | Today | Why it scales |
|---|---|---|
| Hosting | Vercel: static website + one API function | Serverless: Vercel starts more copies of the API when traffic grows; the website is served from a global CDN. |
| Database | Neon Postgres (serverless) | Grows storage and compute on demand; supports read replicas and connection pooling. |
| Content | 175 lessons as JSON (≈1 MB), loaded into memory at start-up | Reading from memory is instant; fine up to a few thousand lessons. |
| AI | Optional; 2 calls per Hoot message (reply + safety check); 40 messages per child per day | The daily limit caps cost per child; mock mode costs nothing. |
| Apps | One codebase for website, Android and iPhone | New features ship everywhere at once. |
| Quality | 62 automated tests on two databases; CI on every push | Safe to change quickly. |

The code is already split for growth: route modules (`server/src/routes/`), one database interface that works with SQLite and Postgres, and settings through environment variables.

## Stage by stage

### Stage 1: launch (up to ~10,000 families)
Nothing structural to change. Do:
- Set `LAUNCH=true`, a fixed `TOKEN_SECRET`, Postmark email and `CORS_ORIGINS` ([`DEPLOYMENT.md`](../DEPLOYMENT.md)).
- Use a paid Vercel plan (the free Hobby plan is for personal, non-commercial use) and a Neon plan with backups.
- Turn on Vercel's firewall rate limiting for `/api/auth/*`. Today's per-IP limit counts per server copy; the per-account limits are already in the database and hold everywhere.
- Watch errors in Vercel *Logs*. Add an error tracker that collects no personal data, or none at all.

### Stage 2: growing (10,000 to 100,000 families)
Where load comes from, in order:
1. **Screen-time ticks:** each active child sends one request per minute. 10,000 children learning at once ≈ 170 writes per second. *Fix:* send every 5 minutes instead of every minute (the server already counts minutes, so only `app/src/lib/timer.ts` and the tick handler change), or keep counters in a fast key-value store (for example Upstash Redis) and write them to Postgres once a day.
2. **Database round-trips:** the Neon HTTPS driver makes one request per query. *Fix:* switch `server/src/db-neon.ts` to Neon's pooled connection (WebSocket `Pool`) and group the parent-overview queries (today it asks a few queries per child, at most 8 children).
3. **Hoot cost:** the biggest variable cost. *Fix:* use a smaller, cheaper model for replies (set `TUTOR_MODEL`) while keeping a strong model for the safety check, and use prompt caching for the lesson context. Measure cost per active child per month and set `TUTOR_DAILY_LIMIT` to match donations.
4. **Shared caches:** the Wikipedia summaries and the rate limiter live in each server copy's memory. *Fix:* move both to the same key-value store.
5. **Database housekeeping:** indexes exist for every frequent lookup (children by parent, progress by child, chats by child and lesson, reports by parent). Add Neon read replicas for the parent overview if needed.

### Stage 3: large (100,000+ families, several countries)
- **Regions:** run the API and database in more than one region (Vercel functions per region; Neon read replicas), and keep each country's data where its law requires (for example EU families in an EU database).
- **Content from a CDN:** publish lessons as versioned static files and let the API keep only answers, hints and explanations (still never sent early). Apps can then cache lessons for offline use without asking the API.
- **Background jobs:** move the data-retention clean-up from "first request of the day" (today, in `server/src/vercel.ts`) to a scheduled job (Vercel Cron), and add any future daily work there.
- **Status page and on-call:** a public status page, alerting, and a small rota.

## Scaling the content

Content is the real bottleneck: every lesson needs two human reviewers before launch.

| Need | Today | Next step |
|---|---|---|
| More lessons per outcome | 175 lessons for 220 outcomes | Aim for 2–3 lessons per outcome (different ways in, revision), plus more practice questions per lesson |
| Faster reviewing | CSV spreadsheets + GitHub | A small **review tool**: reviewers sign in, read a lesson as a child sees it, approve or comment; two approvals flip it to `reviewed`. Keeps the JSON format as the source |
| Volunteer or paid reviewers | The reviewer guide | A reviewer programme (teachers, subject experts, child-safety and cultural reviewers for sensitive topics), credited by name on each lesson |
| Freshness | Link and video checkers | Run `scripts/check-links.mjs` and `check-videos.mjs` weekly in CI; review lessons yearly |
| Writing with AI | Drafts written with Claude | Keep Claude for first drafts and translation; **humans always approve** |

## Languages and countries

The project is universal and English-only today. To add languages:
1. **App text:** move the screen text in `app/src/app/*.tsx` into translation files (for example with `i18next`), and pick the language from the device or a parent setting.
2. **Lessons:** add a language field (`content/lessons/<lang>/…` or `"lang": "hi"`), translate with AI, then review with native-speaking teachers. Examples in lessons (money, festivals, food) should become local in each language, not just translated.
3. **Hoot:** reply in the child's language; the safety pre-checks need word lists per language, and the red-team cases need translating too.
4. **Helplines:** `content/helplines.json` already supports countries; add each new country and verify the numbers.
5. **Right-to-left** scripts (Arabic, Urdu, Hebrew): React Native supports them; test every screen.

Curriculum fit: the knowledge map is deliberately universal. For a country, add an optional mapping of outcomes to its national curriculum (for example CBSE, Common Core, the UK national curriculum) so parents can see the match. Don't fork the content.

## New features that fit the rules

| Idea | Why it fits |
|---|---|
| **Teacher / classroom mode** (a teacher account sees a class's progress, with each parent's consent) | Brings schools in without ads or tracking |
| **More age-group features**: handwriting and drawing for 3–8, longer projects for 15–18 | Better learning, not more screen time |
| **Learning paths** ("get ready for secondary school") built from existing lessons | Reuses content |
| **Printable worksheets** generated from lessons | Learning off the screen |
| **Audio lessons** for young children and for accessibility | Reaches pre-readers and low-vision learners |
| **Low-data mode** and smaller app downloads | Reaches families with slow or expensive internet |

Things that do **not** fit, even at scale: ads, selling or sharing data, streaks, leaderboards, endless feeds, or nudges that pressure children to keep playing.

## People and process

| Stage | Team (can be volunteers) |
|---|---|
| Launch | Owner, 1 developer (or Claude Code), reviewers per subject, a child-safety advisor, a lawyer for the privacy notice |
| Growing | + content lead, + support person for parents, + part-time security review each year |
| Large | + engineers for regions and apps, + translators and reviewers per language, + a board if it becomes a non-profit |

Process that already scales: everything goes through GitHub with automated checks; `CLAUDE.md` lets any new Claude Code session (or person) learn the rules quickly; `docs/NEEDS_APPROVAL.md` and the issue tracker hold the review queue.

## Money

Free for families, funded by donations (the app already supports a donate button: set `EXPO_PUBLIC_DONATE_URL`). As it grows:
- Become a registered non-profit (or fiscally sponsored) so donations and grants are possible. Education foundations and open-education grants fit this project.
- Main costs, in order: Hoot (AI), hosting and database, email, app-store fees, reviewers and people.
- Keep Hoot optional and capped, so the core app costs very little per family even with no AI at all.

## Checklist for each stage

- [ ] **Launch:** `LAUNCH=true`, secrets set, email working, firewall rate limits, backups, Hoot red-team passed, legal review, content approved
- [ ] **10k families:** tick interval or KV counters, pooled database connections, cheaper reply model, shared cache, cost dashboard
- [ ] **100k families:** regions and data residency, lessons on a CDN, scheduled jobs, status page, yearly security test
- [ ] **New language:** app text translated, lessons translated and reviewed, Hoot word lists, helplines verified, right-to-left tested
