/**
 * Vibe / Mood Descriptors
 *
 * Defines the emotional and stylistic mood of the generated image.
 * Influences pose, expression, color grading, and overall energy.
 */
import type { Vibe } from "@/lib/types";

const VIBE_DESCRIPTORS: Record<Exclude<Vibe, "random">, string> = {
  "confident-glam":
    "exuding confident glamour energy, direct gaze with a subtle power smile, poised and self-assured, head slightly tilted with effortless grace",
  "soft-romantic":
    "soft romantic mood, gentle and dreamy expression, warm golden light, slightly lowered gaze with a serene half-smile, tender and intimate feeling",
  "bold-editorial":
    "bold editorial mood, fierce and fashion-forward expression, strong geometric pose, high-contrast lighting, magazine cover energy",
  "natural-beauty":
    "natural beauty mood, fresh-faced and radiant, genuine warm smile showing authentic joy, minimal-glam aesthetic with a healthy natural glow",
  "night-out":
    "night-out glamour mood, alluring and sophisticated, smoky-eye energy with sparkling catchlights, ready for an evening of elegance",
  "self-care":
    "self-care relaxation mood, peaceful and pampered expression, soft lighting, wrapped in comfort, indulgent and serene atmosphere",
  professional:
    "professional confidence mood, polished and put-together, approachable yet authoritative expression, clean and sharp styling",
};

/**
 * Returns the prompt descriptor for a given vibe.
 */
export function getVibeDescriptor(vibe: Exclude<Vibe, "random">): string {
  return VIBE_DESCRIPTORS[vibe];
}

/**
 * UI options for the vibe selector.
 */
export const VIBE_OPTIONS: { value: Vibe; label: string; description: string }[] = [
  { value: "random", label: "Random", description: "Surprise me" },
  { value: "confident-glam", label: "Confident Glam", description: "Power pose, self-assured" },
  { value: "soft-romantic", label: "Soft Romantic", description: "Dreamy, warm, intimate" },
  { value: "bold-editorial", label: "Bold Editorial", description: "Fashion-forward, fierce" },
  { value: "natural-beauty", label: "Natural Beauty", description: "Fresh, authentic, radiant" },
  { value: "night-out", label: "Night Out", description: "Alluring, sophisticated" },
  { value: "self-care", label: "Self-Care", description: "Peaceful, pampered" },
  { value: "professional", label: "Professional", description: "Polished, authoritative" },
];

/**
 * All vibes excluding "random" (for random selection).
 */
export const ALL_VIBES: Exclude<Vibe, "random">[] = [
  "confident-glam", "soft-romantic", "bold-editorial",
  "natural-beauty", "night-out", "self-care", "professional",
];
