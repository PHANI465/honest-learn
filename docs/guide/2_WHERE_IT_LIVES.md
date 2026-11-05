# 2. Where the project lives

Short answer: **the real home of Honest Learn is the GitHub repository [`PHANI465/honest-learn`](https://github.com/PHANI465/honest-learn).** It is not on your own computer yet, unless you download it (steps below).

## The places that hold a copy

| Place | What's there | Permanent? |
|---|---|---|
| **GitHub**: [github.com/PHANI465/honest-learn](https://github.com/PHANI465/honest-learn) | The master copy: all code, lessons, documents and the full history of every change. Every piece of work is pushed here. | **Yes.** This is the one to keep safe. |
| **Claude Code cloud sessions** (claude.ai/code) | Each session copies the repository into a temporary cloud computer at `/home/user/honest-learn`, works there, then pushes to GitHub. | **No.** The cloud computer is deleted after the session; anything not pushed is lost. (Everything so far has been pushed.) |
| **Vercel** (once you import it) | Builds the website and API from GitHub and runs them. Every push to `main` deploys again automatically. | Yes, as long as the Vercel project exists. It holds a *built* copy, not something you edit. |
| **Neon** (once connected in Vercel) | The database: parent accounts, children, progress, chats. **Not** in GitHub, on purpose: family data never goes into the code. | Yes. Back it up (Neon has point-in-time restore). |
| **v0** (if you use it) | A preview that imports the same GitHub repository. | Follows GitHub. |
| **Your computer** | Nothing yet. | Only after you download it. |

> **Nothing about families is stored in GitHub.** The repository holds code and lessons only. Family data lives in the database (Neon), and on each family's own device (their sign-in and offline lessons).

## Getting it onto your computer

Pick one:

**A. GitHub Desktop (easiest, no commands)**
1. Install [GitHub Desktop](https://desktop.github.com) and sign in with your GitHub account.
2. *File → Clone repository → `PHANI465/honest-learn`*.
3. Choose a folder, for example `Documents/GitHub/honest-learn` (the default).
4. Later, *Fetch origin → Pull* brings in new changes.

**B. Download a ZIP (just to look)**
Open the repository page → green **Code** button → **Download ZIP**. This is a snapshot only; it won't update.

**C. Command line**

```bash
git clone https://github.com/PHANI465/honest-learn.git
```

Then, to run it on your computer (needs [Node.js 22](https://nodejs.org)):

```bash
cd honest-learn
npm run dev
```

Open http://localhost:3000. The first run takes a few minutes while it installs and builds.

## Where things are inside the project

Wherever you put it, the folder looks like this (the full tour is in [4. How to navigate](4_HOW_TO_NAVIGATE.md)):

```
honest-learn/
├── app/        the app people see: website, Android and iPhone (Expo / React Native)
├── server/     the API: accounts, PIN, lessons, quizzes, Hoot (Node + Hono)
├── content/    all lessons, quizzes, puzzles, free resources and helplines (JSON files)
├── docs/       documents: this guide, deployment, security, reviewers, legal drafts
├── scripts/    small tools that regenerate catalogues and review spreadsheets
├── api/        the one-line entry that lets Vercel run the server
├── vercel.json how Vercel builds and serves the site
├── README.md   the front page on GitHub (with the full lesson catalogue)
└── CLAUDE.md   notes that tell Claude Code how this project works
```

## Continuing the work with Claude Code

- **In the browser:** open [claude.ai/code](https://claude.ai/code), pick the `PHANI465/honest-learn` repository and describe what you want. Claude reads `CLAUDE.md` first, so it knows the project's rules.
- **On your computer:** after cloning (above), install Claude Code and run `claude` inside the `honest-learn` folder.

Either way, the work ends up in GitHub, which stays the single source of truth.
