// Styles for the website landing page (welcome.web.tsx), written to the "landing-page-design" rules:
// spacing only from the token table, Tailwind type and radius steps, one typeface (Manrope, weights 400 to 600),
// flat backgrounds, one gradient (hero heading text), the shared easing curve, transform and opacity motion only.
// The CSS is injected in a <style> tag; the Content-Security-Policy allows inline styles (style-src 'unsafe-inline').
export const LANDING_CSS = `
@font-face { font-family: "Manrope"; font-weight: 400; font-style: normal; font-display: swap; src: url("/fonts/manrope-400.woff2") format("woff2"); }
@font-face { font-family: "Manrope"; font-weight: 500; font-style: normal; font-display: swap; src: url("/fonts/manrope-500.woff2") format("woff2"); }
@font-face { font-family: "Manrope"; font-weight: 600; font-style: normal; font-display: swap; src: url("/fonts/manrope-600.woff2") format("woff2"); }

.hl {
  /* spacing tokens */
  --s-0: 0; --s-25: 2px; --s-50: 4px; --s-75: 8px; --s-100: 12px; --s-200: 16px; --s-300: 24px; --s-400: 32px;
  --s-500: 40px; --s-600: 48px; --s-700: 64px; --s-800: 80px; --s-900: 96px;
  /* motion */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* light theme */
  --bg: #FBF8F3; --surface: #FFFFFF; --surface-2: #F1EEE8; --ink: #1F2430; --muted: #5E6573; --line: #D9D2C6;
  --brand: #2F6B4F; --on-brand: #FFFFFF; --brand-soft: #E3F0E8; --nav-bg: rgba(251, 248, 243, 0.72);
  --grad-from: #000000; --grad-to: #666666; --focus: #1F2430;
  --ink-dim: rgba(31, 36, 48, 0.3);
  --scrim: rgba(251, 248, 243, 0.94);
}
@media (prefers-color-scheme: dark) {
  .hl {
    --bg: #181818; --surface: #1F1F1F; --surface-2: #272727; --ink: #F2F2F2; --muted: #ABABAB; --line: #313131;
    --brand: #8FD0AD; --on-brand: #000000; --brand-soft: #272727; --nav-bg: rgba(24, 24, 24, 0.72);
    --grad-from: #FFFFFF; --grad-to: #9B9B9B; --focus: #F2F2F2;
    --ink-dim: rgba(242, 242, 242, 0.3);
    --scrim: rgba(0, 0, 0, 0.94);
  }
}

.hl, .hl * { box-sizing: border-box; }
.hl {
  height: 100%; width: 100%; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth; scroll-padding-top: var(--s-800);
  background: var(--bg); color: var(--ink);
  font-family: "Manrope", system-ui, sans-serif; font-weight: 400; font-style: normal; text-wrap: pretty;
  -webkit-font-smoothing: antialiased;
}
.hl h1, .hl h2, .hl h3, .hl p, .hl ul, .hl ol, .hl figure, .hl dl, .hl dd { margin: 0; padding: 0; }
.hl ul, .hl ol { list-style: none; }
:where(.hl a) { color: inherit; text-decoration: none; }
:where(.hl button) { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.hl :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 8px; }

/* named text styles (sizes and line heights are Tailwind type scale steps) */
.heading-1 { font-size: 3.75rem; line-height: 1; font-weight: 600; text-wrap: balance; }
.heading-2 { font-size: 3rem; line-height: 1; font-weight: 600; text-wrap: balance; }
.heading-3 { font-size: 2.25rem; line-height: 2.5rem; font-weight: 600; text-wrap: balance; }
.heading-4 { font-size: 1.875rem; line-height: 2.25rem; font-weight: 600; text-wrap: balance; }
.heading-5 { font-size: 1.5rem; line-height: 2rem; font-weight: 600; text-wrap: balance; }
.title-1 { font-size: 1.25rem; line-height: 1.75rem; font-weight: 500; }
.title-2 { font-size: 1.125rem; line-height: 1.75rem; font-weight: 500; }
.title-3 { font-size: 1rem; line-height: 1.5rem; font-weight: 500; }
.body-2 { font-size: 1rem; line-height: 1.5rem; font-weight: 500; }
.body-3 { font-size: 1rem; line-height: 1.5rem; font-weight: 400; }
.body-6 { font-size: 0.875rem; line-height: 1.25rem; font-weight: 400; }
.button-lg { font-size: 1.125rem; line-height: 1.75rem; font-weight: 600; }
.button-sm { font-size: 0.875rem; line-height: 1.25rem; font-weight: 600; }
.caption-1 { font-size: 0.875rem; line-height: 1.25rem; font-weight: 500; }
.caption-3 { font-size: 0.75rem; line-height: 1rem; font-weight: 600; }
.caption-4 { font-size: 0.75rem; line-height: 1rem; font-weight: 500; }
.muted { color: var(--muted); }

/* layout */
.wrap { width: 100%; max-width: 1080px; margin: 0 auto; padding-left: var(--s-200); padding-right: var(--s-200); }
.section { padding-top: var(--s-700); padding-bottom: var(--s-700); }
.section-head { display: flex; flex-direction: column; gap: var(--s-100); max-width: 680px; margin-bottom: var(--s-500); }
.section-head.center { align-items: center; text-align: center; margin-left: auto; margin-right: auto; }
.eyebrow svg { width: 16px; height: 16px; flex: none; }
.eyebrow { display: inline-flex; align-items: center; gap: var(--s-75); color: var(--brand); }

/* skip link */
.skip { position: absolute; left: var(--s-200); top: var(--s-200); z-index: 60; padding: var(--s-75) var(--s-100); border-radius: 8px;
  background: var(--ink); color: var(--bg); transform: translateY(-200%); }
.skip:focus { transform: translateY(0); }

/* floating navigation */
.nav { position: fixed; z-index: 50; top: var(--s-200); left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100% - 32px);
  display: flex; align-items: center; gap: var(--s-300); padding: var(--s-75) var(--s-75) var(--s-75) var(--s-200);
  background: var(--nav-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--line); border-radius: 16px; }
.brand { display: inline-flex; align-items: center; gap: var(--s-75); }
.brand img { width: 28px; height: 28px; border-radius: 8px; display: block; }
.nav-links { display: none; align-items: center; gap: var(--s-50); }
.nav-link { padding: var(--s-75) var(--s-100); border-radius: 8px; color: var(--muted); transition: color 300ms var(--ease), background-color 300ms var(--ease); }
.nav-link:hover { color: var(--ink); background: var(--surface-2); }
.nav-link[aria-current="true"] { color: var(--ink); background: var(--surface-2); }
.nav-link:active { transform: translateY(1px); }
.menu-toggle { width: 40px; height: 40px; border-radius: 8px; position: relative; transition: background-color 300ms var(--ease); }
.menu-toggle:hover { background: var(--surface-2); }
.menu-toggle span { position: absolute; left: 11px; width: 18px; height: 2px; border-radius: 2px; background: var(--ink); transition: transform 500ms var(--ease), opacity 300ms var(--ease); }
.menu-toggle span:nth-child(1) { top: 14px; } .menu-toggle span:nth-child(2) { top: 19px; } .menu-toggle span:nth-child(3) { top: 24px; }
.menu-toggle[aria-expanded="true"] span:nth-child(1) { transform: translateY(5px) rotate(45deg); }
.menu-toggle[aria-expanded="true"] span:nth-child(2) { opacity: 0; }
.menu-toggle[aria-expanded="true"] span:nth-child(3) { transform: translateY(-5px) rotate(-45deg); }

.panel { position: fixed; z-index: 40; inset: 0; background: var(--scrim); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  display: flex; flex-direction: column; justify-content: center; gap: var(--s-100); padding: var(--s-800) var(--s-300) var(--s-400);
  opacity: 0; visibility: hidden; transition: opacity 500ms var(--ease), visibility 0s linear 500ms; }
.panel.open { opacity: 1; visibility: visible; transition: opacity 500ms var(--ease), visibility 0s; }
.panel a { display: block; padding: var(--s-100) 0; opacity: 0; transform: translateY(24px); transition: opacity 500ms var(--ease), transform 500ms var(--ease); }
.panel.open a { opacity: 1; transform: translateY(0); transition-delay: calc(var(--i) * 60ms); }

/* buttons: 8px vertical, 12px horizontal padding */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-75); padding: var(--s-75) var(--s-100); border-radius: 8px;
  border: 1px solid transparent; transition: transform 500ms var(--ease), background-color 300ms var(--ease), color 300ms var(--ease); }
.btn-primary { background: var(--brand); color: var(--on-brand); }
.btn-primary:hover { transform: translateY(-2px) scale(1.02); }
.btn-primary:active { transform: scale(0.98); }
.btn-ghost { color: var(--ink); border-color: var(--line); }
.btn-ghost:hover { background: var(--surface-2); }
.btn-ghost:active { transform: scale(0.98); }
.btn svg { width: 20px; height: 20px; flex: none; }

/* hero */
.hero { padding-top: var(--s-800); padding-bottom: var(--s-500); text-align: center; display: flex; flex-direction: column; align-items: center; gap: var(--s-300); }
.badge { display: inline-flex; align-items: center; gap: var(--s-75); padding: var(--s-50) var(--s-100); border: 1px solid var(--line); border-radius: 9999px; background: var(--surface); color: var(--muted); }
.badge svg { width: 16px; height: 16px; color: var(--brand); flex: none; }
.hero h1, .hero .sub { max-width: 680px; }
.hero h1 { background: linear-gradient(90deg, var(--grad-from), var(--grad-to)); -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent; }
.hero h1 .ln { display: block; }
.hero .sub { color: var(--muted); }
.hero-cta { display: flex; flex-direction: column; align-items: center; gap: var(--s-100); }
.risk { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--s-75) var(--s-200); color: var(--muted); }
.risk li { display: inline-flex; align-items: center; gap: var(--s-75); }
.risk svg { width: 16px; height: 16px; color: var(--brand); flex: none; }
.proof { color: var(--muted); max-width: 680px; }

/* hero visual: an illustration of a quiz question and its hints */
.shot { max-width: 880px; margin: var(--s-300) auto 0; padding: var(--s-75); background: var(--surface-2); border: 1px solid var(--line); border-radius: 24px; text-align: left; }
.shot-inner { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: var(--s-300); display: grid; gap: var(--s-400); }
.shot-q { display: flex; flex-direction: column; gap: var(--s-200); }
.shot-lesson { color: var(--muted); }
.opts { display: grid; gap: var(--s-75); }
.opt { padding: var(--s-100) var(--s-200); border: 1px solid var(--line); border-radius: 8px; background: var(--bg); }
.shot-hints { display: flex; flex-direction: column; gap: var(--s-75); }
.hint { display: flex; gap: var(--s-100); padding: var(--s-100); border: 1px solid var(--line); border-radius: 8px; background: var(--bg); }
.hint.open { background: var(--brand-soft); border-color: var(--brand); }
.hint.locked { color: var(--muted); }
.hint .n { flex: none; width: 24px; height: 24px; border-radius: 9999px; display: inline-flex; align-items: center; justify-content: center; background: var(--surface-2); }
.hint.open .n { background: var(--brand); color: var(--on-brand); }
.hint svg { width: 16px; height: 16px; }
.shot-note { display: flex; align-items: center; gap: var(--s-75); color: var(--muted); padding-top: var(--s-75); }
.shot-note svg { width: 16px; height: 16px; color: var(--brand); flex: none; }
.shot-cap { text-align: center; color: var(--muted); margin-top: var(--s-100); }

/* feature cards */
.cards { display: grid; gap: var(--s-200); grid-template-columns: 1fr; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: var(--s-300); display: flex; flex-direction: column; gap: var(--s-100);
  transition: transform 500ms var(--ease), background-color 300ms var(--ease); }
.card:hover { transform: translateY(-4px); }
.icon-tile { width: 40px; height: 40px; border-radius: 8px; background: var(--brand-soft); color: var(--brand); display: inline-flex; align-items: center; justify-content: center; }
.icon-tile svg { width: 24px; height: 24px; }

/* problem */
.problem { background: var(--surface-2); }
.problem .wrap { display: grid; gap: var(--s-400); }
.contrast { display: grid; gap: var(--s-200); grid-template-columns: 1fr; }
.contrast > div { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: var(--s-300); display: flex; flex-direction: column; gap: var(--s-100); }
.contrast ul { display: flex; flex-direction: column; gap: var(--s-75); }
.contrast li { display: flex; gap: var(--s-75); align-items: flex-start; }
.contrast li svg { width: 20px; height: 20px; margin-top: var(--s-25); flex: none; color: var(--brand); }

/* tagline reveal */
.tagline { padding-top: var(--s-900); padding-bottom: var(--s-900); }
.tagline p { max-width: 680px; margin: 0 auto; text-align: center; }
.word { color: var(--ink-dim); transition: color 600ms var(--ease); }
.word.on { color: var(--ink); }

/* steps */
.steps { display: grid; gap: var(--s-200); grid-template-columns: 1fr; counter-reset: step; }
.step { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: var(--s-300); display: flex; flex-direction: column; gap: var(--s-100); }
.step .num { width: 40px; height: 40px; border-radius: 9999px; background: var(--brand); color: var(--on-brand); display: inline-flex; align-items: center; justify-content: center; }

/* proof you can check */
.checks { display: grid; gap: var(--s-200); grid-template-columns: 1fr; }
.check { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: var(--s-300); display: flex; flex-direction: column; gap: var(--s-100); }
.check a { color: var(--brand); display: inline-flex; align-items: center; gap: var(--s-75); border-radius: 8px; }
.check a:hover { text-decoration: underline; text-underline-offset: 4px; }
.check a svg { width: 16px; height: 16px; }
.bands { display: flex; flex-wrap: wrap; gap: var(--s-75); }
.bands li { padding: var(--s-50) var(--s-100); border: 1px solid var(--line); border-radius: 9999px; background: var(--bg); }

/* faq */
.faq { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--s-75); }
.faq details { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 0 var(--s-300); }
.faq summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: var(--s-200); padding: var(--s-200) 0; border-radius: 8px; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary svg { width: 20px; height: 20px; flex: none; color: var(--muted); transition: transform 500ms var(--ease); }
.faq details[open] summary svg { transform: rotate(45deg); }
.faq details > div { padding-bottom: var(--s-200); color: var(--muted); }

/* final call to action */
.final { background: var(--surface-2); text-align: center; }
.final .wrap { display: flex; flex-direction: column; align-items: center; gap: var(--s-300); }
.final h2, .final .sub { max-width: 680px; }
.final .sub { color: var(--muted); }

/* footer */
.foot { padding-top: var(--s-500); padding-bottom: var(--s-500); border-top: 1px solid var(--line); }
.foot .wrap { display: flex; flex-direction: column; gap: var(--s-300); }
.foot nav { display: flex; flex-wrap: wrap; gap: var(--s-75) var(--s-300); }
.foot nav a { color: var(--muted); border-radius: 8px; padding: var(--s-50) 0; }
.foot nav a:hover { color: var(--ink); }

/* scroll reveal: sections rise 32px and fade in once */
.reveal { opacity: 0; transform: translateY(32px); transition: opacity 700ms var(--ease), transform 700ms var(--ease); }
.reveal.in { opacity: 1; transform: translateY(0); }

@media (min-width: 768px) {
  .nav-links { display: flex; }
  .menu-toggle, .panel { display: none; }
  .nav { padding: var(--s-75) var(--s-75) var(--s-75) var(--s-200); }
  .cards { grid-template-columns: repeat(2, 1fr); }
  .contrast, .steps, .checks { grid-template-columns: repeat(2, 1fr); }
  .steps { grid-template-columns: repeat(3, 1fr); }
  .shot-inner { grid-template-columns: 1fr 1fr; }
  .section { padding-top: var(--s-900); padding-bottom: var(--s-900); }
  .hero { padding-top: 128px; }
  .foot .wrap { flex-direction: row; align-items: center; justify-content: space-between; }
}
@media (min-width: 1024px) {
  .cards { grid-template-columns: repeat(3, 1fr); }
}
/* small screens use the next smaller heading styles (still scale steps) */
@media (max-width: 767px) {
  .hero h1.heading-1 { font-size: 2.25rem; line-height: 2.5rem; }
  .hl h2.heading-2 { font-size: 1.875rem; line-height: 2.25rem; }
  .tagline .heading-2 { font-size: 2.25rem; line-height: 2.5rem; }
  .wrap { padding-left: var(--s-200); padding-right: var(--s-200); }
}

@media (prefers-reduced-motion: reduce) {
  .hl { scroll-behavior: auto; }
  .reveal, .reveal.in { transform: none; transition: opacity 300ms var(--ease); }
  .panel a, .panel.open a { transform: none; transition-delay: 0s; }
  .word { color: var(--ink); transition: none; }
  .btn-primary:hover, .card:hover { transform: none; }
  .menu-toggle span, .faq summary svg { transition: none; }
}
`;
