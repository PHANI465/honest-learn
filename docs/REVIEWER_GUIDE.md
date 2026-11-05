# Honest Learn — Content Writer & Reviewer Guide

This guide is for the people who write and review Honest Learn lessons. Everything we publish must pass this guide. The brand promise is **honest**: correct, sourced, age-appropriate and never manipulative.

## 1. The workflow

1. **Draft:** a lesson is drafted (by a writer, or by AI) against one or more outcome IDs from `KNOWLEDGE_MAP.md`.
2. **Review 1 (subject):** a subject specialist checks facts, accuracy and the quiz.
3. **Review 2 (age & safety):** a teacher or parent of that age group checks language level, tone and safety.
4. **Publish:** status changes from `draft` to `reviewed`. Both reviewers' initials and the date go in the lesson file.

The app shows a **"Draft: not yet reviewed"** badge on any lesson that hasn't been through both reviews. Draft lessons must never be shown to the public in production.

## 2. Lesson format

Each lesson is one JSON file in `content/lessons/<band>/<subject>/<slug>.json`:

```json
{
  "id": "b2-math-adding-tens",
  "title": "Adding with tens and ones",
  "band": "b2",
  "subject": "math",
  "outcomes": ["b2-math-2"],
  "sensitive": null,
  "minutes": 10,
  "status": "draft",
  "reviewers": [],
  "sources": [{ "title": "…", "url": "…", "license": "CC BY 4.0" }],
  "sections": [
    { "type": "text", "body": "Short paragraphs. One idea per section." },
    { "type": "tryit", "body": "A hands-on activity or a question to think about." },
    { "type": "parent", "body": "Only for b1/b2: a tip for the parent sitting with the child." },
    { "type": "video", "videoId": "11-char YouTube id", "body": "Why we picked this video (shown as the caption)." }
  ],
  "quiz": [
    {
      "q": "Question text",
      "options": ["A", "B", "C"],
      "answer": 0,
      "hints": ["Small nudge", "Bigger hint", "Worked example of a SIMILAR problem"],
      "explain": "Shown only after a correct answer, or after all hints are used and the learner has tried."
    }
  ]
}
```

## 3. Writing rules by age band

| Band | Sentence length | Lesson length | Rules |
|---|---|---|---|
| Little Explorers (3–5) | 3–6 words | ≤ 5 min | Every section must work **read aloud**. Use emoji/pictures. Always include a `parent` section. No reading required to answer a quiz. |
| Early Learners (6–8) | ≤ 10 words | ≤ 10 min | Concrete examples from daily life. Praise effort, not being smart. Include a `parent` section. |
| Discoverers (9–11) | ≤ 15 words | ≤ 15 min | One "try it at home" activity per lesson. Explain *why*, not just *what*. |
| Thinkers (12–14) | Natural | ≤ 20 min | Respectful, never babyish. Show more than one viewpoint where people genuinely disagree. |
| Builders (15–18) | Natural | ≤ 25 min | Real-world use, exam relevance, links to careers. |

## 4. The "never give the answer" rule (quizzes)

- Always list the **correct answer first** (`"answer": 0`). The app shuffles options for each child.
- `npm run validate` (in `server/`) warns when a hint contains the correct answer word-for-word. Check each warning.

- Every quiz question has **3 hints**, in this order:
  1. **Nudge:** points to what to think about. It never contains the answer.
  2. **Bigger hint:** narrows it down or gives a strategy.
  3. **Worked example:** solves a **different but similar** problem step by step.
- `explain` is shown only after the learner gets it right, or after they have used all hints *and* made an attempt.
- Wrong answers must be **plausible** (common mistakes), not silly, from age 9 up.

## 5. Universal content rules

- **No country bias:** use examples from many regions (names, foods, places, currencies). If a fact differs by country (e.g., the emergency phone number), say *"in many countries…"* and tell learners to check theirs.
- **Religion** is taught **descriptively**: "Many Hindus believe…", "In Islam…", "Some people are not religious and believe…". We never say one belief is true or false. Tag such lessons `"sensitive": "religion"`.
- **Body / puberty / relationships:** medically accurate, age-staged, tagged `"sensitive": "body"`.
- **Politics / contested history:** at least two perspectives, with sources from more than one country, tagged `"sensitive": "politics"`.
- Sensitive lessons are **hidden** until a parent unlocks that topic with their PIN.

## 6. Honesty and sources

- Every factual claim must be traceable to a source in `sources`.
- Prefer: encyclopedias, government/UN agencies (WHO, UNESCO, NASA), peer-reviewed reviews, open textbooks (OpenStax).
- If experts disagree, say so. If something is uncertain, say "scientists think…" or "we don't know yet".
- No ads, no product placement, no brand names unless necessary.

## 7. What we can host (licensing)

| Can copy into the app (with credit) | Link only (never copy) |
|---|---|
| Our own original writing | Khan Academy (non-commercial license and its terms of service) |
| CC BY, CC BY-SA, CC0, public domain | YouTube videos (embed only after checking "made for kids" status, via the API) |
| OpenStax, Wikipedia (CC BY-SA, with attribution), NASA, Project Gutenberg | NCERT, CK-12, BBC Bitesize, Crash Course and any "all rights reserved" content |

When in doubt: **link, don't copy**, and ask.

### Videos

- Only YouTube videos, played through the privacy-enhanced player. A reviewer must **watch the whole video**.
- Ages 3–11: the video must be marked "made for kids" by its creator. All ages: public, embeddable, not age-restricted, 20 minutes or less.
- Run `YOUTUBE_API_KEY=… node scripts/check-videos.mjs --write` to check these rules and stamp the date. Reviewed lessons can't include unchecked videos.

### Free resources (`content/resources.json`)

- Must be genuinely free (no paywall after a trial), with no ads aimed at children, and suitable for every band listed.
- Run `node scripts/check-links.mjs --write` to confirm links work, and record your own review in the spreadsheet.

## 7b. Working from the spreadsheets

`node scripts/export-review-sheet.mjs` creates `docs/review/lessons.csv` (one row per lesson, with sign-off columns) and `docs/review/questions.csv` (one row per quiz question). Import both into Google Sheets, share them with reviewers, and copy approved changes back into the lesson files.

## 8. Review checklist (copy into the review comment)

- [ ] Facts correct and sourced
- [ ] Matches the listed outcome IDs
- [ ] Reading level fits the band (sentence length rule)
- [ ] No country, gender, religious or cultural bias; examples are diverse
- [ ] Sensitive tag set correctly (or `null`)
- [ ] Quiz: answer index correct, 3 hints in the right order, no hint gives the answer away
- [ ] Wrong options are plausible
- [ ] Licensing OK for everything copied
- [ ] Safe: nothing frightening, shaming or dangerous to try at home without an adult
