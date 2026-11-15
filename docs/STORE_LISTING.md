# Store listing and form answers (task T11)

Drafts for Google Play and the Apple App Store, written 15 November 2026 from what the code and the docs say. **Nothing here may be
submitted yet:** by the project's rule nothing is public-launch ready until humans approve the content (`NEEDS_APPROVAL.md`), the privacy
notice and terms need a lawyer, and the form answers below are **attestations a person must make in their own name**. An agent can draft
them; it cannot truthfully sign them. Where this page says "decide", it is the owner's call. [`MOBILE.md`](MOBILE.md) has the build steps.

## 1. What was checked in the build configuration (15 Nov 2026)

| Check | Result |
|---|---|
| `npx expo-doctor` | 20 of 20 pass (seven patch-level Expo packages were aligned first with `npx expo install --fix`) |
| Bundles | Android (1,698 modules), iOS (1,704) and web (889) all bundle; type check, lint and the Node-free proof (27 steps) pass |
| Android permissions | The generated manifest asks only for `INTERNET`. The defaults `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW` and `VIBRATE` were unused and are now removed (`android.blockedPermissions` in `app/app.json`). Checked in a real `expo prebuild` output, then deleted |
| Android backup | `allowBackup` is on; expo-secure-store's rules keep the app's secret keys out of backups (see `SECURITY.md`) |
| iOS Face ID text | `NSFaceIDUsageDescription` came from the secure-storage plugin's default although the app never uses biometrics; removed (`faceIDPermission: false`) |
| iOS privacy manifest | `ios.privacyManifests` now declares tracking = false and the "required reason" APIs the installed libraries use (file timestamp, disk space, user defaults, system boot time), copied from those libraries' own `PrivacyInfo.xcprivacy` files. None of them declares tracking or collected data |
| Icons | `icon.png` is 1024×1024 with no transparency (Apple's rule); Android adaptive icon layers present. **They are Expo's template placeholders, not Honest Learn artwork** |

**Not checked:** a real EAS build, installing an APK, any iOS native project (it can only be generated on a Mac: the iOS settings were checked in the resolved config only), the app on any
real phone, and the stores' own validators. Expo's tool also warns that `userInterfaceStyle: "light"` is not applied on Android unless `expo-system-ui` is installed (native dialogs may follow the phone's dark mode); the app's own screens are unaffected.

## 2. Decisions for the owner before the first submission

| # | Decision | Why it matters |
|---|---|---|
| 1 | **Which way does the store app work?** The store build asks on first run: "On this phone only" or "Connect to a server". Will the project also host a public server for families? | The privacy forms differ completely (section 4 and 5). If no project server exists, the project collects nothing and the forms say so |
| 2 | **Apple category.** The Kids Category is only for age bands 5 and under, 6 to 8 and 9 to 11. The app serves 3 to 18 | Choosing Kids means the app is judged as a kids-only app and teens are outside its bands. The alternative is a normal category (Education) with an age rating. Either way the rules for children's apps apply, so the no-ads and no-tracking facts matter in both |
| 3 | **Export compliance.** `ITSAppUsesNonExemptEncryption` is `false` in `app.json`. The app uses HTTPS (standard) **and** its own encryption code (AES-GCM for a family's saved AI key, scrypt, HMAC), shipped in the app in standalone mode | Whether that counts as "non-exempt" encryption is a legal question; the answer should be confirmed before the first upload, not assumed. If it does count, Apple asks for documents on each build and some countries need a filing |
| 4 | **Public web pages.** Google Play requires a privacy policy URL, and, for apps with accounts, a web page explaining how to delete the account and data. No public page exists yet | The website's privacy and terms pages need a public address; a short deletion page can say: parent area, Account, "Delete account and all data" (needs the password), or delete the app in standalone mode |
| 5 | **A splash screen and the logo.** Done in code on 15 Nov 2026 (`expo-splash-screen`, cream background, held until the app has loaded), but with a **placeholder badge**; **every icon in `app/assets/` and `app/public/icons/` is still Expo's template placeholder** | A real logo has to replace them before any store submission: see `PERSON_CHECKLIST.md` part 1 |
| 6 | **Version and label.** The app is `0.5.0`. The README says all content is draft | Do not call it 1.0 before the lessons are approved. If a pre-review build is shared (a GitHub Release APK), its listing must say lessons are drafts |
| 7 | **Support contact** and **organisation name** | Both stores show them; the privacy notice still has placeholders |

## 3. Listing text (drafts)

Facts only from the app and the docs. Replace the bracketed parts. Character limits are the stores' current ones (check them again when submitting).

**Name** (Play 30, Apple 30): `Honest Learn`
**Short description** (Play, 80): `Free learning for ages 3 to 18. No ads, no tracking, parents in control.`
**Apple subtitle** (30): `Free learning, ages 3 to 18`
**Keywords** (Apple, 100): `learning,kids,education,hints,quiz,sudoku,chess,spelling,parents,no ads,school,homework`
**Category:** Education

**Full description** (4,000):

> Honest Learn is a free learning app for children and teenagers aged 3 to 18. There are no ads, no tracking and no selling of data.
>
> **Lessons for every age.** Five age groups, eleven subjects, each with short lessons and quizzes. Every lesson shows its sources and whether teachers have reviewed it. [Say plainly how many are reviewed at the time.]
>
> **Helps, never cheats.** Quizzes use a hint ladder: a nudge, a bigger hint, then a worked example of a similar problem. Hoot, the owl helper (ages 6 and up), is designed to give hints and ask questions, never the answer, and every reply is checked again before a child sees it. A parent can switch Hoot off for any child.
>
> **Games and practice.** Sudoku, chess puzzles, playing chess against the computer, spelling, quick facts and memory games. No timers, no scores, no rankings, no streaks.
>
> **Parents in control.** A parent PIN protects settings, sensitive topics, chat history, outside links and extra screen time. Parents can read Hoot's chats, set daily time, add their own lessons, and download or delete everything.
>
> **Use it your way.** On this phone only: everything stays on the phone, with no account on any server and no email. Or connect to a server your family runs.
>
> Honest Learn is run by [organisation]. Lessons are drafts until two human reviewers approve them; each lesson shows its status. Privacy notice: [URL]. Contact: [email].

Do not add claims the docs do not support (for example "teacher approved" or "safe"); the lessons are drafts and Hoot has not had an independent safety review.

## 4. Google Play (Play Console), suggested answers

**App content**

| Form | Suggested answer | Notes |
|---|---|---|
| Target audience | Ages 5 and under, 6 to 8, 9 to 12, 13 to 15, 16 to 17 (the app is for 3 to 18) | Including under-13 groups brings in the Families policy |
| Ads | No ads | True: no ad SDK in the app |
| App access | Standalone mode needs no login: "Choose On this phone only, then create a family account on the device (no server, no email)." | Reviewers need no credentials. If a project server exists, add a demo family from `scripts/seed-demo.mjs` |
| Permissions | Only `INTERNET` | See section 1 |
| AI-generated content | The app has an AI helper (Hoot). Users can report a Hoot reply and a lesson in the app | Built: the report button on Hoot replies and lessons |
| News, health, government, financial, gambling | Not applicable | The lessons include health and first-aid topics: they are education, not a health app, but a reviewer may ask |
| Content rating (IARC questionnaire) | Suggested: no violence, no sexual content, no profanity, no gambling; the app does not let users talk to other users; an AI chat is included; some lessons cover sensitive topics (religion, body, politics) shown only after a parent unlocks them | The owner answers this personally |

**Data safety form.** Google counts data as "collected" when it leaves the device. Two cases:

| Data | Standalone only (no project server) | If the project hosts a server families use |
|---|---|---|
| Email address, password and PIN (hashed) | Not collected (kept on the device) | Collected: account management |
| Child nickname, birth year, avatar, settings | Not collected | Collected (personal info: name, "other"), app functionality |
| Learning progress | Not collected | Collected (app activity), app functionality |
| Hoot chats | Not collected unless the family connects their own AI model: then the text goes to the provider they chose (see below) | Collected (messages), app functionality, and sent to the AI provider that writes the replies (Anthropic) as a service provider |
| Device or other IDs, location, contacts, photos, files, audio | Not collected | Not collected |
| Ads or analytics | None | None |

Other facts to put in the form or its notes: data is encrypted in transit on public servers (`https`; plain `http` is accepted only for a computer on the family's own network); the family can **request deletion** (parent area, Account, delete, or remove the app on the device); a family can **download** its data; no data is sold; no data is shared for advertising. **Questions for the lawyer:** (a) a family's own AI model: is text sent to a provider the *parent* configured "shared" by the developer? (b) the phone itself fetches Wikipedia summaries for fixed lesson topics and plays YouTube videos in YouTube's privacy-enhanced player, so those services see the phone's internet address: how should that be described?

**Account deletion:** a web page is needed (section 2, decision 4).

## 5. Apple App Store Connect, suggested answers

| Item | Suggested answer / what to prepare |
|---|---|
| Category and age band | See decision 2. Rating: 4+ if no sensitive topics are shown by default (they are hidden until a parent unlocks them); the owner confirms in the questionnaire |
| Kids Category rules (if chosen) | No third-party advertising or analytics (true, none are used); a **parental gate** before links out of the app (built: outside links need the parent PIN under 13; donations open a website only from the PIN-protected parent area, Apple only allows in-app donation for approved non-profits, so check Guideline 3.2 first); no collecting personal data without parental consent; the privacy policy link |
| Privacy "nutrition label" | Standalone only: **Data not collected**. With a project server: contact info (email), identifiers/other user content (child nickname, birth year), usage data (progress) and user content (Hoot chats), all linked to the user, **not used for tracking** |
| Tracking | None (`NSPrivacyTracking` is false in the build) |
| Account deletion | Required in the app for apps with accounts: built (parent area, Account, delete, password) |
| Local network | The app explains it (`NSLocalNetworkUsageDescription`: connecting to the server the family chose, for example one at home). Reviewers may ask why; in standalone mode there is no local network use |
| Export compliance | Open (decision 3) |
| Review notes | "Open the app, choose On this phone only. No account or server is needed. Create a family account on the device (any email, any 8 character password, a 4 digit PIN). Parent area: tap Parent area and enter the PIN." |

## 6. Store assets a person must make

- **Icon:** the right size, but the picture is Expo's placeholder (1024×1024). **Feature graphic** (Google Play, 1024×500): not made.
- **Screenshots:** real ones from the app on a phone (Play needs at least two phone screenshots; with `supportsTablet: true` Apple also expects iPad screenshots; the stores list the exact sizes in their consoles). Suggested screens: the first-run choice, the profile picker, a lesson with its hint ladder, the games hub, chess against the computer, the parent area. Web renders are not app screenshots and should not be used as such.
- **Privacy policy page, support page, account-deletion page** at public addresses (decision 4).
- **Texts in other languages:** none yet; the app is English only.

## 7. Release steps

1. Owner's decisions in section 2; content reviewed; the privacy notice and terms approved.
2. Developer accounts (Google Play: one-time fee; Apple Developer Program: yearly fee), created by a person.
3. `cd app && npx eas-cli@latest build --platform android --profile production` (AAB) and `--platform ios --profile production`; try the `preview` APK on a real phone first, including standalone mode and a backup and restore.
4. Upload to the Play internal test track and to TestFlight; fix what the stores' automatic checks report; then production.
5. Re-read each store's rules at submission time: they change.
