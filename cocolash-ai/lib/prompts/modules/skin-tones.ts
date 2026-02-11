/**
 * Skin Tone Descriptors — Monk Skin Tone Scale
 *
 * Provides rich, respectful, photography-grade descriptors for
 * each skin tone tier. Multiple synonyms per tier allow diversity
 * even within a single skin-tone selection.
 */
import type { SkinTone } from "@/lib/types";

const SKIN_TONE_DESCRIPTORS: Record<Exclude<SkinTone, "random">, string[]> = {
  deep: [
    "deep espresso-toned skin with a luminous, healthy glow",
    "rich dark chocolate complexion with visible micro-texture and warm undertones",
    "deep mahogany skin with a radiant, dewy finish",
  ],
  "medium-deep": [
    "warm cocoa-toned skin with a natural, healthy sheen",
    "caramel brown complexion with rich, warm undertones and visible pores",
    "warm chestnut skin with a luminous, sun-kissed glow",
  ],
  medium: [
    "golden brown skin with a warm honey undertone and natural glow",
    "warm honey-brown complexion with visible skin texture and healthy radiance",
    "toffee-toned skin with golden highlights and a natural luminosity",
  ],
  light: [
    "light brown skin with golden undertones and a warm, healthy glow",
    "warm tawny complexion with visible freckles and natural radiance",
    "light caramel skin with warm undertones and a dewy finish",
  ],
};

/**
 * Returns a random descriptor for the given skin tone.
 * For "random", selects a random tier first, then a random descriptor.
 */
export function getSkinToneDescriptor(skinTone: Exclude<SkinTone, "random">): string {
  const descriptors = SKIN_TONE_DESCRIPTORS[skinTone];
  return descriptors[Math.floor(Math.random() * descriptors.length)];
}

/**
 * All available skin tone tiers (excluding "random").
 */
export const SKIN_TONE_TIERS: Exclude<SkinTone, "random">[] = [
  "deep",
  "medium-deep",
  "medium",
  "light",
];

/**
 * UI options for the skin tone selector.
 */
export const SKIN_TONE_OPTIONS = [
  { value: "random" as const, label: "Random (Diverse)", swatchColor: "linear-gradient(135deg, #3B2417, #6B4226, #A67B5B, #C9A882)" },
  { value: "deep" as const, label: "Deep", swatchColor: "#3B2417" },
  { value: "medium-deep" as const, label: "Medium-Deep", swatchColor: "#6B4226" },
  { value: "medium" as const, label: "Medium", swatchColor: "#A67B5B" },
  { value: "light" as const, label: "Light", swatchColor: "#C9A882" },
];
