/**
 * UGC-Optimized Image Prompt Engine
 *
 * Builds dynamic prompts for authentic, iPhone-style UGC images using
 * the Gemini image generation pipeline. These images serve as the
 * first_frame_url for Seedance 2.0 video generation.
 *
 * The prompts are designed to produce imperfect, candid-looking selfies
 * that would fool someone scrolling TikTok — not polished studio portraits.
 */

import type { LashStyle } from "@/lib/types";
import { getLashStyleDescriptor } from "@/lib/prompts/modules/lash-styles";

// ── UGC-Specific Types ───────────────────────────────────────

export type UGCEthnicity =
  | "Caucasian"
  | "Black"
  | "Latina"
  | "South Asian"
  | "East Asian"
  | "Middle Eastern"
  | "Mixed";

export type UGCSkinTone =
  | "Light"
  | "Medium"
  | "Olive"
  | "Tan"
  | "Dark"
  | "Deep";

export type UGCAgeRange = "18-24" | "25-34" | "35-44" | "45+";

export type UGCHairStyle =
  | "Straight long"
  | "Straight short"
  | "Wavy"
  | "Curly"
  | "Braids"
  | "Bun"
  | "Ponytail";

export type UGCScene =
  | "messy-car"
  | "bathroom-mirror"
  | "casual-bedroom"
  | "kitchen-counter"
  | "sunny-sidewalk"
  | "couch"
  | "vanity-desk"
  | "gym-locker";

export type UGCVibe =
  | "excited-discovery"
  | "chill-review"
  | "ranting"
  | "whispering-asmr"
  | "surprised"
  | "casual-unboxing";

export interface UGCImageParams {
  ethnicity: UGCEthnicity;
  skinTone: UGCSkinTone;
  ageRange: UGCAgeRange;
  hairStyle: UGCHairStyle;
  scene: UGCScene;
  vibe: UGCVibe;
  /** Same lash styles as the main Generate page (studio). */
  lashStyle: LashStyle;
  hasProduct: boolean;
  productDescription?: string;
}

// ── Scene Description Mapping ────────────────────────────────

const SCENE_MAP: Record<
  UGCScene,
  { description: string; lighting: string }
> = {
  "messy-car": {
    description:
      "the backseat of a slightly messy car with sunlight coming through the window",
    lighting:
      "Warm ambient car interior lighting with dashboard reflections, slightly overexposed window",
  },
  "bathroom-mirror": {
    description:
      "a real bathroom with visible mirror edge, toothbrush holder, and everyday clutter on the counter",
    lighting:
      "Harsh overhead bathroom light mixed with warm vanity light, slight yellow cast",
  },
  "casual-bedroom": {
    description:
      "a casual bedroom with unmade bed visible in background, fairy lights or a nightstand lamp",
    lighting:
      "Soft warm lamplight from the side, gentle shadows on one side of face",
  },
  "kitchen-counter": {
    description:
      "a kitchen with white cabinets, a stainless sink, and a dish soap bottle softly blurred in background",
    lighting:
      "Warm morning sunlight from a window to the left, soft highlights and gentle shadows",
  },
  "sunny-sidewalk": {
    description:
      "a tree-lined sidewalk with dappled sunlight filtering through green leaves",
    lighting:
      "Dappled natural sunlight creating small shadow patterns, slight overexposure on hair",
  },
  couch: {
    description:
      "a lived-in living room couch with throw pillows and a blanket, TV remote nearby",
    lighting:
      "Soft ambient living room light, warm afternoon tones from nearby window",
  },
  "vanity-desk": {
    description:
      "a vanity desk with a small mirror, makeup products scattered casually, warm-toned room",
    lighting:
      "Warm vanity light from the mirror, soft and slightly flat lighting on face",
  },
  "gym-locker": {
    description:
      "a gym locker room with metal lockers blurred in background, gym bag visible",
    lighting:
      "Harsh fluorescent overhead lighting, slightly cool and flat, unflattering but real",
  },
};

// ── Vibe Expression Mapping ──────────────────────────────────

const VIBE_MAP: Record<UGCVibe, string> = {
  "excited-discovery":
    "Her expression is genuinely excited, mouth slightly open mid-sentence, eyes bright and wide, like she just discovered something amazing she needs to share immediately",
  "chill-review":
    "Her expression is calm and conversational, slight knowing smirk, relaxed eyebrows, like she is casually telling a friend about something she has been using for weeks",
  ranting:
    "Her expression is animated and passionate, one eyebrow slightly raised, gesturing with one hand, like she is passionately explaining why everyone needs to try this",
  "whispering-asmr":
    "Her expression is soft and intimate, lips close together, eyes looking directly into camera with a gentle conspiratorial look, like she is whispering a secret to the viewer",
  surprised:
    "Her expression shows genuine surprise, eyebrows up, mouth in a small O shape, like she just read the ingredients label and cannot believe what she is seeing",
  "casual-unboxing":
    "Her expression is curious and focused, looking slightly down at something in her hands, lips slightly pursed in concentration, like she is opening a package she just received",
};

// ── Imperfection Options ─────────────────────────────────────

const IMPERFECTIONS = [
  "Slight jpeg compression artifacts visible",
  "Subtle motion blur on hair strands from slight movement",
  "Tiny bit of grain from low-light phone camera",
  "One stray hair across forehead",
  "Slight shadow under chin from phone angle",
  "Minimal natural redness on nose and cheeks",
  "A small blemish near jawline",
  "Phone notification bar faintly visible at very top edge",
];

// ── Negative Prompt (constant) ───────────────────────────────

const NEGATIVE_PROMPT =
  "CGI, 3D render, studio lighting, professional photography, DSLR, ring light reflection, " +
  "beauty filter, retouched skin, perfect smooth skin, symmetrical face, model pose, " +
  "photoshoot aesthetic, glamour shot, heavy makeup, HDR, overprocessed, text, watermark, " +
  "logo, hyper-glamorous, stock photo, bokeh circles, lens flare, vignette";

// ── Helper: Pick Random Subset ───────────────────────────────

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}

// ── Main Prompt Builder ──────────────────────────────────────

export function buildUGCImagePrompt(params: UGCImageParams): {
  prompt: string;
  negativePrompt: string;
} {
  const {
    ethnicity,
    skinTone,
    ageRange,
    hairStyle,
    scene,
    vibe,
    lashStyle,
    hasProduct,
    productDescription,
  } = params;

  const sceneData = SCENE_MAP[scene];
  const vibeExpression = VIBE_MAP[vibe];

  // Product holding detail
  const productDetail =
    hasProduct && productDescription
      ? `She is casually holding ${productDescription} in one hand near her chin level, grip natural and relaxed, product label partially visible. The product is proportional and not the focus — she is.\n\n`
      : "";

  const lashDescriptor = getLashStyleDescriptor(lashStyle);
  const lashDetail = `Her lashes show ${lashDescriptor}. Slight natural asymmetry — not perfectly uniform.`;

  // Randomly pick 2-3 imperfections
  const imperfectionCount = 2 + Math.floor(Math.random() * 2); // 2 or 3
  const selectedImperfections = pickRandom(IMPERFECTIONS, imperfectionCount);
  const imperfectionText = selectedImperfections.join(". ") + ".";

  // iPhone filename trick
  const fakeFilename = `IMG_${randomDigits(4)}.HEIC`;

  const prompt = [
    `Raw, unedited front-facing smartphone camera photo of a ${ageRange}-year-old ${ethnicity} woman with ${skinTone.toLowerCase()} skin and ${hairStyle.toLowerCase()} hair.`,
    "",
    `She is in ${sceneData.description}. ${sceneData.lighting}.`,
    "",
    `${vibeExpression}.`,
    "",
    productDetail.trimEnd(),
    lashDetail,
    "",
    `Authentic iPhone selfie aesthetic, candid and slightly off-center framing, camera held at eye level. Visible natural skin texture including pores, subtle under-eye texture, and flyaway hairs. Slight natural facial asymmetry. Muted, realistic skin tones with no color grading. ${imperfectionText}`,
    "",
    fakeFilename,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { prompt, negativePrompt: NEGATIVE_PROMPT };
}

// ── Dropdown Option Arrays (for UI) ──────────────────────────

export const UGC_ETHNICITY_OPTIONS: { value: UGCEthnicity; label: string }[] = [
  { value: "Caucasian", label: "Caucasian" },
  { value: "Black", label: "Black" },
  { value: "Latina", label: "Latina" },
  { value: "South Asian", label: "South Asian" },
  { value: "East Asian", label: "East Asian" },
  { value: "Middle Eastern", label: "Middle Eastern" },
  { value: "Mixed", label: "Mixed" },
];

export const UGC_SKIN_TONE_OPTIONS: { value: UGCSkinTone; label: string }[] = [
  { value: "Light", label: "Light" },
  { value: "Medium", label: "Medium" },
  { value: "Olive", label: "Olive" },
  { value: "Tan", label: "Tan" },
  { value: "Dark", label: "Dark" },
  { value: "Deep", label: "Deep" },
];

export const UGC_AGE_RANGE_OPTIONS: { value: UGCAgeRange; label: string }[] = [
  { value: "18-24", label: "18–24" },
  { value: "25-34", label: "25–34" },
  { value: "35-44", label: "35–44" },
  { value: "45+", label: "45+" },
];

export const UGC_HAIR_STYLE_OPTIONS: { value: UGCHairStyle; label: string }[] = [
  { value: "Straight long", label: "Straight Long" },
  { value: "Straight short", label: "Straight Short" },
  { value: "Wavy", label: "Wavy" },
  { value: "Curly", label: "Curly" },
  { value: "Braids", label: "Braids" },
  { value: "Bun", label: "Bun" },
  { value: "Ponytail", label: "Ponytail" },
];

export const UGC_SCENE_OPTIONS: { value: UGCScene; label: string }[] = [
  { value: "messy-car", label: "Messy Car Backseat" },
  { value: "bathroom-mirror", label: "Bathroom Mirror" },
  { value: "casual-bedroom", label: "Casual Bedroom" },
  { value: "kitchen-counter", label: "Kitchen Counter" },
  { value: "sunny-sidewalk", label: "Sunny Sidewalk" },
  { value: "couch", label: "Couch / Sofa" },
  { value: "vanity-desk", label: "Vanity Desk" },
  { value: "gym-locker", label: "Gym Locker Room" },
];

export const UGC_VIBE_OPTIONS: { value: UGCVibe; label: string }[] = [
  { value: "excited-discovery", label: "Excited Discovery" },
  { value: "chill-review", label: "Chill Honest Review" },
  { value: "ranting", label: "Ranting / Passionate" },
  { value: "whispering-asmr", label: "Whispering ASMR" },
  { value: "surprised", label: "Surprised / Shocked" },
  { value: "casual-unboxing", label: "Casual Unboxing" },
];

