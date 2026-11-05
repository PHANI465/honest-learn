# Honest Learn privacy notice

> DRAFT: this must be reviewed by a lawyer before launch. It is not in force yet. Text in [square brackets] is a placeholder or a question for the lawyer.

Version 2026-11-v1 (draft). Last updated 5 November 2026.

## The short version

- We collect as little as we can: your email address, and for each child a nickname, birth year, settings, learning progress and Hoot chats.
- No ads. We never sell your data or share it for advertising. We don't use third-party analytics or tracking tools.
- You are in control. With your parent PIN you can see your children's progress and Hoot chats, download your family's data, and delete a profile or your whole account at any time.
- Hoot, the AI helper, is optional. When it is on, your child's messages are processed by our AI provider, Anthropic, to write and safety-check each reply.

## Who we are

Honest Learn is run by [legal name of the organisation, registered address and company or charity number]. We decide how your family's information is used, so we are responsible for it (the "controller" under GDPR and UK GDPR, the "operator" under COPPA in the US, and the "Data Fiduciary" under India's Digital Personal Data Protection Act).

Contact us about privacy at [privacy@honestlearn.example] or [postal address]. [If needed: our representative in the EU / UK is …] [India: Grievance Officer name and contact.]

## Who this notice is for

This notice is for parents and legal guardians aged 18 or over. Children can't create accounts. A parent creates a family account and adds each child as a profile. There is a short version for children at the end.

## What we collect and why

### About you, the parent

- **Email address**: to sign you in, send verification and password-reset codes, and contact you about your account.
- **Password and parent PIN**: stored only as scrambled one-way "hashes" (scrypt), never in readable form. We can't see them.
- **Your agreement**: which version of this notice you agreed to and when. To sign up you must also confirm you are a parent or legal guardian aged 18 or over.
- **Account security records**: when you verified your email, how many wrong password or PIN attempts were made recently, and any temporary lock. Verification and reset codes are stored as hashes and expire after 15 minutes.
- **When you created your account.**

### About each child (only what you enter)

- **Nickname**: please don't use your child's full real name.
- **Birth year**: just the year, not the full date of birth. We use it to pick the right lessons for their age.
- **Avatar**: one of our animal pictures. We never ask for photos.
- **Settings you choose**: level, which sensitive topics (religion, body, politics) are unlocked, whether Hoot is on, and the daily time limit.
- **Learning progress**: which lessons and puzzles your child finished, their best score, number of tries, when they finished, when a lesson is due for review, and which quiz questions they answered correctly.
- **Learning minutes**: minutes used each day and any extra minutes you gave, so the time limit works on every device. Deleted after 90 days.
- **Hoot chats**: the messages your child types to Hoot and Hoot's replies, with a note when a message was flagged (for example, personal information or a worry about their wellbeing). You can read every chat. If Hoot spots personal information such as a phone number or address, we store "[removed: personal information]" instead of what was typed. Chats are deleted automatically after 365 days. [Lawyer: confirm this period.]
- **Reports**: if you or your child report a lesson or a Hoot reply, we keep the reason, any details you add, and which lesson or message it was about.

### Collected automatically

- **Sign-in on the device**: a sign-in token is kept on the device (in the phone's secure storage, or the browser's storage on the web) so your family stays signed in for up to 30 days. The parent area needs your PIN again after 10 minutes.
- **IP address**: used for a few minutes, in memory only, to block repeated sign-in attempts. It is not saved in our database. Our hosting provider may keep standard server logs, including IP addresses, for security. [Name the provider and how long its logs are kept.]

### What we don't collect

We don't collect children's real names, photos, voice recordings, precise location, contacts, school names, advertising IDs or device fingerprints. Children can't message other users: there are no social features. Hoot asks children not to share personal information.

## Hoot, the AI helper

- Hoot is switched off for ages 3–5. You can turn it off for any child in the parent area.
- **Checks before any AI call**: if a message looks like personal information, or mentions self-harm, suicide or abuse, Hoot answers with fixed wording (telling the child to talk to a trusted adult, and naming a helpline where we can). These messages are **not** sent to the AI provider and are flagged for you.
- **What we send to Anthropic** (the company that makes the Claude AI) for other messages: your child's message, up to the last 12 messages of that lesson's chat, the lesson text and the quiz question they're working on (including the answer, so Hoot knows not to reveal it), your child's nickname and their age group (not their birth year). Each message uses two AI calls: one writes the reply, the second checks it is safe and doesn't give away the answer.
- Anthropic processes this only to provide the service to us, under our agreement with them. [Lawyer: confirm the data processing agreement and Anthropic's current commercial terms, including that our data is not used to train its models and how long it is kept.]
- If our server is not set up to use AI, Hoot uses the lesson's pre-written hints and nothing is sent to Anthropic.
- Hoot is a computer program and can make mistakes. Every reply has a report button.

## Who else handles information

We use a few service providers. They may only use the information to provide their service to us.

- **Hosting**: [provider name and region] runs our server and stores the database.
- **Email**: [Postmark] sends verification and password-reset emails. It receives your email address and the email's text.
- **AI**: Anthropic, only when Hoot is on (see above).
- **Wikipedia**: for ages 9 and over, our server fetches short "Learn more" summaries from Wikipedia based on the lesson's topic. Nothing about you or your child is sent.
- **YouTube videos**: some lessons may include a video in YouTube's privacy-enhanced mode (youtube-nocookie.com). When your child plays one, their device connects to YouTube (Google), which receives the device's IP address and may store some data on the device, as described in Google's privacy policy. We don't send Google any information about your account.
- **Outside websites**: our list of free learning websites opens other sites. Children under 13 need your PIN to open them. Those sites have their own privacy policies.
- **Read-aloud**: uses your device's or browser's built-in voice. We don't receive any audio. Some web browsers may use an online voice service from the browser's maker.
- **When the law requires it**: we may share information if the law requires it, or to protect a child from serious harm. [Lawyer: confirm wording and our safeguarding policy.]

We never sell personal information.

## How long we keep information

- Your account and your children's profiles and progress: until you delete them.
- Hoot chats: 365 days, then deleted automatically.
- Learning minutes: 90 days.
- Reports: kept while open; deleted one year after they are closed.
- Verification and reset codes: 15 minutes.
- Backups: [number] days. [Name where backups are stored.]

When you delete your account, everything is deleted from our live database straight away. Copies in backups are deleted within [number] days.

## Your choices and rights

In the parent area (with your PIN) you can:

- **See** your children's progress, Hoot chats, flagged messages and reports.
- **Download** your family's data ("Download all our data"): account details, children's profiles and settings, progress, Hoot chats and reports. [Engineering: the export doesn't yet include daily minutes or the list of solved quiz questions, and on phones it shows only the first part. Fix before launch so it is complete.]
- **Correct** a nickname, birth year or settings.
- **Delete** a child's profile, or your whole account and everything in it.
- **Turn Hoot off** for any child.

You can also contact us at [privacy@honestlearn.example]. We will reply within [one month]. Depending on where you live, you may have extra rights:

- **EU and UK (GDPR, UK GDPR)**: access, correction, deletion, restriction, data portability and objection, and the right to complain to your data protection authority (in the UK, the Information Commissioner's Office). [Lawyer: confirm our legal basis: parental consent and/or providing the service you asked for.]
- **United States (COPPA)**: you can review the information collected from your child under 13, have it deleted, and refuse further collection.
- **India (DPDP Act)**: you can ask for a summary of the data, correction and erasure, use our grievance process, nominate someone to act for you, and complain to the Data Protection Board of India.

To stop all processing, delete your account. This also withdraws your consent.

## Children's privacy

- Honest Learn is for children aged 3 to 18, used through a parent's account. Children don't need an email address or password.
- **United States (COPPA)**: we collect information from children under 13 only with a parent's consent. [Lawyer: today consent is an email address plus a checkbox, which is not enough for COPPA. A verifiable parental consent method must be chosen before launch. Check this notice against the amended COPPA Rule (2025), including the written data-retention and security requirements.]
- **UK Age Appropriate Design Code and EU GDPR**: high privacy by default: no ads, no profiling, no location, no sharing for marketing. The chat screen tells children that their grown-up can read the chat. [To do: Data Protection Impact Assessment.] [The age of digital consent in the EU is between 13 and 16 depending on the country. We ask a parent to consent for every child.]
- **India (DPDP Act)**: everyone under 18 is treated as a child, and we need a parent's verifiable consent. We don't track children or show them targeted ads. Progress and chats are kept to run the learning service and so parents can review them, not to profile children. [Lawyer: confirm this against the DPDP Rules, which take effect in stages, and choose the parental-consent method.]
- **Safety flags**: when Hoot flags a message about self-harm or abuse, the flag is shown to you in the parent area. Honest Learn staff don't read chats routinely. We look at a specific message only when it is reported to us. [Lawyer and safeguarding lead: confirm this policy, and what we do if a report shows a child is in danger.]

## Keeping information safe

Our server uses encrypted connections (HTTPS). Passwords, PINs and one-time codes are stored only as hashes. The parent PIN locks for 15 minutes after 5 wrong tries, the parent area signs out after 10 minutes, and sign-in attempts are rate-limited. No system is perfectly secure. If a data breach affects you, we will tell you and the authorities as the law requires.

## Where information is stored

Our database is hosted in [region]. Anthropic and [Postmark] are based in the United States. [Lawyer: list the safeguards for international transfers, for example the EU Standard Contractual Clauses and the UK Addendum.]

## Changes to this notice

If we change this notice in a way that matters, we will tell you in the app or by email, and ask you to agree to the new version. The version you agreed to is recorded with your account.

## Contact

[privacy@honestlearn.example] · [postal address] · [India Grievance Officer] · [EU / UK representative, if needed]

## For children

- Honest Learn keeps only a little information about you: the nickname and birth year your grown-up chose, which lessons you've done, and your chats with Hoot.
- Your grown-up can read your Hoot chats. Hoot is a computer helper, not a person.
- Never tell Hoot (or anyone online) your full name, address, school, phone number or passwords.
- If something is worrying you, tell a grown-up you trust. You can also call a children's helpline.
- There are no ads, and we never sell anything about you.
