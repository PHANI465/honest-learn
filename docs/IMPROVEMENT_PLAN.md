# Improvement plan

What was suggested after the project review, what is built in this round, and what still needs people or outside services. Status is updated as work lands.

## Built in this round

| # | Package | What | Main files |
|---|---|---|---|
| 0 | Quick wins (done earlier) | Parent email on a wellbeing flag (once a day, no message text); token caps; deterministic answer-leak backstop; doc counts fixed | `server/src/tutor.ts`, `server/src/routes/tutor.ts`, `server/src/config.ts` |
| A | Hoot hardening | Daily message limit made atomic; wellbeing check also looks across the last few messages; ReDoS/fuzz tests for the pre-check regexes; cheaper reply model by default (safety check stays strong) | `server/src/tutor.ts`, `server/src/routes/tutor.ts`, `server/test/safety.test.ts` |
| B | Sign-in security | Escalating PIN/password lockouts; per-IP rate limit kept in the database so it holds on every server copy | `server/src/context.ts`, `server/src/routes/auth.ts`, `server/src/db.ts` |
| C | Content and CI quality | Validator warns when the correct option is always the longest; self-checking doc counts; weekly link/video check workflow; Windows-safe legal-sync test | `server/src/validate-content.ts`, `scripts/check-doc-counts.mjs`, `.github/workflows/` |
| D | Learning insight | Parent sees progress per knowledge-map outcome; child home suggests the next best lesson (no streaks, no pressure) | `server/src/routes/parent.ts`, `server/src/routes/learn.ts`, app parent screen |
| E | Scheduled housekeeping | Data-retention clean-up as a scheduled job (Vercel Cron) instead of "first request of the day" | `server/src/vercel.ts`, `vercel.json` |
| F | Try it yourself | Demo family seed script and a step-by-step guide | `scripts/seed-demo.mjs`, `docs/TRY_IT.md` |

## Not built here (needs people, money or outside services)

- Human review of all 175 lessons, medical, child-safeguarding, legal and sensitive-topic sign-off (`docs/NEEDS_APPROVAL.md`).
- Running the Hoot red-team against the live AI (needs an API key) and reading every reply.
- Vercel firewall rules, Postmark email, paid plans, backups, an independent security test.
- Translations and right-to-left testing; teacher/classroom mode; audio lessons; low-data mode.
- Error tracking service and app end-to-end tests (Playwright).
- New quiz question variants (content must be reviewed anyway).
