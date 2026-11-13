# Try it yourself

A step-by-step way to run Honest Learn on your own computer, sign in with a ready-made demo family, and check every improvement from the latest round.

You need **Node 22+** (check with `node -v`). Everything below runs locally; nothing is sent anywhere. Hoot uses its built-in mock tutor (the lesson's own hints) unless you set `ANTHROPIC_API_KEY`.

## 1. Start the app

From the repository root:

```bash
npm run dev
```

This installs both parts, builds the website and serves the website and the API together at **http://localhost:3000** (the first run takes a few minutes). Leave it running.

## 2. Create the demo family

In a second terminal, from the repository root:

```bash
node scripts/seed-demo.mjs
```

It prints the sign-in details and adds five children, one per age group (Mini 4, Sam 7, Ria 10, Dev 13, Asha 16). The details are also at the top of [`scripts/seed-demo.mjs`](../scripts/seed-demo.mjs). They are test credentials for a local pre-launch copy only. You can run the script again safely.

Open http://localhost:3000, choose **Sign in**, and use the email and password it printed. The parent PIN is in the same output.

## 3. What to click, and what you should see

| Try this | You should see |
|---|---|
| Sign in, then tap a child (for example Ria) | Child home with subjects, and a gentle **Try next** row of suggested lessons (no streaks, no timers pushing you) |
| Open a lesson, answer a quiz question wrong, open hint 1, 2, 3 | Hints open in order; the answer is shown only after all three, or after a correct try |
| Parent area (enter the PIN), open a child | **What they know**: outcomes grouped by subject as strong / practising / not started. It changes after you finish a lesson with a perfect first try |
| Parent area, unlock a topic (for example Politics) for Dev | Locked lessons appear for that child only after the PIN unlock |
| Child (age 6+) opens a lesson, then **Ask Hoot**, and types `what is 2 + 2` | A helpful hint-style reply, never the quiz answer |
| Ask Hoot: `I want to hurt myself` | A kind fixed reply with a helpline. In the terminal running `npm run dev` you will see a logged email "please check in with …" for the parent (only one per child per day, and it never contains the message) |
| Parent area, **Chats** | The flagged message and reply, readable only with the PIN |
| Enter the wrong parent PIN repeatedly | After 5 tries a lock; each repeat lock lasts longer (15 min, 1 h, 6 h, 24 h) |

Notes: the cleanup job (`/api/cron/retention`) exists only on Vercel; the local server cleans old data when it starts. On Windows use **PowerShell** for the Postgres test run: `$env:TEST_DB="pglite"; npx tsx --test test/api.test.ts` (run test files one at a time, running them all together can run out of memory).

## 4. Run the automatic checks

```bash
cd server
npm test            # API tests on SQLite
npm run test:pg     # the same on Postgres (PGlite)
npm run validate    # lessons, resources, knowledge map (shows warnings)
npx tsc --noEmit    # type check
cd ../app
npx tsc --noEmit && CI=1 npx expo lint
cd ..
node scripts/check-doc-counts.mjs   # docs agree with the content counts
```

## 5. Try Hoot with the real AI (optional)

```bash
cd server
ANTHROPIC_API_KEY=your-key npm run dev
```

Then run `npm run redteam` and read every reply (see `docs/HOOT_SAFETY_TESTS.md`). This is the step the review list says must happen before launch.

## 6. Start fresh

Stop the server and delete `server/data/` (the local database). Run step 1 and 2 again.
