// The app's logo and icons (made by scripts/make-icons.mjs, or replaced by real artwork later). These tests check what the stores and phones
// need from the files (sizes, an opaque App Store icon, a one-colour Android layer, the website manifest matching its files) and that the
// Expo template placeholders, which stood in until 15 Nov 2026, are gone.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const file = (p: string) => readFileSync(join(root, p));
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex").slice(0, 16);

interface Png {
  width: number;
  height: number;
  /** 2 = RGB (no alpha), 6 = RGBA */
  colourType: number;
  rgba: Buffer;
}
/** Reads an 8-bit RGB or RGBA PNG (what the generator writes). */
function readPng(p: string): Png {
  const b = file(p);
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${p} is a PNG`);
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20), colourType = b[25]!;
  assert.equal(b[24], 8, `${p}: 8 bits per channel`);
  assert.ok(colourType === 2 || colourType === 6, `${p}: RGB or RGBA`);
  const idat: Buffer[] = [];
  for (let o = 8; o < b.length; ) {
    const len = b.readUInt32BE(o), type = b.toString("ascii", o + 4, o + 8);
    if (type === "IDAT") idat.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const ch = colourType === 6 ? 4 : 3;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (width * ch + 1)], 0, `${p}: filter none`);
    for (let x = 0; x < width; x++) {
      const s = y * (width * ch + 1) + 1 + x * ch, d = (y * width + x) * 4;
      rgba[d] = raw[s]!; rgba[d + 1] = raw[s + 1]!; rgba[d + 2] = raw[s + 2]!; rgba[d + 3] = ch === 4 ? raw[s + 3]! : 255;
    }
  }
  return { width, height, colourType, rgba };
}
/** The box around everything that is not (nearly) transparent. */
function bounds(png: Png) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (png.rgba[(y * png.width + x) * 4 + 3]! > 8) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  return { x0, y0, x1, y1 };
}

describe("the Expo template placeholders are gone", () => {
  // sha256 prefixes of the files that were in the repository until 15 Nov 2026 (Expo's template art, and the first placeholder launch badge)
  const PLACEHOLDERS: Record<string, string[]> = {
    "app/assets/icon.png": ["119462bb78eb240a"],
    "app/assets/android-icon-foreground.png": ["9e3d0315a33c6799"],
    "app/assets/android-icon-background.png": ["fb139c2dee362ebf"],
    "app/assets/android-icon-monochrome.png": ["6371fc2c12e33ad2"],
    "app/assets/favicon.png": ["a4e030697a7571b3"],
    "app/assets/splash-icon.png": ["5f4c0a732b6325bf", "beb5f2a4ab688315"],
    "app/public/icons/icon-192.png": ["c163d2c0dc7722da"],
    "app/public/icons/icon-512.png": ["6d18eebc954eb22f"],
    "app/public/icons/apple-touch-icon.png": ["663134d56ccb6a5d"],
  };
  test("every icon differs from the placeholder it replaced", () => {
    for (const [p, old] of Object.entries(PLACEHOLDERS)) assert.ok(!old.includes(sha(file(p))), `${p} is still a placeholder`);
  });
});

describe("the files stores and phones need", () => {
  test("the app icon is 1024 x 1024 with no transparency (the App Store refuses an alpha channel)", () => {
    const icon = readPng("app/assets/icon.png");
    assert.deepEqual([icon.width, icon.height, icon.colourType], [1024, 1024, 2]);
    // the corners are the brand green, so a store's rounded mask shows no stray white
    for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023]] as const) assert.deepEqual([...icon.rgba.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 3)], [0x2f, 0x6b, 0x4f]);
  });

  test("the Android layers are square and the same size; the mark stays inside the middle two thirds", () => {
    const fg = readPng("app/assets/android-icon-foreground.png");
    const bg = readPng("app/assets/android-icon-background.png");
    const mono = readPng("app/assets/android-icon-monochrome.png");
    for (const l of [fg, bg, mono]) assert.deepEqual([l.width, l.height], [1024, 1024]);
    const safe = { lo: Math.floor(1024 * (1 / 6)), hi: Math.ceil(1024 * (5 / 6)) };
    for (const l of [fg, mono]) {
      const b = bounds(l);
      assert.ok(b.x1 > 0, "something is drawn");
      assert.ok(b.x0 >= safe.lo && b.y0 >= safe.lo && b.x1 <= safe.hi && b.y1 <= safe.hi, `inside the safe zone: ${JSON.stringify(b)}`);
    }
    // the background layer is one opaque colour
    assert.ok(bg.rgba.every((v, i) => (i % 4 === 3 ? v === 255 : v === bg.rgba[i % 4]!)), "a plain opaque layer");
  });

  test("the themed (one-colour) Android layer is only white where it draws, so the system can colour it", () => {
    const mono = readPng("app/assets/android-icon-monochrome.png");
    let drawn = 0;
    for (let i = 0; i < mono.rgba.length; i += 4) {
      if (mono.rgba[i + 3]! > 8) {
        drawn++;
        assert.deepEqual([mono.rgba[i], mono.rgba[i + 1], mono.rgba[i + 2]], [255, 255, 255]);
      }
    }
    assert.ok(drawn > 50_000, `${drawn} pixels drawn`);
  });

  test("the launch image is a transparent 1024 square with its badge inside the middle two thirds (Android 12 crops it to a circle)", () => {
    const splash = readPng("app/assets/splash-icon.png");
    assert.deepEqual([splash.width, splash.height, splash.colourType], [1024, 1024, 6]);
    assert.equal(splash.rgba[3], 0, "the corner is transparent");
    const b = bounds(splash);
    assert.ok(b.x0 >= 170 && b.y0 >= 170 && b.x1 <= 854 && b.y1 <= 854, JSON.stringify(b));
  });

  test("the favicon and the website's home-screen icons are the sizes the manifest and the page say", () => {
    assert.deepEqual([readPng("app/assets/favicon.png").width, readPng("app/assets/favicon.png").height], [48, 48]);
    const manifest = JSON.parse(file("app/public/manifest.webmanifest").toString("utf8")) as { icons: { src: string; sizes: string }[] };
    assert.ok(manifest.icons.length >= 2);
    for (const icon of manifest.icons) {
      const png = readPng(`app/public${icon.src}`);
      assert.equal(`${png.width}x${png.height}`, icon.sizes, icon.src);
      assert.equal(png.colourType, 2, `${icon.src}: no alpha, so a maskable icon has no transparent edge`);
    }
    const touch = readPng("app/public/icons/apple-touch-icon.png");
    assert.deepEqual([touch.width, touch.height, touch.colourType], [180, 180, 2]);
    assert.ok(file("app/public/index.html").toString("utf8").includes("/icons/apple-touch-icon.png"));
  });

  test("the mark really is drawn on each icon: the pages are cream and the background is green", () => {
    for (const p of ["app/assets/icon.png", "app/public/icons/icon-512.png", "app/public/icons/icon-192.png"]) {
      const png = readPng(p);
      const colours = new Set<string>();
      for (let i = 0; i < png.rgba.length; i += 4) colours.add(`${png.rgba[i]},${png.rgba[i + 1]},${png.rgba[i + 2]}`);
      assert.ok(colours.has("47,107,79"), `${p} has the brand green`);
      assert.ok(colours.has("251,248,243"), `${p} has the cream of the pages`);
    }
  });
});
