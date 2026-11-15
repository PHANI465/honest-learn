# Sign language lessons (task T9)

Honest Learn plans to teach **American (ASL), British (BSL), Indian (ISL) and Mexican (LSM)** sign languages with vetted free videos.
Written 15 November 2026. **No sign language lesson exists yet, on purpose.** This page says what is built, what a person must do next,
and what was found when the sources were checked.

## 1. Why there are no lessons yet

An AI model cannot check that a sign is made correctly, and nothing in this repository can. A **person, ideally a Deaf signer or a
qualified teacher of that sign language, must choose and approve every video**, and the project rule is that nothing is invented.
So the code was built around the videos, and the lessons wait for a reviewer. Section 4 shows a second reason: every source checked
so far asks for permission before its videos are reused.

## 2. What is built

| Piece | Where | What it does |
|---|---|---|
| A lesson can be a sign language lesson | `signLanguage` (`asl`, `bsl`, `isl`, `lsm`) in `server/src/content.ts` (`Lesson`) | Shown only to children whose sign language is that one |
| The child's sign language | `children.sign_language` (`server/src/db.ts`), `signLanguage` in the child settings (`ChildPatch`), `childSignLanguage()` in `models.ts` | The parent's choice; if none, the one the family's country suggests (US: ASL, UK or GB: BSL, India: ISL, Mexico: LSM); any other country: none until the parent chooses |
| Filtering | `visibleTo()` in `server/src/context.ts` | A lesson in another sign language cannot be listed or opened by id |
| Parent setting | "Sign language" card in `app/src/app/parent/child/[id].tsx` | **Appears only when at least one sign lesson exists** (`/content/map` returns `signLanguages`), and lists only languages that have lessons. "Automatic" goes back to the country's default |
| A "watch this lesson in sign language" slot | `signVideoId` on any lesson; a card on the lesson screen | Empty until signed versions of lessons exist: there is no honest automatic way to make them |
| The reviewer's record | `videoChannel`, `videoLicence`, `videoCheckedOn`, `videoMinutes` on the video section; `signReviewer` on the lesson | Required by `npm run validate` (below) |
| The subject tile | `sign` in `subjectEmoji` (🤟) | Appears on the child home by itself once a `sign` subject has lessons |

Tests: `server/test/sign-language.test.ts` (18; they use fixture lessons built inside the test, nothing in `content/`).
Looked at in a browser with fixture lessons in a temporary copy of the content: the setting card, the subject tile, only the
child's language listed, the "watch in sign language" card and the lesson's own video.

### Rules `npm run validate` enforces for every lesson that has `signLanguage`
1. At least one `video` section, and a `text` section that **describes each sign in words** (handshape, location, movement) for people who cannot see the video well.
2. Every video section records `videoMinutes`, `videoChannel` (who made it), `videoLicence` (the licence or the permission, with its date) and `videoCheckedOn` (the date `scripts/check-videos.mjs` was run).
3. **The quiz length follows the video length**: under 2 minutes 2 questions, 2 to 5 minutes 3, 5 to 10 minutes 4, longer 5. Questions must ask about what was shown, so they cannot be answered without watching (for example "Which handshape starts the sign for 'thank you'?").
4. Status `reviewed` needs a `signReviewer`: `{ "name": "...", "role": "deaf-signer" | "qualified-teacher", "date": "YYYY-MM-DD" }`, as well as the usual two `reviewers`. The code cannot tell whether that person really is one; it only makes sure someone is named and can be asked.

## 3. How to add the first lesson (for a person, or an agent given approved videos)

1. A reviewer chooses a video and gets **written permission** (section 5). Record who, when, and how.
2. Run `node scripts/check-videos.mjs` on the video id (it checks the video can still be embedded). The video must be on YouTube: the player is YouTube's privacy-enhanced one. A video hosted elsewhere can only be a link out (children under 13 need the parent PIN to follow it, `ExternalLink.tsx`).
3. The **first** sign lesson also has to add the subject and its outcomes to `content/knowledge-map.json` (done by hand: the file is kept in its compact layout, do not rewrite it with a JSON tool):
   - in `subjects`: `{ "id": "sign", "name": "Sign language", "icon": "🤟" }` (no `bands` limit: all five age groups)
   - in `cells`: for each age group that gets lessons, `{ "band": "b3", "subject": "sign", "outcomes": [ { "id": "b3-sign-1", "text": "..." } ] }`. Add outcomes only for lessons that exist: an outcome with no lesson shows as "not started" for every child.
   - The planned outcome list (from the owner's guide), per language: the fingerspelling alphabet, numbers, greetings, family, feelings, school words, question words, everyday phrases, Deaf culture and etiquette.
4. Add `content/lessons/<band>/sign/<lesson-id>.json` shaped like this (the id should say the language, for example `b3-sign-greetings-asl`):

```json
{
  "id": "b3-sign-greetings-asl", "title": "...", "band": "b3", "subject": "sign",
  "outcomes": ["b3-sign-1"], "sensitive": null, "minutes": 8, "status": "draft",
  "reviewers": [], "sources": [{ "title": "...", "url": "https://...", "license": "..." }],
  "signLanguage": "asl",
  "sections": [
    { "type": "text", "body": "A short introduction." },
    { "type": "video", "body": "Why this video.", "videoId": "11CharsHere", "videoMinutes": 1.5,
      "videoChannel": "Who made it", "videoLicence": "The permission, with its date", "videoCheckedOn": "2026-11-15" },
    { "type": "text", "body": "Each sign in words: handshape, where it is made, how it moves." }
  ],
  "quiz": [ "2 questions for a video under 2 minutes ... each with 3 hints and the correct option first" ]
}
```

5. Add a `parent` note section for ages 3 to 8 (the validator requires it for `b1` and `b2`).
6. Run the generators and checks in `CLAUDE.md` (`build-catalogue`, `export-review-sheet`, `build-knowledge-doc`, `bundle-content`, `check-doc-counts`), tick the lesson in `NEEDS_APPROVAL.md` section E, and keep it `"status": "draft"` until the reviewers named in section 6 approve it.

## 4. The sources checked (15 November 2026)

Each source's own terms were read. **Terms change: a person must re-read them before relying on any of this.** The short version: **free to watch is
not the same as free to reuse**, and every source below asks for permission or says no.

| Source | Language | What it offers | What its terms say (summarised) | Verdict |
|---|---|---|---|---|
| Indian Sign Language Research and Training Centre (ISLRTC, a department of the Government of India) <https://islrtc.nic.in/> | ISL | A dictionary (website, YouTube channel and a data.gov.in dataset), "educational concept videos", a video gallery, an official YouTube channel | Its copyright policy says the content may not be reproduced, in part or whole, without permission from the Department of Empowerment of Persons with Disabilities; referring to it from another website is allowed if the source is acknowledged | **Ask the Department for permission** to embed its YouTube videos. The data.gov.in dataset page did not load from the checking machine (timed out), so its licence was **not read** |
| BSL SignBank, UCL <https://bslsignbank.ucl.ac.uk/> | BSL | A dictionary with videos of Deaf people signing, fingerspelling, regional signs, learning resources | Copyright is held by DCAL at University College London; videos are for the public's non-commercial use; licences are not available and bulk downloads are not allowed outside funded collaborations | Its videos are on its own site, not YouTube: **a link out only**, and the licence cannot be had. Ask DCAL if embedding a few videos might be allowed |
| National Association of the Deaf (US) <https://nad.org/> | ASL | An official YouTube channel (@nad1880); its terms mention ASL videos on its website | Its terms say the content, including ASL videos, may not be copied, reproduced or used without written permission, except for personal non-commercial use | **Ask NAD for written permission** for specific videos |
| ASL University, Lifeprint (Dr. Bill Vicars; its home page says "Deaf-led instruction since 1997") <https://www.lifeprint.com/> | ASL | A large free curriculum and an extensive YouTube channel | Its permission page says no use in apps or online tools, no embedding of its videos in an app, and that it does not want to be asked; only self-study and in-person teaching are allowed | **Do not use, and do not ask.** The creator has said so plainly: respect it |
| Secretaría de Educación Pública (Mexico), Nueva Escuela Mexicana Digital <https://nuevaescuelamexicana.sep.gob.mx/contenido/recurso/23891/> | LSM | A Mexican Sign Language dictionary as a **PDF** (not video), plus an alphabet and a manual listed as separate resources | The page footer says all rights are reserved; the site is marked as a beta version | Not video, so nothing to embed. **Ask the SEP** whether signed videos exist and may be used. (Searches also list an older SEP dictionary called DIELSEME; it was not checked whether it is the same file) |

**Not checked:** Gallaudet University and NTID (ASL), the British Deaf Association (BSL), Spanish-language Deaf associations in Mexico (for example the Mexican Federation of the Deaf), and any
channel not named above. A reviewer from each language community will know better sources than a list made by an AI.

**What an agent cannot do here:** judge whether a video's signing is correct, natural or regionally right; check a Deaf creator's wishes beyond what the page says; or grant permission.

## 5. A draft permission request (not sent: a person must send it, in their own name)

> Hello. Honest Learn is a free, ad-free learning app for ages 3 to 18, run by [organisation]. We would like to show your video [title and address]
> inside a lesson on [language], played from YouTube's privacy-enhanced player, followed by a short quiz that checks it was watched. We would credit you by
> name and link to your channel. The app has no ads, no tracking and no payment. A [Deaf signer / qualified teacher] named [name] will check how it is used.
> May we have your written permission, and is there anything you would like us to do or not do? We will keep a record of your reply. Thank you.

Keep the reply with the lesson's records and put its date in `videoLicence`.

## 6. Who must approve what (also listed in `NEEDS_APPROVAL.md`)

| Language | Reviewer needed |
|---|---|
| ASL | A Deaf ASL signer, or a qualified ASL teacher |
| BSL | A Deaf BSL signer, or a qualified BSL teacher |
| ISL | A Deaf ISL signer, or a qualified ISL teacher (ISLRTC can suggest people) |
| LSM | A Deaf LSM signer (señante), or a qualified LSM teacher |

## 7. Not done, and ideas

- No sign language lessons, no `sign` subject and no outcomes in the knowledge map: all wait for a reviewer's videos (section 3).
- No "Sign language" tile or screen of its own: the subject tile does the job once lessons exist. A separate entry can be added if wanted.
- The setting asks the parent to choose among languages that have lessons; a family whose country has no default sees none until then.
- Captions: sign language videos should have captions or a transcript for parents who do not sign; the `text` section covers the signs in words, but there is no check that the video itself is captioned.
- Not tried on a phone (the website was used).
