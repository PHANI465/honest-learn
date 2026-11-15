import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import type { BandId } from "./api";

// Every text/background pair here meets WCAG AA (4.5:1 for text, 3:1 for borders and controls).
// Check after any change:  node scripts/check-contrast.mjs
export const colors = {
  bg: "#FBF8F3",
  card: "#FFFFFF",
  ink: "#1F2430",
  muted: "#5E6573",
  line: "#E7E1D7",
  brand: "#2F6B4F", // calm green: "honest", trustworthy
  brandSoft: "#E3F0E8",
  warn: "#AC5019", // was #B4541A (4.28:1 on warnSoft)
  warnSoft: "#FCEBDD",
  danger: "#B42318",
  good: "#1F7A4C",
  goodSoft: "#DDF3E6",
  placeholder: "#6D7582", // was #9AA0AA (2.63:1)
  inputLine: "#8F897F", // text-field borders: was the card line colour (1.30:1)
  trackOff: "#8F897F", // switch track when off: was #D5D0C7 (1.54:1)
};

/** Background tints for cards and chips. */
export const surfaces = {
  pill: "#F1EEE8",
  fact: "#FFF7DB",
  tryit: "#E6F6EC",
  parent: "#EEF0F6",
  learnMore: "#F7F9FC",
};

/**
 * Each age band gets an accent; younger bands are bolder and more playful.
 * Accents are used as text, as borders and behind white button text, so each one is dark enough
 * for 4.5:1 on white, on the page background and on its own soft tint.
 */
export const bandTheme: Record<BandId, { accent: string; soft: string; font: number; radius: number }> = {
  b1: { accent: "#A05817", soft: "#FDEBD9", font: 22, radius: 24 }, // accent was #E0812B (2.86:1 on white)
  b2: { accent: "#C22E2A", soft: "#FBE3E2", font: 20, radius: 20 }, // was #D9534F (3.96:1)
  b3: { accent: "#2767C2", soft: "#E1ECFB", font: 18, radius: 16 }, // was #3D7DD8 (4.10:1)
  b4: { accent: "#6B4FC8", soft: "#ECE7FA", font: 17, radius: 12 },
  b5: { accent: "#2F6B4F", soft: "#E3F0E8", font: 16, radius: 10 },
};

export const avatars: Record<string, string> = {
  owl: "🦉",
  fox: "🦊",
  cat: "🐱",
  dog: "🐶",
  panda: "🐼",
  turtle: "🐢",
  rabbit: "🐰",
  lion: "🦁",
};

export const subjectEmoji: Record<string, string> = {
  language: "📖",
  math: "🔢",
  science: "🔬",
  world: "🌍",
  health: "💚",
  digital: "🛡️",
  money: "🪙",
  thinking: "💡",
  arts: "🎨",
  computing: "💻",
  careers: "🧭",
  sign: "🤟",
};

export const topicLabels: Record<string, { label: string; emoji: string }> = {
  religion: { label: "Religions & beliefs", emoji: "🕯️" },
  body: { label: "Body, puberty & relationships", emoji: "🌱" },
  politics: { label: "Politics & contested history", emoji: "🏛️" },
};

// ---------------------------------------------------------------- reading and display
// The parent chooses these per child (parent/child/[id].tsx). The learning layout calls setChildDisplay() with the
// open child's settings and clears them on the way out, so the parent area always uses the standard look.

export interface ChildDisplay {
  /** 1, 1.15 or 1.3: multiplies body text sizes. */
  textScale: number;
  /** Dyslexia-friendly font (OpenDyslexic) on the website; looser letter and line spacing everywhere. */
  dyslexiaFont: boolean;
  /** Black text and darker borders. */
  highContrast: boolean;
  /** Read lessons aloud when they open (and offer the read-aloud button at every age). */
  readAloudAuto: boolean;
}

export const DEFAULT_DISPLAY: ChildDisplay = { textScale: 1, dyslexiaFont: false, highContrast: false, readAloudAuto: false };

let current: ChildDisplay = DEFAULT_DISPLAY;
const listeners = new Set<() => void>();

/** Builds the display settings from what the API returns for a child. */
export function displayOf(c: Partial<ChildDisplay> | undefined): ChildDisplay {
  if (!c) return DEFAULT_DISPLAY;
  return {
    textScale: c.textScale === 1.15 || c.textScale === 1.3 ? c.textScale : 1,
    dyslexiaFont: !!c.dyslexiaFont,
    highContrast: !!c.highContrast,
    readAloudAuto: !!c.readAloudAuto,
  };
}

export function getChildDisplay(): ChildDisplay {
  return current;
}

export function setChildDisplay(next: ChildDisplay) {
  if (next.textScale === current.textScale && next.dyslexiaFont === current.dyslexiaFont && next.highContrast === current.highContrast && next.readAloudAuto === current.readAloudAuto) return;
  current = next;
  // On the website one CSS rule in index.html swaps the typeface for everything under #root.
  if (Platform.OS === "web" && typeof document !== "undefined") {
    if (next.dyslexiaFont) document.documentElement.setAttribute("data-dyslexia", "true");
    else document.documentElement.removeAttribute("data-dyslexia");
  }
  listeners.forEach((l) => l());
}

/** The open child's reading and display settings (the standard ones outside the learning area). */
export function useChildDisplay(): ChildDisplay {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getChildDisplay,
    getChildDisplay,
  );
}

/** Colours for the current settings. High contrast uses black text and darker lines (still on the same backgrounds). */
export function displayColors(d: ChildDisplay) {
  if (!d.highContrast) return colors;
  return { ...colors, ink: "#000000", muted: "#2B303B", line: "#6B665E", brand: "#1F5038", placeholder: "#4A515E" };
}

/** Extra letter and line spacing for the dyslexia setting (the font itself is swapped by CSS on the web). */
export function spacingFor(d: ChildDisplay) {
  return d.dyslexiaFont ? { letterSpacing: 0.6, lineGain: 0.2 } : { letterSpacing: 0, lineGain: 0 };
}

/** A band's theme with its font size scaled for the open child. Not reactive: settings change outside the learning flow. */
export function scaledBandTheme(band: BandId) {
  const t = bandTheme[band];
  return { ...t, font: Math.round(t.font * getChildDisplay().textScale * 10) / 10 };
}
