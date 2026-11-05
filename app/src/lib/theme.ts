import type { BandId } from "./api";

export const colors = {
  bg: "#FBF8F3",
  card: "#FFFFFF",
  ink: "#1F2430",
  muted: "#5E6573",
  line: "#E7E1D7",
  brand: "#2F6B4F", // calm green: "honest", trustworthy
  brandSoft: "#E3F0E8",
  warn: "#B4541A",
  warnSoft: "#FCEBDD",
  danger: "#B42318",
  good: "#1F7A4C",
  goodSoft: "#DDF3E6",
};

/** Each age band gets an accent; younger bands are bolder and more playful. */
export const bandTheme: Record<BandId, { accent: string; soft: string; font: number; radius: number }> = {
  b1: { accent: "#E0812B", soft: "#FDEBD9", font: 22, radius: 24 },
  b2: { accent: "#D9534F", soft: "#FBE3E2", font: 20, radius: 20 },
  b3: { accent: "#3D7DD8", soft: "#E1ECFB", font: 18, radius: 16 },
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
};

export const topicLabels: Record<string, { label: string; emoji: string }> = {
  religion: { label: "Religions & beliefs", emoji: "🕯️" },
  body: { label: "Body, puberty & relationships", emoji: "🌱" },
  politics: { label: "Politics & contested history", emoji: "🏛️" },
};
