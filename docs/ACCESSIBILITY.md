# Accessibility

What Honest Learn does so people with visual, hearing, motor and cognitive disabilities can use it, what it does not
do yet, and how to tell us about a barrier. Written for task T1 in `docs/AGENT_TASKS.md`, 14 November 2026.

## Supported

**Reading and display (a parent chooses, per child).** In the parent area, open a child's settings and find
**Reading and display**:

| Setting | What it does |
|---|---|
| Text size: Standard, Large (1.15x), Extra large (1.3x) | Scales body text, headings, buttons, form fields and quiz text on the child's learning screens |
| Dyslexia-friendly font | Uses the OpenDyslexic typeface (SIL Open Font License, served from this site: `app/public/fonts`) on the website. On phones it gives wider letter and line spacing instead, because the font file is not bundled in the native app |
| High contrast | Black text and darker outlines on cards |
| Read lessons aloud automatically | Lessons read themselves as they open, at every age, with a "Stop reading" button. Without it, the "Read it to me" button is shown to ages 3 to 8 only |

The settings are stored on the child (`children.text_scale`, `dyslexia_font`, `high_contrast`, `read_aloud_auto`),
change only with the parent PIN, and apply on the learning screens only; the parent area keeps the standard look.
Code: `useChildDisplay()` in `app/src/lib/theme.ts`, applied by `H1`, `H2`, `P`, `Card`, `Button`, `Field`, `Pill`,
`Toggle` and `Banner` in `app/src/components/ui.tsx`, and by `scaledBandTheme()` in lesson, quiz and home screens.

**Everywhere:**
- Screen reader labels on buttons, cards, quiz options (they say "correct" or "not quite") and progress bars.
  Decorative emoji are hidden (`Emoji` in `ui.tsx`); symbols are stripped from spoken labels.
- Touch targets of at least 44 px.
- Colour contrast checked in CI against WCAG AA (`node scripts/check-contrast.mjs`). Quiz right and wrong never
  depend on colour alone: they also use icons and words.
- Errors and notices are announced (`accessibilityRole="alert"`).
- Pinch zoom is allowed on the website.
- Reduced motion: movement becomes a plain fade or nothing (`app/src/lib/motion.tsx`). Nothing flashes.
- Website keyboard use: every control can be reached with Tab and used with Enter or Space, focus rings are visible,
  and the landing page has a "Skip to content" link.
- Lessons can be read aloud on the device (`expo-speech`). Video sections carry a text summary under the video.
- No text below 12 px.

## Not supported yet

- The dyslexia font is not bundled in the phone app (web only; spacing only on phones).
- High contrast changes text and card outlines; some small inline colours (for example muted captions) keep the
  standard palette, which already passes AA.
- Text size does not change the landing page or the sign-up and sign-in screens, which are used before a child is chosen.
- No captions for videos we do not control. Every video lesson needs a human to confirm captions exist (T9).
- No sign language lessons yet (T9) and no signed versions of lessons.
- Not tested with a screen reader by an AI agent. See "What was and was not tested" below.

## What was and was not tested (T1, 14 Nov 2026)

Tested: type checks, lint, the server tests for the new settings, the contrast checker, and a code audit of every
route in `app/src/app` against the checklist in `docs/AGENT_TASKS.md`.

Not tested: a keyboard-only pass in a real browser, and a screen reader pass (NVDA, VoiceOver or TalkBack). A person
should do both before launch and record the result here.

## Reporting a barrier

Open an issue at <https://github.com/PHANI465/honest-learn/issues> titled "Accessibility:" with the screen, the device
and any assistive technology you use. Please do not include a child's name or any personal details.
