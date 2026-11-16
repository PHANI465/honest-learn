// Draws Honest Learn's logo and every icon and launch image that uses it, from simple shapes. No dependencies (PNG writing is node:zlib).
//
//   node scripts/make-icons.mjs                     draws the chosen design into app/assets and app/public/icons
//   node scripts/make-icons.mjs --preview <folder>  draws every candidate design as a 512 px preview in <folder> (nothing else is touched)
//
// Why a script: the logo is a handful of circles and polygons, so keeping it as code means it can be changed in one place and all sizes
// stay consistent (the app icon, the Android adaptive layers, the launch image, the favicon and the website's home-screen icons).
// Colours come from the app's own palette (app/src/lib/theme.ts). To use different artwork, replace the PNG files; nothing reads this script.
//
// Shapes are drawn with point tests at 3x3 samples per pixel, in painter's order; a layer with colour null cuts a hole (used for the
// one-colour Android layer).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GREEN = [0x2f, 0x6b, 0x4f]; // colors.brand
const DEEP = [0x1f, 0x50, 0x38]; // a darker green from the high-contrast theme
const CREAM = [0xfb, 0xf8, 0xf3]; // colors.bg
const AMBER = [0xf2, 0xb5, 0x44];
const LEAF = [0x8f, 0xc7, 0x8a];

// ---------------------------------------------------------------- shapes (all on a 1024 x 1024 canvas)
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const ellipse = (cx, cy, rx, ry, turn = 0) => {
  const c = Math.cos(turn), s = Math.sin(turn);
  return (x, y) => {
    const dx = x - cx, dy = y - cy;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
  };
};
const polygon = (pts) => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const capsule = (ax, ay, bx, by, r) => (x, y) => segDist(x, y, ax, ay, bx, by) <= r;
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  const cx = Math.max(x0 + r, Math.min(x1 - r, x)), cy = Math.max(y0 + r, Math.min(y1 - r, y));
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

// ---------------------------------------------------------------- the candidate marks (each returns layers, painted in order)
// `mono` draws a one-colour version for the Android themed icon: solid layers become white, cut-outs are holes.
const marks = {
  // Hoot, the owl the app already uses for its helper: a round cream owl with big green eyes and an amber beak.
  owl(mono) {
    const body = mono ? [255, 255, 255] : CREAM;
    const L = [];
    L.push({ test: polygon([[318, 330], [352, 168], [482, 292]]), color: body }); // left ear tuft
    L.push({ test: polygon([[706, 330], [672, 168], [542, 292]]), color: body }); // right ear tuft
    L.push({ test: ellipse(512, 560, 318, 352), color: body }); // body and head
    if (!mono) {
      L.push({ test: ellipse(512, 735, 170, 120), color: [0xec, 0xe4, 0xd3] }); // belly
      for (const x of [452, 512, 572]) L.push({ test: capsule(x - 34, 720, x, 770, 11), color: [0xd9, 0xcf, 0xba] });
    }
    for (const x of [392, 632]) {
      L.push({ test: circle(x, 500, 128), color: mono ? null : GREEN }); // eye (a hole in the one-colour version)
      L.push({ test: circle(x, 500, mono ? 62 : 74), color: mono ? [255, 255, 255] : CREAM });
      L.push({ test: circle(x + (x < 512 ? 10 : -10), 508, 38), color: mono ? null : DEEP });
    }
    L.push({ test: polygon([[512, 640], [466, 560], [558, 560]]), color: mono ? null : AMBER }); // beak
    return L;
  },
  // An open book with a sprout growing out of it: learning that grows.
  book(mono) {
    const page = mono ? [255, 255, 255] : CREAM;
    const L = [];
    L.push({ test: polygon([[512, 760], [150, 690], [150, 400], [512, 470]]), color: page }); // left page
    L.push({ test: polygon([[512, 760], [874, 690], [874, 400], [512, 470]]), color: page }); // right page
    if (!mono) {
      L.push({ test: capsule(512, 470, 512, 760, 7), color: [0xd9, 0xcf, 0xba] }); // the fold
      for (const k of [0, 1, 2]) {
        L.push({ test: capsule(215, 480 + k * 52, 460, 530 + k * 52, 7), color: [0xd9, 0xcf, 0xba] });
        L.push({ test: capsule(809, 480 + k * 52, 564, 530 + k * 52, 7), color: [0xd9, 0xcf, 0xba] });
      }
    }
    L.push({ test: capsule(512, 470, 512, 300, 17), color: mono ? [255, 255, 255] : LEAF }); // stem
    L.push({ test: ellipse(430, 300, 105, 52, -0.65), color: mono ? [255, 255, 255] : LEAF }); // left leaf
    L.push({ test: ellipse(594, 262, 118, 56, 0.6), color: mono ? [255, 255, 255] : AMBER }); // right leaf
    return L;
  },
  // The letters HL on a round badge (the placeholder that was used for the launch screen).
  monogram(mono) {
    const ink = mono ? [255, 255, 255] : CREAM;
    const L = [{ test: circle(512, 512, 340), color: mono ? [255, 255, 255] : CREAM }];
    const r = 34;
    const stroke = (ax, ay, bx, by) => L.push({ test: capsule(ax, ay, bx, by, r), color: mono ? null : GREEN });
    stroke(350, 360, 350, 664);
    stroke(455, 360, 455, 664);
    stroke(350, 512, 455, 512);
    stroke(560, 360, 560, 664);
    stroke(560, 664, 675, 664);
    void ink;
    return L;
  },
};

// ---------------------------------------------------------------- the renderer
const SS = 3;
/**
 * size: the output is size x size pixels. design: a key of `marks`. background: a colour (filled edge to edge), or null for transparent.
 * scale: how much of the canvas the mark is shrunk to (the Android adaptive foreground keeps its mark inside the middle two thirds).
 * mono: draw the one-colour version.
 */
function render(size, design, { background, scale = 1, mono = false, badge = false } = {}) {
  const layers = scale === 0 ? [] : marks[design](mono);
  // badge: a green circle behind the mark, drawn before it and not shrunk (the launch screen: the pages are cream, like its background)
  const behind = badge ? circle(512, 512, 300) : null;
  const px = Buffer.alloc(size * size * 4);
  const k = 1024 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const cx = (x + (sx + 0.5) / SS) * k, cy = (y + (sy + 0.5) / SS) * k;
          // the point on the 1024 canvas that this sample shows, once the mark has been shrunk towards the centre
          const mx = 512 + (cx - 512) / scale, my = 512 + (cy - 512) / scale;
          let colour = background ?? null;
          let solid = background !== null && background !== undefined;
          if (behind && behind(cx, cy)) (colour = GREEN), (solid = true);
          for (const layer of layers) {
            if (!layer.test(mx, my)) continue;
            if (layer.color === null) (colour = null), (solid = false);
            else (colour = layer.color), (solid = true);
          }
          if (solid && colour) (r += colour[0]), (g += colour[1]), (b += colour[2]), (a += 1);
        }
      }
      const o = (y * size + x) * 4;
      if (a) (px[o] = Math.round(r / a)), (px[o + 1] = Math.round(g / a)), (px[o + 2] = Math.round(b / a));
      px[o + 3] = Math.round((255 * a) / (SS * SS));
    }
  }
  return px;
}

// ---------------------------------------------------------------- PNG writing
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
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
/** `opaque` writes RGB (no alpha channel), as App Store icons must be. */
function png(size, rgba, opaque = false) {
  const channels = opaque ? 3 : 4;
  const raw = Buffer.alloc((size * channels + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * channels + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, o = y * (size * channels + 1) + 1 + x * channels;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
      if (!opaque) raw[o + 3] = rgba[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- what gets written
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const previewAt = args.indexOf("--preview");

if (previewAt >= 0) {
  const dir = args[previewAt + 1];
  mkdirSync(dir, { recursive: true });
  for (const design of Object.keys(marks)) {
    writeFileSync(join(dir, `logo-${design}.png`), png(512, render(512, design, { background: GREEN, scale: 1 }), true));
    console.log(`preview ${design}`);
  }
} else {
  // The owner chose the book with a sprout on 15 Nov 2026. The owl and the monogram are kept as drawn alternatives.
  const design = args.includes("--design") ? args[args.indexOf("--design") + 1] : "book";
  if (!marks[design]) throw new Error(`unknown design "${design}" (${Object.keys(marks).join(", ")})`);
  const assets = join(here, "../app/assets");
  const icons = join(here, "../app/public/icons");
  const out = (path, size, opts, opaque = false) => {
    writeFileSync(path, png(size, render(size, design, opts), opaque));
    console.log(`wrote ${path.replace(join(here, ".."), "").replace(/\\/g, "/")} (${size}x${size})`);
  };
  // the app icon (App Store: 1024, no transparency): the mark on the brand green
  out(join(assets, "icon.png"), 1024, { background: GREEN, scale: 0.92 }, true);
  // Android adaptive icon: the system masks the layers (a circle, a squircle ...), so the mark stays inside the middle two thirds
  out(join(assets, "android-icon-background.png"), 1024, { background: GREEN, scale: 0 }); // nothing drawn: a plain green layer
  out(join(assets, "android-icon-foreground.png"), 1024, { background: null, scale: 0.8 });
  out(join(assets, "android-icon-monochrome.png"), 1024, { background: null, scale: 0.8, mono: true });
  // launch screen (cream background is set in app.json): the mark on a green circle, inside the middle two thirds for Android 12
  out(join(assets, "splash-icon.png"), 1024, { background: null, scale: 0.6, badge: true });
  out(join(assets, "favicon.png"), 48, { background: GREEN, scale: 0.96 });
  // the website's home-screen icons
  out(join(icons, "icon-512.png"), 512, { background: GREEN, scale: 0.78 }, true); // also used as the maskable icon: the mark stays in the safe zone
  out(join(icons, "icon-192.png"), 192, { background: GREEN, scale: 0.78 }, true);
  out(join(icons, "apple-touch-icon.png"), 180, { background: GREEN, scale: 0.92 }, true);
}
