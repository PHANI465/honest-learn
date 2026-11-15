// Draws app/assets/splash-icon.png: a PLACEHOLDER badge (a green circle with the letters HL) for the launch screen.
//
//   node scripts/make-splash.mjs
//
// Why a script and not a picture: the project has no logo yet (every other icon in app/assets is still Expo's template placeholder),
// so this makes a plain, neutral mark from simple shapes (no font, no emoji, nothing copied) in the app's own colours, and can be
// re-run or replaced. REAL ARTWORK REPLACES THIS FILE: drop a 1024x1024 transparent PNG at app/assets/splash-icon.png, keeping the
// mark inside the middle two thirds (Android 12 and later crop the launch icon to a circle).
//
// No dependencies: shapes are drawn with signed distance functions at 4x resolution and the PNG is written with node:zlib.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;
const SS = 4; // supersampling per axis
const GREEN = [0x2f, 0x6b, 0x4f]; // colors.brand in app/src/lib/theme.ts
const CREAM = [0xfb, 0xf8, 0xf3]; // colors.bg

const dist = (px, py, ax, ay, bx, by) => {
  // distance from a point to the segment a-b
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// The mark: a circle 600 across in the middle of the 1024 canvas (inside the two-thirds Android keeps), and an H and an L in it.
const C = SIZE / 2;
const RADIUS = 300;
const STROKE = 30; // half the line width: a capsule of radius 30
const top = C - 150, bottom = C + 150;
const hx0 = C - 160, hx1 = C - 55; // the H's two uprights
const lx0 = C + 45, lx1 = C + 160; // the L's upright and the end of its foot
const strokes = [
  [hx0, top, hx0, bottom],
  [hx1, top, hx1, bottom],
  [hx0, C, hx1, C],
  [lx0, top, lx0, bottom],
  [lx0, bottom, lx1, bottom],
];

/** Colour and coverage of one sample point: the letters on the circle, the circle on nothing. */
function sample(px, py) {
  if (Math.hypot(px - C, py - C) > RADIUS) return null;
  for (const [ax, ay, bx, by] of strokes) if (dist(px, py, ax, ay, bx, by) <= STROKE) return CREAM;
  return GREEN;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // PNG filter: none
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, hits = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        if (c) (r += c[0], (g += c[1]), (b += c[2]), hits++);
      }
    }
    const o = y * (SIZE * 4 + 1) + 1 + x * 4;
    if (hits) {
      raw[o] = Math.round(r / hits);
      raw[o + 1] = Math.round(g / hits);
      raw[o + 2] = Math.round(b / hits);
    }
    raw[o + 3] = Math.round((255 * hits) / (SS * SS));
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
const out = join(dirname(fileURLToPath(import.meta.url)), "../app/assets/splash-icon.png");
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
