// Checks that the app's colours are readable (WCAG AA): 4.5:1 for text, 3:1 for borders and controls.
// Reads the real values from app/src/lib/theme.ts and the landing page tokens in app/src/landing/styles.ts,
// so it fails as soon as someone changes a colour to one that is too faint.
//
//   node scripts/check-contrast.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const theme = readFileSync(resolve(root, "app/src/lib/theme.ts"), "utf8");
const landing = readFileSync(resolve(root, "app/src/landing/styles.ts"), "utf8");

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** `name: "#RRGGBB"` entries inside one exported object of theme.ts. */
function block(name) {
  const m = theme.match(new RegExp(`export const ${name}[^=]*=\\s*{([\\s\\S]*?)\\n};`));
  if (!m) throw new Error(`theme.ts: could not find "${name}"`);
  return Object.fromEntries([...m[1].matchAll(/(\w+):\s*"(#[0-9A-Fa-f]{6})"/g)].map((x) => [x[1], x[2]]));
}
const colors = block("colors");
const surfaces = block("surfaces");
const bands = [...theme.matchAll(/(b[1-5]):\s*{\s*accent:\s*"(#[0-9A-Fa-f]{6})",\s*soft:\s*"(#[0-9A-Fa-f]{6})"/g)].map((m) => ({ id: m[1], accent: m[2], soft: m[3] }));
if (bands.length !== 5) throw new Error("theme.ts: expected 5 age-band accents");

/** CSS custom properties from the light (first) or dark (second) token block of the landing page. */
function tokens(dark) {
  const blocks = [...landing.matchAll(/\.hl\s*{([^}]*)}/g)].map((m) => m[1]).filter((b) => b.includes("--bg:"));
  const src = blocks[dark ? 1 : 0];
  if (!src) throw new Error("landing styles: token block not found");
  return Object.fromEntries([...src.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((x) => [x[1], x[2]]));
}

const checks = []; // [label, foreground, background, minimum]
const text = (label, fg, bg) => checks.push([label, fg, bg, 4.5]);
const control = (label, fg, bg) => checks.push([label, fg, bg, 3]);

for (const bg of ["bg", "card"]) {
  text(`ink on ${bg}`, colors.ink, colors[bg]);
  text(`muted on ${bg}`, colors.muted, colors[bg]);
  text(`brand on ${bg}`, colors.brand, colors[bg]);
  text(`danger on ${bg}`, colors.danger, colors[bg]);
  control(`input border on ${bg}`, colors.inputLine, colors[bg]);
  control(`switch track (off) on ${bg}`, colors.trackOff, colors[bg]);
}
text("placeholder in a text field (always white)", colors.placeholder, "#FFFFFF");
text("white on brand (buttons)", "#FFFFFF", colors.brand);
text("white on danger (buttons)", "#FFFFFF", colors.danger);
text("brand on brandSoft", colors.brand, colors.brandSoft);
text("warn on warnSoft", colors.warn, colors.warnSoft);
text("good on goodSoft", colors.good, colors.goodSoft);
for (const [name, bg] of Object.entries(surfaces)) {
  text(`ink on surface ${name}`, colors.ink, bg);
  text(`muted on surface ${name}`, colors.muted, bg);
}
for (const b of bands) {
  text(`${b.id} accent on white`, b.accent, "#FFFFFF");
  text(`${b.id} accent on page`, b.accent, colors.bg);
  text(`${b.id} accent on its soft tint`, b.accent, b.soft);
  text(`${b.id} white on accent (buttons)`, "#FFFFFF", b.accent);
}
for (const dark of [false, true]) {
  const t = tokens(dark);
  const mode = dark ? "landing dark" : "landing light";
  for (const bg of ["bg", "surface", "surface-2"]) {
    text(`${mode}: ink on ${bg}`, t.ink, t[bg]);
    text(`${mode}: muted on ${bg}`, t.muted, t[bg]);
    text(`${mode}: brand on ${bg}`, t.brand, t[bg]);
  }
  text(`${mode}: button text on brand`, t["on-brand"], t.brand);
  text(`${mode}: brand on brand-soft`, t.brand, t["brand-soft"]);
  text(`${mode}: heading gradient end on bg`, t["grad-to"], t.bg);
}

let failed = 0;
for (const [label, fg, bg, min] of checks) {
  const r = ratio(fg, bg);
  if (r < min) {
    failed++;
    console.log(`FAIL  ${label}: ${fg} on ${bg} is ${r.toFixed(2)}:1 (needs ${min}:1)`);
  }
}
console.log(failed ? `\n${failed} of ${checks.length} colour pairs are too faint.` : `OK: ${checks.length} colour pairs meet WCAG AA.`);
process.exit(failed ? 1 : 0);
