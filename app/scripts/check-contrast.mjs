#!/usr/bin/env node
// WCAG 2.x colour-contrast check for the app's theme (app/src/lib/theme.ts).
// Run from app/:  node scripts/check-contrast.mjs
// Text needs 4.5:1 (AA, normal size). Borders/controls ("ui") need 3:1 (WCAG 1.4.11).
// Exits with code 1 if any pair fails.
import { bandTheme, colors, surfaces } from "../src/lib/theme.ts";

function luminance(hex) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const WHITE = "#FFFFFF";
/** [label, foreground, background, "text" | "ui"] */
const pairs = [
  ["ink on page", colors.ink, colors.bg, "text"],
  ["ink on card", colors.ink, colors.card, "text"],
  ["muted on page", colors.muted, colors.bg, "text"],
  ["muted on card", colors.muted, colors.card, "text"],
  ["muted on pill", colors.muted, surfaces.pill, "text"],
  ["muted on 'learn more' card", colors.muted, surfaces.learnMore, "text"],
  ["ink on 'did you know' card", colors.ink, surfaces.fact, "text"],
  ["ink on 'try it' card", colors.ink, surfaces.tryit, "text"],
  ["ink on 'for grown-ups' card", colors.ink, surfaces.parent, "text"],
  ["placeholder on input", colors.placeholder, colors.card, "text"],
  ["brand on page (links, ghost buttons)", colors.brand, colors.bg, "text"],
  ["brand on card", colors.brand, colors.card, "text"],
  ["brand on brandSoft (info banner)", colors.brand, colors.brandSoft, "text"],
  ["muted on brandSoft", colors.muted, colors.brandSoft, "text"],
  ["white on brand (primary button)", WHITE, colors.brand, "text"],
  ["warn on warnSoft (banner, pill)", colors.warn, colors.warnSoft, "text"],
  ["warn on page", colors.warn, colors.bg, "text"],
  ["danger on page (errors)", colors.danger, colors.bg, "text"],
  ["white on danger (delete button)", WHITE, colors.danger, "text"],
  ["good on goodSoft (banner, pill)", colors.good, colors.goodSoft, "text"],
  ["good on card", colors.good, colors.card, "text"],
  ["input border on card", colors.inputLine, colors.card, "ui"],
  ["toggle track (off) on card", colors.trackOff, colors.card, "ui"],
  ["brand (selected border, toggle on) on card", colors.brand, colors.card, "ui"],
];
for (const [id, t] of Object.entries(bandTheme)) {
  pairs.push(
    [`${id} accent on card (ghost buttons, labels)`, t.accent, colors.card, "text"],
    [`${id} accent on page`, t.accent, colors.bg, "text"],
    [`${id} accent on its soft colour (hint titles, chips)`, t.accent, t.soft, "text"],
    [`${id} white on accent (primary buttons, chat bubbles)`, WHITE, t.accent, "text"],
    [`${id} ink on its soft colour`, colors.ink, t.soft, "text"],
    [`${id} muted on its soft colour`, colors.muted, t.soft, "text"],
    [`${id} accent border on card`, t.accent, colors.card, "ui"],
  );
}

let failed = 0;
for (const [label, fg, bg, kind] of pairs) {
  const r = ratio(fg, bg);
  const need = kind === "text" ? 4.5 : 3;
  const ok = r >= need;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1 (needs ${need})  ${label}  [${fg} on ${bg}]`);
}
console.log(failed ? `\n${failed} pair(s) fail WCAG AA.` : `\nAll ${pairs.length} pairs pass WCAG AA.`);
process.exit(failed ? 1 : 0);
