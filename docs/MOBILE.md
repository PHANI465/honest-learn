# Phone apps (Android and iPhone)

How to get Honest Learn onto phones: an Android app anyone can install, the Google Play and Apple App Store routes, and how the phone
app finds a server. Written for task T11 in [`AGENT_TASKS.md`](AGENT_TASKS.md), 14 November 2026.

**What exists today.** One Expo (React Native) codebase builds the website, Android and iPhone. `app/eas.json` has build profiles
(`development`, `preview`, `production`), `app/app.json` has the app's name, icons and ids (`org.honestlearn.app`), and the phone app has a
**Server address** screen so a family can point it at their own server. Since task T8 (14 Nov 2026) the phone app can also run with
no server at all ("On this phone only", see [`STANDALONE.md`](STANDALONE.md)); that mode has not been tried on a real phone yet. What does
**not** exist yet: a store listing, developer accounts and signed builds.

## 1. The server address (why a phone app asks for one)

The website talks to its own server. The first time the phone app opens it asks how the family will use it (`app/src/app/start.tsx`):
**On this phone only** (no server; see [`STANDALONE.md`](STANDALONE.md)) or **Connect to a server**, which asks for the address of an
Honest Learn server the family runs or trusts (`app/src/app/server.tsx`, `app/src/lib/server.ts`). The rest of this section is about the server way.
For the store forms: in "on this phone only" mode the app sends nothing to the project (no account on a server, no email).

- **On the home Wi-Fi:** run the server on your computer (see [`TRY_IT.md`](TRY_IT.md) and [`DEPLOYMENT.md`](DEPLOYMENT.md)) and type its
  address, like `192.168.1.20:8787`. The server listens on all network interfaces by default, so the only extras are allowing it through your computer's firewall and keeping the phone on the same Wi-Fi (find your computer's address in its network settings).
- **Anywhere else:** use an `https://` address, for example a copy you host on Vercel (the app also tries `/api` under the address you type).
- **Rules the app enforces** (`app/src/lib/server-address.ts`, tested in `server/test/server-address.test.ts`): plain `http://` is accepted only
  for `localhost` and private network addresses (10.x, 172.16 to 31.x, 192.168.x, `.local` names); everything else must be `https://`; no
  user names, queries or other schemes. The app checks that the address answers `GET /health` like an Honest Learn server before saving it,
  and the screen warns that everything the app sends goes to that server.
- **The build allows local `http` on purpose** (the owner chose this on 14 Nov 2026): Android builds set `usesCleartextTraffic` and iOS builds set
  `NSAllowsLocalNetworking` plus a local-network permission text, via the `expo-build-properties` plugin in `app/app.json`. The app's own check
  above is what keeps public servers on `https`.
- **A project that hosts its own public server** can bake the address into the build instead: set `EXPO_PUBLIC_API_URL` in the profile's `env` in
  `eas.json`. The store profiles have none on purpose, so the phone app asks.
- The address can be changed on the welcome screen ("Server settings") before signing in. It is stored on the device and holds no secret.

## 2. An Android app anyone can install (APK)

You need a free Expo account (a person must create it).

```bash
cd app
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

The first run asks to link the project to your Expo account. When the build finishes you get a download link for an **APK**. To share it:
download the file, create a **GitHub Release** on the repository, and attach the APK. People install it by opening the file on their phone
(Android asks them to allow installing from that source). `preview` uses `buildType: apk` and no built-in server, so each family types their own.

Anything built this way is a **draft**: all lessons are still drafts until two human reviewers approve them (see `NEEDS_APPROVAL.md`).

## 3. Google Play

Needs a Google Play developer account (a one-time fee, paid by a person). Then:

1. Build the store file: `npx eas-cli@latest build --platform android --profile production` (an **AAB**; `autoIncrement` raises the version code).
2. Create the app in Play Console and upload the AAB to an internal test track first.
3. Complete the forms below (a person must answer each truthfully).
4. Promote through testing to production.

**Forms and policies to prepare** (details in [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md)):

- **Target audience and Families policy:** the app is for children, so it falls under the Families policy. Declare the age groups (3 to 18).
- **Data safety form:** what is collected (email address for the parent account; per child a nickname, birth year and learning progress; Hoot chats), why,
  and that nothing is sold or used for ads. The privacy notice in `docs/legal/` is the source; a lawyer must approve it first.
- **AI-generated content:** Hoot is an AI helper. Play requires a way to report offensive AI content: the report button on Hoot replies is built.
- **Ads and analytics:** none. Keep it that way (no third-party SDKs).
- **Content rating questionnaire, store listing text, screenshots, icon and feature graphic.**

## 4. iPhone (App Store and TestFlight)

Needs an Apple Developer Program membership (a yearly fee, paid by a person). TestFlight also needs it. Without one, iPhone users use the installable
website (open it in Safari and choose *Add to Home Screen*).

1. `npx eas-cli@latest build --platform ios --profile production` and let EAS manage the signing credentials (it asks you to sign in to your Apple account).
2. `npx eas-cli@latest submit --platform ios` to send it to App Store Connect, then test with TestFlight.
3. **Kids Category:** no third-party analytics or ads (none are used), a parental gate before leaving the app (built: outside links need the parent PIN under 13).
4. **Privacy "nutrition label"** answers, the same facts as the Play data safety form.
5. **Local network:** the app declares a local-network permission text (for a server on the home Wi-Fi). Reviewers may ask why; the answer is in section 1.
6. **Donations:** Apple only allows in-app donations for approved nonprofits. The donate button opens a website from the PIN-protected parent area only.
   Check the current App Store guidelines (3.2) before submitting.

## 5. Checklist for a person

- ⬜ Create a free Expo account and run the `preview` build (section 2). Install the APK on a real phone, type a server address, sign in, finish one lesson.
- ⬜ Check the app on a real phone on the home Wi-Fi with a server on your computer (nobody has done this yet: it was tested only in a browser and with unit tests).
- ⬜ Create a Google Play developer account; complete the target-audience, data safety and content rating forms; upload an internal test build.
- ⬜ Create an Apple Developer account if iPhone users are wanted; complete the Kids Category and privacy answers; test with TestFlight.
- ⬜ Icon, splash screen, screenshots and store text (the icon files exist in `app/assets/`; check they meet each store's size rules).
- ⬜ Have the privacy notice and terms reviewed by a lawyer before any store submission.
- ⬜ Decide whether the stores should offer the app before the content is reviewed. By the project's own rule, nothing is public-launch ready until humans approve the content.

## 6. What was and was not tested (14 Nov 2026)

Tested: the server-address rules (`server/test/server-address.test.ts`, 14 tests: accepted and refused addresses, finding the server at the root or under
`/api`, refusing a web page that is not an Honest Learn server, giving up after a timeout); the web app still signs in through the new address code;
the build settings resolve (`npx expo config`: cleartext on Android, local networking on iOS).
**Not tested:** a real EAS build, installing an APK, the Server address screen on a real phone or emulator (it is hidden on the website), cleartext `http`
to a computer on a real network, an iOS build.
