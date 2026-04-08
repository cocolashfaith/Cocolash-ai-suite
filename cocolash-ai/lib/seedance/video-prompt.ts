/**
 * Seedance 2.0 Video Prompt Engine
 *
 * Builds dynamic prompts for Seedance video generation based on
 * campaign type, scene, vibe, and audio mode.
 *
 * Prompt structure follows the optimal Seedance ordering:
 * [Subject + Appearance] → [Setting + Lighting] → [Product Interaction]
 * → [Movement + Camera] → [Tone + Expression] → [Dialogue OR Audio Reference]
 *
 * Two modes:
 * - Script-in-prompt: Seedance speaks the script text (embedded in prompt)
 * - Uploaded audio: Seedance lip-syncs to user-provided audio (prompt references audio)
 */

import type { CampaignType } from "../types";
import type { UGCScene, UGCVibe } from "./ugc-image-prompt";

// ── Param Types ──────────────────────────────────────────────

export interface SeedancePromptParams {
  campaignType: CampaignType;
  scriptText: string;
  personDescription: string;
  productDescription: string;
  scene: UGCScene;
  vibe: UGCVibe;
  duration: number;
}

export interface SeedanceAudioPromptParams {
  campaignType: CampaignType;
  personDescription: string;
  productDescription: string;
  scene: UGCScene;
  vibe: UGCVibe;
  duration: number;
}

// ── Scene Description Mapping (video context) ────────────────

const VIDEO_SCENE_MAP: Record<UGCScene, string> = {
  "messy-car": "the backseat of a car with natural sunlight through windows",
  "bathroom-mirror":
    "a real bathroom, visible in the mirror with everyday items around",
  "casual-bedroom":
    "a cozy bedroom with warm lamp lighting and lived-in background",
  "kitchen-counter": "a kitchen with natural morning window light",
  "sunny-sidewalk":
    "outdoors on a sidewalk with dappled sunlight through trees",
  couch: "a comfortable living room couch with afternoon light",
  "vanity-desk": "a vanity desk with warm mirror lighting and scattered makeup",
  "gym-locker": "a gym locker room with fluorescent lighting",
};

// ── Vibe Description Mapping (video energy) ──────────────────

const VIDEO_VIBE_MAP: Record<UGCVibe, string> = {
  "excited-discovery":
    "Genuinely excited, almost breathless energy, like she cannot contain herself",
  "chill-review":
    "Calm, conversational, like a low-key chat with a close friend",
  ranting:
    "Passionate and animated, talking fast with lots of hand movement",
  "whispering-asmr":
    "Soft, intimate whispering energy, slow deliberate movements, ASMR aesthetic",
  surprised:
    "Genuine shock and amazement, wide eyes, dramatic reactions",
  "casual-unboxing":
    "Curious and focused, studying the product with genuine interest",
};

// ── Campaign Template Builders ───────────────────────────────

type TemplateVars = {
  personDescription: string;
  sceneDescription: string;
  productDescription: string;
  vibeDescription: string;
  scene: UGCScene;
};

type ScriptTemplateVars = TemplateVars & { scriptText: string };

const SCRIPT_TEMPLATES: Record<CampaignType, (v: ScriptTemplateVars) => string> = {
  testimonial: (v) =>
    `A casual, handheld UGC selfie-style video of ${v.personDescription} in ${v.sceneDescription}. ` +
    `She is talking directly into her phone camera, giving a genuine, unscripted-feeling review. ` +
    `Natural head movements, expressive eyebrows, and occasional hand gestures. She holds ` +
    `${v.productDescription} casually in one hand, sometimes lifting it toward the camera. ` +
    `The lighting matches a real ${v.scene} environment — not studio, not perfect. ` +
    `Her energy is ${v.vibeDescription}. Slight camera shake from being handheld. ` +
    `She speaks naturally with pauses and emphasis:\n"${v.scriptText}"`,

  "product-showcase": (v) =>
    `A UGC-style video of ${v.personDescription} in ${v.sceneDescription}. She is excitedly showing off ` +
    `${v.productDescription} to her phone camera. She holds the product up near her face, turns it to ` +
    `show different angles, and taps it gently. Her grip is natural and casual, not like a model. ` +
    `Camera perspective is a phone propped up or held in other hand. ${v.vibeDescription} energy. ` +
    `Natural imperfect lighting from ${v.scene}. She says:\n"${v.scriptText}"`,

  unboxing: (v) =>
    `An enthusiastic UGC unboxing video of ${v.personDescription} in ${v.sceneDescription}. ` +
    `She has just received a package and is opening it on camera. She pulls out ${v.productDescription}, ` +
    `her expression shifting from curiosity to excitement as she sees it. She holds the product ` +
    `close to camera to show details, then pulls back to react. High energy, genuine surprise. ` +
    `Handheld phone perspective with slight movement. She says excitedly:\n"${v.scriptText}"`,

  educational: (v) =>
    `A helpful, tutorial-style UGC video of ${v.personDescription} in ${v.sceneDescription}. ` +
    `She is speaking directly to camera in a friendly, knowledgeable way. She holds ` +
    `${v.productDescription} and occasionally points to it or demonstrates something. ` +
    `Conversational pacing with natural pauses. Phone propped on surface or held steady. ` +
    `Relaxed informative energy. She explains:\n"${v.scriptText}"`,

  "before-after": (v) =>
    `An energetic, fast-paced UGC video of ${v.personDescription} in ${v.sceneDescription}. ` +
    `She is hyped up, moving her face side to side slightly to show off her look from different ` +
    `angles. She holds ${v.productDescription} and points at it emphatically. Quick movements, ` +
    `excited energy, like recording a story update to share a deal. She says urgently:\n"${v.scriptText}"`,

  promo: (v) =>
    `An energetic, fast-paced UGC video of ${v.personDescription} in ${v.sceneDescription}. ` +
    `She is hyped up, moving her face side to side slightly to show off her look from different ` +
    `angles. She holds ${v.productDescription} and points at it emphatically. Quick movements, ` +
    `excited energy, like recording a story update to share a deal. She says urgently:\n"${v.scriptText}"`,
};

const AUDIO_TEMPLATES: Record<CampaignType, (v: TemplateVars) => string> = {
  testimonial: (v) =>
    `A casual, handheld UGC selfie-style video of ${v.personDescription} in ${v.sceneDescription}. ` +
    `She is talking directly into her phone camera, giving a genuine review. Her lip movements ` +
    `and facial expressions perfectly follow the provided audio reference. ` +
    `Natural head movements, expressive eyebrows, and occasional hand gestures. She holds ` +
    `${v.productDescription} casually in one hand. The lighting matches a real ${v.scene} environment. ` +
    `Her energy is ${v.vibeDescription}. Slight camera shake from being handheld. ` +
    `She speaks naturally, lip-syncing to the provided audio with accurate mouth movements.`,

  "product-showcase": (v) =>
    `A UGC-style video of ${v.personDescription} in ${v.sceneDescription}. She is excitedly showing off ` +
    `${v.productDescription} to her phone camera, holding it up and turning it to show details. ` +
    `Her lip movements and expressions follow the provided audio reference precisely. ` +
    `Camera perspective is handheld phone. ${v.vibeDescription} energy. ` +
    `Natural imperfect lighting from ${v.scene}.`,

  unboxing: (v) =>
    `An enthusiastic UGC unboxing video of ${v.personDescription} in ${v.sceneDescription}. ` +
    `She is opening a package and pulling out ${v.productDescription}. Her facial reactions and ` +
    `lip movements follow the provided audio reference exactly. ` +
    `She holds the product up close then pulls back to react. Handheld phone aesthetic.`,

  educational: (v) =>
    `A helpful tutorial-style UGC video of ${v.personDescription} in ${v.sceneDescription}. ` +
    `She speaks to camera with informative, friendly energy. Her lip movements match ` +
    `the provided audio reference. She holds ${v.productDescription} and occasionally gestures ` +
    `toward it. Phone propped on surface. Relaxed pacing.`,

  "before-after": (v) =>
    `An energetic UGC video of ${v.personDescription} in ${v.sceneDescription}. ` +
    `She moves energetically, showing off her look from different angles. Her expressions ` +
    `and lip movements follow the provided audio reference. She holds ${v.productDescription} ` +
    `and gestures excitedly. Story-style recording energy.`,

  promo: (v) =>
    `An energetic UGC video of ${v.personDescription} in ${v.sceneDescription}. ` +
    `She moves energetically, showing off her look from different angles. Her expressions ` +
    `and lip movements follow the provided audio reference. She holds ${v.productDescription} ` +
    `and gestures excitedly. Story-style recording energy.`,
};

// ── Main Exported Functions ──────────────────────────────────

/**
 * Build a Seedance video prompt for script-in-prompt mode.
 * The script text is embedded in the prompt so Seedance speaks it.
 */
export function buildSeedanceVideoPrompt(
  params: SeedancePromptParams
): string {
  const {
    campaignType,
    scriptText,
    personDescription,
    productDescription,
    scene,
    vibe,
  } = params;

  const sceneDescription = VIDEO_SCENE_MAP[scene];
  const vibeDescription = VIDEO_VIBE_MAP[vibe];

  const templateFn = SCRIPT_TEMPLATES[campaignType];
  return templateFn({
    personDescription,
    sceneDescription,
    productDescription,
    vibeDescription,
    scene,
    scriptText,
  });
}

/**
 * Build a Seedance video prompt for uploaded-audio mode.
 * The prompt instructs Seedance to lip-sync to the provided audio reference.
 * The actual audio URL is passed separately as `reference_audio_urls` in the API call.
 */
export function buildSeedanceVideoPromptWithAudio(
  params: SeedanceAudioPromptParams
): string {
  const {
    campaignType,
    personDescription,
    productDescription,
    scene,
    vibe,
  } = params;

  const sceneDescription = VIDEO_SCENE_MAP[scene];
  const vibeDescription = VIDEO_VIBE_MAP[vibe];

  const templateFn = AUDIO_TEMPLATES[campaignType];
  return templateFn({
    personDescription,
    sceneDescription,
    productDescription,
    vibeDescription,
    scene,
  });
}
