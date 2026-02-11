/**
 * Hair Style Descriptors
 *
 * 12+ styles across Natural, Protective, and Styled groups.
 * Provides detailed, photography-grade descriptions for Gemini prompts.
 */
import type { HairStyle, HairStyleOption, HairStyleGroup } from "@/lib/types";

const HAIR_STYLE_DESCRIPTORS: Record<Exclude<HairStyle, "random">, string> = {
  // Natural
  "4c-natural": "natural 4C coily hair, defined tight coils with beautiful volume and texture, styled upward and outward",
  "afro": "full, voluminous afro hairstyle with perfectly rounded shape, thick and healthy natural texture",
  "twist-out": "gorgeous twist-out hairstyle with defined, elongated curls and beautiful volume, soft and bouncy",
  "blown-out": "blown-out natural hair with smooth, voluminous texture, stretched and flowing with movement",

  // Protective
  "box-braids": "elegant box braids styled beautifully, neat and uniform with a sleek, polished finish",
  "locs": "beautiful locs hairstyle with well-maintained, mature locs showing natural texture and personality",
  "sew-in": "flawless sew-in weave with natural-looking, silky smooth hair, blending seamlessly",
  "cornrows": "intricate cornrow braids with precise, geometric patterns, clean and freshly styled",
  "bantu-knots": "perfectly formed Bantu knots arranged symmetrically, neat and styled with intention",

  // Styled
  "silk-press": "sleek silk press hairstyle, bone-straight with a mirror-like shine and flowing movement",
  "loose-waves": "soft loose waves cascading beautifully, effortless glamour with body and movement",
  "short-tapered": "chic short tapered cut, precision-trimmed with clean edges and a bold, confident style",
};

/**
 * Returns the prompt descriptor for a given hair style.
 */
export function getHairStyleDescriptor(hairStyle: Exclude<HairStyle, "random">): string {
  return HAIR_STYLE_DESCRIPTORS[hairStyle];
}

/**
 * All hair style options grouped for the UI selector.
 */
export const HAIR_STYLE_OPTIONS: HairStyleOption[] = [
  { value: "random", label: "Random (Diverse)", group: "random" },
  // Natural
  { value: "4c-natural", label: "4C Natural", group: "natural" },
  { value: "afro", label: "Afro", group: "natural" },
  { value: "twist-out", label: "Twist-Out", group: "natural" },
  { value: "blown-out", label: "Blown-Out", group: "natural" },
  // Protective
  { value: "box-braids", label: "Box Braids", group: "protective" },
  { value: "locs", label: "Locs", group: "protective" },
  { value: "sew-in", label: "Sew-In", group: "protective" },
  { value: "cornrows", label: "Cornrows", group: "protective" },
  { value: "bantu-knots", label: "Bantu Knots", group: "protective" },
  // Styled
  { value: "silk-press", label: "Silk Press", group: "styled" },
  { value: "loose-waves", label: "Loose Waves", group: "styled" },
  { value: "short-tapered", label: "Short Tapered", group: "styled" },
];

/**
 * Get all styles for a specific group.
 */
export function getStylesByGroup(group: HairStyleGroup): HairStyleOption[] {
  return HAIR_STYLE_OPTIONS.filter((opt) => opt.group === group);
}

/**
 * All hair styles excluding "random" (for diversity rotation).
 */
export const ALL_HAIR_STYLES: Exclude<HairStyle, "random">[] = HAIR_STYLE_OPTIONS
  .filter((opt): opt is HairStyleOption & { value: Exclude<HairStyle, "random"> } => opt.value !== "random")
  .map((opt) => opt.value);
