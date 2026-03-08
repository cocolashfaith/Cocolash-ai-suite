/**
 * Ethnicity Descriptors — Upgrade 1, Phase 1.10
 *
 * Photography-grade descriptors for each ethnicity.
 * When ethnicity is "african-american", the existing Monk Scale skin tone
 * system continues as-is. For other ethnicities, the ethnicity descriptor
 * replaces the skin tone descriptor in the prompt.
 */
import type { Ethnicity } from "@/lib/types";

const ETHNICITY_DESCRIPTORS: Record<Exclude<Ethnicity, "random">, string[]> = {
  "african-american": [
    "beautiful African American woman with rich melanin skin, natural radiance, and warm undertones",
    "stunning Black woman with luminous dark skin, visible micro-texture, and a healthy glow",
    "gorgeous African American woman with deep, vibrant skin tone and natural beauty",
  ],
  "east-asian": [
    "beautiful East Asian woman with warm-toned porcelain skin, subtle golden undertones, and a natural dewy finish",
    "stunning East Asian woman with smooth, luminous skin and delicate features, photographed with warm natural lighting",
    "gorgeous East Asian woman with clear, even-toned complexion and a healthy radiant glow",
  ],
  "south-asian": [
    "beautiful South Asian woman with warm bronze skin, rich golden-brown undertones, and a luminous complexion",
    "stunning South Asian woman with warm olive-to-bronze skin, natural radiance, and visible healthy skin texture",
    "gorgeous South Asian woman with rich, warm-toned brown skin and a natural dewy glow",
  ],
  indian: [
    "beautiful Indian woman with warm golden-brown skin, rich undertones, and a luminous complexion",
    "stunning Indian woman with warm bronze skin, expressive dark eyes, and naturally radiant complexion",
    "gorgeous Indian woman with rich caramel-to-bronze skin tone, healthy glow, and natural beauty",
  ],
  latina: [
    "beautiful Latina woman with warm olive-to-bronze skin, rich undertones, and a sun-kissed radiance",
    "stunning Latina woman with warm golden-brown complexion, healthy glow, and natural beauty",
    "gorgeous Latina woman with warm caramel skin, visible skin texture, and luminous finish",
  ],
  "middle-eastern": [
    "beautiful Middle Eastern woman with warm amber skin, olive undertones, and a natural luminous glow",
    "stunning Middle Eastern woman with warm olive-toned complexion, rich dark features, and healthy radiance",
    "gorgeous Middle Eastern woman with warm honey-to-bronze skin and naturally radiant complexion",
  ],
  caucasian: [
    "beautiful Caucasian woman with fair to medium skin, natural pink undertones, and a healthy glow",
    "stunning Caucasian woman with warm-toned fair complexion, visible natural skin texture, and soft radiance",
    "gorgeous Caucasian woman with light skin, warm peachy undertones, and a natural dewy finish",
  ],
  mixed: [
    "beautiful mixed-race woman with warm blended skin tones, unique features, and a natural radiant glow",
    "stunning mixed-heritage woman with warm, harmonious complexion combining multiple ethnic features beautifully",
    "gorgeous mixed-race woman with warm, multifaceted skin tone and naturally luminous complexion",
  ],
};

export function getEthnicityDescriptor(
  ethnicity: Exclude<Ethnicity, "random">
): string {
  const descriptors = ETHNICITY_DESCRIPTORS[ethnicity];
  return descriptors[Math.floor(Math.random() * descriptors.length)];
}

export const ALL_ETHNICITIES: Exclude<Ethnicity, "random">[] = [
  "african-american",
  "east-asian",
  "south-asian",
  "indian",
  "latina",
  "middle-eastern",
  "caucasian",
  "mixed",
];

export const ETHNICITY_OPTIONS: {
  value: Ethnicity;
  label: string;
  desc: string;
}[] = [
  { value: "random", label: "Random (Diverse)", desc: "Rotates through all" },
  { value: "african-american", label: "African American", desc: "Rich melanin skin" },
  { value: "east-asian", label: "East Asian", desc: "Warm-toned porcelain skin" },
  { value: "south-asian", label: "South Asian", desc: "Warm bronze skin" },
  { value: "indian", label: "Indian", desc: "Golden-brown skin" },
  { value: "latina", label: "Latina", desc: "Olive-to-bronze skin" },
  { value: "middle-eastern", label: "Middle Eastern", desc: "Warm amber skin" },
  { value: "caucasian", label: "Caucasian", desc: "Fair to medium skin" },
  { value: "mixed", label: "Mixed", desc: "Warm blended tones" },
];
