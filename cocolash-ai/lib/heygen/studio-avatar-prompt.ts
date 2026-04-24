/**
 * Studio Avatar Image Prompt Engine
 *
 * Builds prompts for professional, half-body brand presenter images
 * suited for HeyGen talking-head videos. These are NOT UGC selfies —
 * they look like still frames from a branded YouTube tutorial or
 * educational content series.
 */

import type { LashStyle, CampaignType } from "@/lib/types";
import type { UGCEthnicity, UGCSkinTone, UGCAgeRange, UGCHairStyle } from "@/lib/seedance/ugc-image-prompt";
import { getLashStyleDescriptor } from "@/lib/prompts/modules/lash-styles";

// ── Studio-Specific Types ────────────────────────────────────

export type StudioScene =
  | "warm-minimal-studio"
  | "textured-studio-wall"
  | "founders-desk"
  | "soft-lit-home-office"
  | "clean-white-cyclorama"
  | "soft-beige-backdrop"
  | "neutral-gradient"
  | "desk-with-bokeh"
  | "high-contrast-studio"
  | "editorial-dark-backdrop"
  | "clean-gradient"
  | "boutique-shelf"
  | "product-props-studio"
  | "clean-neutral-studio";

export type StudioOutfit =
  | "professional-blazer"
  | "editorial-knit"
  | "minimalist-tee"
  | "cozy-sweater"
  | "silk-blouse"
  | "crisp-shirt";

export type StudioFraming = "head-chest" | "head-waist";

export type StudioExpression =
  | "confident-teacher"
  | "warm-approachable"
  | "knowledgeable-expert"
  | "thoughtful-storyteller";

export interface StudioAvatarParams {
  ethnicity: UGCEthnicity;
  skinTone: UGCSkinTone;
  ageRange: UGCAgeRange;
  hairStyle: UGCHairStyle;
  scene: StudioScene;
  outfit: StudioOutfit;
  framing: StudioFraming;
  expression: StudioExpression;
  lashStyle: LashStyle;
  customPrompt?: string;
}

// ── Scene Descriptions ───────────────────────────────────────

const STUDIO_SCENE_MAP: Record<StudioScene, { description: string; lighting: string }> = {
  "warm-minimal-studio": {
    description: "a warm, minimalist studio with soft cream-toned walls and gentle texture",
    lighting: "Soft diffused studio key light from camera-left, gentle fill, subtle catchlights in the eyes",
  },
  "textured-studio-wall": {
    description: "a studio with a textured concrete or plaster wall in warm neutral tones",
    lighting: "Directional key light creating gentle shadows on the textured wall, warm fill from the right",
  },
  "founders-desk": {
    description: "a thoughtfully styled desk with a warm wood surface, a small plant, and soft decor in the background",
    lighting: "Warm natural window light from camera-left combined with soft ambient room light",
  },
  "soft-lit-home-office": {
    description: "a modern, clean home office with warm shelving, soft textiles, and a blurred bookshelf in the background",
    lighting: "Balanced warm ambient light with a subtle key light from a desk lamp off-frame",
  },
  "clean-white-cyclorama": {
    description: "a clean white studio cyclorama with no visible edges, pure and professional",
    lighting: "Even, soft diffused lighting from multiple sources, minimal shadows, clean and bright",
  },
  "soft-beige-backdrop": {
    description: "a seamless soft beige or sand-colored studio backdrop",
    lighting: "Soft butterfly lighting from slightly above, gentle warmth, clean catchlights",
  },
  "neutral-gradient": {
    description: "a smooth gradient backdrop transitioning from warm grey to soft white",
    lighting: "Soft rim light from behind, key light centered, creating a clean professional look",
  },
  "desk-with-bokeh": {
    description: "a professional desk setup with warm-toned items softly blurred in the background",
    lighting: "Soft directional light from a large window, gentle bokeh on background elements",
  },
  "high-contrast-studio": {
    description: "a studio with a rich, dark charcoal backdrop creating strong subject separation",
    lighting: "Dramatic Rembrandt lighting with a strong key light from camera-left, deep shadows on opposite side",
  },
  "editorial-dark-backdrop": {
    description: "a deep, dark editorial backdrop in rich navy or dark brown tones",
    lighting: "Precise studio lighting with a beauty dish overhead, rim light from behind for hair separation",
  },
  "clean-gradient": {
    description: "a smooth gradient from medium grey to white, editorial and modern",
    lighting: "Clean, even studio lighting with subtle directional quality, no harsh shadows",
  },
  "boutique-shelf": {
    description: "a styled boutique shelf with beauty products and small plants softly blurred in the background",
    lighting: "Warm ambient boutique lighting with soft highlights on the shelf items, key light on subject",
  },
  "product-props-studio": {
    description: "a softly-lit studio with elegant beauty product props arranged on a surface behind the subject",
    lighting: "Warm studio lighting with gentle highlights on the props, main key light on subject from camera-left",
  },
  "clean-neutral-studio": {
    description: "a clean, neutral studio with warm grey walls and minimal visual noise",
    lighting: "Balanced studio lighting, soft and even, with subtle catchlights and gentle fill",
  },
};

// ── Outfit Descriptions ──────────────────────────────────────

const OUTFIT_MAP: Record<StudioOutfit, string> = {
  "professional-blazer": "a tailored blazer in a neutral tone (charcoal, navy, or camel) over a simple top",
  "editorial-knit": "a soft, high-quality knit sweater in a muted tone, slightly oversized for a relaxed editorial feel",
  "minimalist-tee": "a clean, well-fitted crew-neck t-shirt in white, black, or soft grey",
  "cozy-sweater": "a cozy, warm-toned cable-knit sweater that feels approachable and relatable",
  "silk-blouse": "an elegant silk or satin blouse in a soft, muted color — professional but feminine",
  "crisp-shirt": "a crisp, tailored button-down shirt with a clean collar, sleeves slightly rolled",
};

// ── Expression Descriptions ──────────────────────────────────

const EXPRESSION_MAP: Record<StudioExpression, string> = {
  "confident-teacher": "confident and poised, with a slight knowing smile and steady, direct eye contact — like someone mid-explanation of something she's passionate about",
  "warm-approachable": "warm and genuinely friendly, with a natural smile and open, inviting expression — like greeting someone she's about to help",
  "knowledgeable-expert": "composed and intelligent, with a subtle, measured expression that conveys authority — like a beauty editor about to share insider knowledge",
  "thoughtful-storyteller": "reflective and thoughtful, with a gentle expression and soft eyes — like someone about to share a meaningful personal story",
};

// ── Scene → Campaign Mapping ─────────────────────────────────

const SCENES_BY_CAMPAIGN: Record<string, StudioScene[]> = {
  "brand-story": ["warm-minimal-studio", "textured-studio-wall", "founders-desk", "soft-lit-home-office"],
  faq: ["clean-white-cyclorama", "soft-beige-backdrop", "neutral-gradient", "desk-with-bokeh"],
  myths: ["high-contrast-studio", "editorial-dark-backdrop", "clean-gradient"],
  "product-knowledge": ["boutique-shelf", "product-props-studio", "clean-neutral-studio"],
};

const ALL_STUDIO_SCENES = Object.values(SCENES_BY_CAMPAIGN).flat();

export function getScenesForCampaign(campaign?: CampaignType): StudioScene[] {
  if (campaign && SCENES_BY_CAMPAIGN[campaign]) {
    return SCENES_BY_CAMPAIGN[campaign];
  }
  return [...new Set(ALL_STUDIO_SCENES)];
}

// ── Main Prompt Builder ──────────────────────────────────────

// ── Imperfections (borrowed from UGC prompt, adapted for studio context) ─

const STUDIO_IMPERFECTIONS = [
  "A single stray hair falling across the forehead",
  "Subtle flyaway hairs at the crown catching the light",
  "Minimal natural redness on nose tip and cheeks",
  "Tiny beauty mark or freckle near the jawline",
  "One eyelash slightly longer than the others on one eye",
  "Micro-texture of natural lip dryness on lower lip",
  "Faintest hint of under-eye warmth — not concealed, not dark circles, just lived-in",
  "A barely-visible crease line in the shirt from sitting",
  "Slight asymmetry in eyebrow shape — one slightly more arched",
  "Very subtle shadow of peach fuzz on the upper lip catching side light",
];

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function buildStudioAvatarPrompt(params: StudioAvatarParams): {
  prompt: string;
  negativePrompt: string;
} {
  const {
    ethnicity,
    skinTone,
    ageRange,
    hairStyle,
    scene,
    outfit,
    framing,
    expression,
    lashStyle,
    customPrompt,
  } = params;

  const sceneData = STUDIO_SCENE_MAP[scene];
  const outfitDesc = OUTFIT_MAP[outfit];
  const expressionDesc = EXPRESSION_MAP[expression];
  const lashDescriptor = getLashStyleDescriptor(lashStyle);

  const framingDesc =
    framing === "head-waist"
      ? "head, chest, and waist visible with a comfortable amount of headroom, arms relaxed at sides or resting on a surface"
      : "head and chest with a gentle shoulder-down crop, comfortable headroom above";

  const imperfections = pickRandom(STUDIO_IMPERFECTIONS, 3);
  const imperfectionText = imperfections.join(". ") + ".";

  const prompt = [
    `Candid-looking half-body portrait photograph of a ${ageRange}-year-old ${ethnicity} woman with ${skinTone.toLowerCase()} skin and ${hairStyle.toLowerCase()} hair, captured mid-conversation while explaining a beauty topic she cares about.`,
    "",
    `Framing: ${framingDesc}. She is looking directly into the camera with ${expressionDesc} — her gaze is natural, not posed. Chin naturally positioned, relaxed posture, shoulders slightly uneven as if mid-gesture. Slight natural facial asymmetry.`,
    "",
    `She is wearing ${outfitDesc} — the fabric has natural folds and creases, not perfectly pressed. Subtle, realistic makeup with defined lashes — ${lashDescriptor}. Her makeup is tasteful but not airbrushed; you can see real skin underneath — visible pores, natural skin texture, fine lines around the eyes, and real skin tone variation across her face.`,
    "",
    `Skin details: ${imperfectionText} These imperfections make her look REAL, not generated. The goal is a person you'd believe exists, not a render.`,
    "",
    `Setting: ${sceneData.description}. ${sceneData.lighting}. The background has depth and natural imperfections — a slightly crooked item, uneven spacing, real-world messiness that makes the scene feel lived-in.`,
    "",
    `Shot on an 85mm lens at f/2.0 with shallow depth of field, natural color grading with warm tones. NOT color-corrected to perfection — slight warmth bias, muted highlights. The image should feel like a still frame pulled from a high-quality YouTube talking-head video, not a planned photoshoot.`,
    "",
    `Critical: This must NOT look AI-generated. No symmetrical features, no uniform skin smoothness, no perfect teeth, no uncanny valley. She should look like a real content creator filming in a real space.`,
    ...(customPrompt ? ["", customPrompt] : []),
  ]
    .join("\n")
    .trim();

  const negativePrompt =
    "phone-selfie angles, bathroom or car interiors, mirror reflections, exaggerated expressions, " +
    "wide-open mouth, extreme low/high angles, full-body or far-away shots, multiple people, " +
    "text or watermarks, over-smoothed skin, perfectly smooth skin, airbrushed, plastic skin, " +
    "uncanny proportions, over-saturated colors, perfectly symmetrical face, " +
    "hyper-glam influencer makeup, product packaging obscuring face, looking off-camera, " +
    "CGI, 3D render, cartoon, anime, stock photo, ring light reflection, beauty filter, " +
    "HDR, overprocessed, perfect teeth, model pose, photoshoot aesthetic, glamour shot";

  return { prompt, negativePrompt };
}

// ── Dropdown Option Arrays (for UI) ──────────────────────────

export const STUDIO_SCENE_OPTIONS: { value: StudioScene; label: string }[] = [
  { value: "warm-minimal-studio", label: "Warm Minimal Studio" },
  { value: "textured-studio-wall", label: "Textured Studio Wall" },
  { value: "founders-desk", label: "Founder's Desk" },
  { value: "soft-lit-home-office", label: "Soft-Lit Home Office" },
  { value: "clean-white-cyclorama", label: "Clean White Cyclorama" },
  { value: "soft-beige-backdrop", label: "Soft Beige Backdrop" },
  { value: "neutral-gradient", label: "Neutral Gradient" },
  { value: "desk-with-bokeh", label: "Desk with Soft Bokeh" },
  { value: "high-contrast-studio", label: "High-Contrast Studio" },
  { value: "editorial-dark-backdrop", label: "Editorial Dark Backdrop" },
  { value: "clean-gradient", label: "Clean Gradient" },
  { value: "boutique-shelf", label: "Boutique Shelf Background" },
  { value: "product-props-studio", label: "Studio with Product Props" },
  { value: "clean-neutral-studio", label: "Clean Neutral Studio" },
];

export const STUDIO_OUTFIT_OPTIONS: { value: StudioOutfit; label: string }[] = [
  { value: "professional-blazer", label: "Professional Blazer" },
  { value: "editorial-knit", label: "Editorial Knit" },
  { value: "minimalist-tee", label: "Minimalist Tee" },
  { value: "cozy-sweater", label: "Cozy Sweater" },
  { value: "silk-blouse", label: "Silk Blouse" },
  { value: "crisp-shirt", label: "Crisp Shirt" },
];

export const STUDIO_FRAMING_OPTIONS: { value: StudioFraming; label: string }[] = [
  { value: "head-chest", label: "Head & Chest" },
  { value: "head-waist", label: "Head to Waist" },
];

export const STUDIO_EXPRESSION_OPTIONS: { value: StudioExpression; label: string }[] = [
  { value: "confident-teacher", label: "Confident Teacher" },
  { value: "warm-approachable", label: "Warm & Approachable" },
  { value: "knowledgeable-expert", label: "Knowledgeable Expert" },
  { value: "thoughtful-storyteller", label: "Thoughtful Storyteller" },
];
