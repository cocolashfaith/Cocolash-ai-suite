/**
 * Scene / Environment Descriptors
 *
 * Defines the environment / backdrop for each image category.
 * Scenes vary by category (e.g., Close-ups always use studio-type,
 * Product has specific staging environments).
 */
import type { Scene, ContentCategory } from "@/lib/types";

const SCENE_DESCRIPTORS: Record<Exclude<Scene, "random">, string> = {
  studio:
    "professional photography studio setting with soft pink gradient background, warm diffused lighting, clean and minimal",
  bedroom:
    "elegant bedroom setting with soft morning light filtering through sheer curtains, warm neutral tones, plush bedding, aspirational lifestyle feel",
  cafe:
    "stylish upscale cafe setting with warm ambient lighting, marble tabletop, soft bokeh background, chic and modern atmosphere",
  "outdoor-golden-hour":
    "outdoor golden hour setting with warm, honey-toned sunlight, soft lens flare, natural greenery background with creamy bokeh",
  rooftop:
    "rooftop setting with city skyline backdrop during golden hour, warm evening light, sophisticated urban atmosphere",
  salon:
    "premium lash salon setting with professional lighting, clean aesthetic, beauty tools artfully arranged, modern luxury interior",
  "bathroom-vanity":
    "elegant bathroom vanity setting with soft warm lighting, marble countertop, luxury skincare products in the background, self-care atmosphere",
  "minimalist-backdrop":
    "minimalist backdrop with solid warm beige or soft pink background, clean negative space, editorial fashion photography feel",
};

/**
 * Returns the prompt descriptor for a given scene.
 */
export function getSceneDescriptor(scene: Exclude<Scene, "random">): string {
  return SCENE_DESCRIPTORS[scene];
}

/**
 * All available scene options for the UI, excluding "random".
 */
export const SCENE_OPTIONS: { value: Scene; label: string }[] = [
  { value: "random", label: "Random" },
  { value: "studio", label: "Studio" },
  { value: "bedroom", label: "Bedroom" },
  { value: "cafe", label: "Cafe" },
  { value: "outdoor-golden-hour", label: "Golden Hour (Outdoor)" },
  { value: "rooftop", label: "Rooftop" },
  { value: "salon", label: "Salon" },
  { value: "bathroom-vanity", label: "Bathroom Vanity" },
  { value: "minimalist-backdrop", label: "Minimalist Backdrop" },
];

/**
 * Scenes available per category.
 * Lash Close-ups default to studio. Product has a subset.
 */
export const SCENES_BY_CATEGORY: Record<ContentCategory, Scene[]> = {
  "lash-closeup": ["studio", "minimalist-backdrop"],
  lifestyle: ["studio", "bedroom", "cafe", "outdoor-golden-hour", "rooftop", "salon", "bathroom-vanity", "minimalist-backdrop", "random"],
  product: ["studio", "bathroom-vanity", "minimalist-backdrop"],
  "before-after": ["studio", "minimalist-backdrop"],
  "application-process": ["salon", "studio"],
};

/**
 * All scene keys excluding "random" (for random selection).
 */
export const ALL_SCENES: Exclude<Scene, "random">[] = [
  "studio", "bedroom", "cafe", "outdoor-golden-hour", "rooftop",
  "salon", "bathroom-vanity", "minimalist-backdrop",
];
