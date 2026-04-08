/**
 * UGC Image Prompt Builder — Test Examples
 *
 * Reference outputs for verifying the buildUGCImagePrompt() function.
 * These show expected prompt structure for different input combinations.
 *
 * Note: Imperfection details and IMG_ filenames vary per call (random),
 * so only the structure and content blocks are verified.
 */

import { buildUGCImagePrompt, type UGCImageParams } from "./ugc-image-prompt";

// ── Example 1: Excited car UGC with product ──────────────────

export const EXAMPLE_1_INPUT: UGCImageParams = {
  ethnicity: "Latina",
  skinTone: "Olive",
  ageRange: "25-34",
  hairStyle: "Wavy",
  scene: "messy-car",
  vibe: "excited-discovery",
  lashStyle: "Natural flutter",
  hasProduct: true,
  productDescription: "a pink CocoLash box",
};

/**
 * Expected output structure (imperfections and IMG_ number vary):
 *
 * Raw, unedited front-facing smartphone camera photo of a 25-34-year-old Latina woman
 * with olive skin and wavy hair.
 *
 * She is in the backseat of a slightly messy car with sunlight coming through the window.
 * Warm ambient car interior lighting with dashboard reflections, slightly overexposed window.
 *
 * Her expression is genuinely excited, mouth slightly open mid-sentence, eyes bright and wide,
 * like she just discovered something amazing she needs to share immediately.
 *
 * She is casually holding a pink CocoLash box in one hand near her chin level, grip natural
 * and relaxed, product label partially visible. The product is proportional and not the focus — she is.
 *
 * She is wearing natural flutter eyelash extensions that look natural and applied, not perfect
 * or symmetrical. One lash slightly lifted at the outer corner.
 *
 * Authentic iPhone selfie aesthetic, candid and slightly off-center framing, camera held at eye level.
 * Visible natural skin texture including pores, subtle under-eye texture, and flyaway hairs.
 * Slight natural facial asymmetry. Muted, realistic skin tones with no color grading.
 * [2-3 random imperfections].
 *
 * IMG_XXXX.HEIC
 */

// ── Example 2: Chill bathroom review without product ─────────

export const EXAMPLE_2_INPUT: UGCImageParams = {
  ethnicity: "Black",
  skinTone: "Deep",
  ageRange: "18-24",
  hairStyle: "Braids",
  scene: "bathroom-mirror",
  vibe: "chill-review",
  lashStyle: "Dramatic glam",
  hasProduct: false,
};

/**
 * Expected output structure:
 *
 * Raw, unedited front-facing smartphone camera photo of a 18-24-year-old Black woman
 * with deep skin and braids hair.
 *
 * She is in a real bathroom with visible mirror edge, toothbrush holder, and everyday
 * clutter on the counter. Harsh overhead bathroom light mixed with warm vanity light,
 * slight yellow cast.
 *
 * Her expression is calm and conversational, slight knowing smirk, relaxed eyebrows,
 * like she is casually telling a friend about something she has been using for weeks.
 *
 * She is wearing dramatic glam eyelash extensions that look natural and applied, not perfect
 * or symmetrical. One lash slightly lifted at the outer corner.
 *
 * Authentic iPhone selfie aesthetic...
 * [2-3 random imperfections].
 *
 * IMG_XXXX.HEIC
 *
 * NOTE: No product holding section since hasProduct === false.
 */

// ── Example 3: Surprised vanity desk with no lashes ──────────

export const EXAMPLE_3_INPUT: UGCImageParams = {
  ethnicity: "East Asian",
  skinTone: "Light",
  ageRange: "35-44",
  hairStyle: "Straight long",
  scene: "vanity-desk",
  vibe: "surprised",
  lashStyle: "No lashes",
  hasProduct: true,
  productDescription: "a gold CocoLash tube",
};

/**
 * Expected output structure:
 *
 * Raw, unedited front-facing smartphone camera photo of a 35-44-year-old East Asian woman
 * with light skin and straight long hair.
 *
 * She is in a vanity desk with a small mirror, makeup products scattered casually,
 * warm-toned room. Warm vanity light from the mirror, soft and slightly flat lighting on face.
 *
 * Her expression shows genuine surprise, eyebrows up, mouth in a small O shape,
 * like she just read the ingredients label and cannot believe what she is seeing.
 *
 * She is casually holding a gold CocoLash tube in one hand near her chin level, grip natural
 * and relaxed, product label partially visible. The product is proportional and not the focus — she is.
 *
 * Her lashes are natural with no extensions, bare and minimal.
 *
 * Authentic iPhone selfie aesthetic...
 * [2-3 random imperfections].
 *
 * IMG_XXXX.HEIC
 *
 * NOTE: lashStyle "No lashes" produces bare lash description instead of extensions.
 */

// ── Verification Runner ──────────────────────────────────────

export function runExampleVerification(): void {
  const examples = [
    { name: "Example 1: Excited car UGC", input: EXAMPLE_1_INPUT },
    { name: "Example 2: Chill bathroom review", input: EXAMPLE_2_INPUT },
    { name: "Example 3: Surprised vanity desk", input: EXAMPLE_3_INPUT },
  ];

  for (const { name, input } of examples) {
    const result = buildUGCImagePrompt(input);

    console.log(`\n=== ${name} ===`);
    console.log("\nPrompt:\n", result.prompt);
    console.log("\nNegative Prompt:\n", result.negativePrompt);
    console.log("\n---");

    // Basic assertions
    const p = result.prompt;
    if (!p.includes(input.ageRange)) throw new Error(`Missing ageRange in ${name}`);
    if (!p.includes(input.ethnicity)) throw new Error(`Missing ethnicity in ${name}`);
    if (!p.includes("IMG_")) throw new Error(`Missing IMG_ filename in ${name}`);
    if (!p.includes(".HEIC")) throw new Error(`Missing .HEIC extension in ${name}`);
    if (!result.negativePrompt.includes("CGI")) throw new Error(`Missing negative prompt in ${name}`);

    if (input.hasProduct && input.productDescription) {
      if (!p.includes(input.productDescription)) {
        throw new Error(`Missing product description in ${name}`);
      }
    }

    if (input.lashStyle === "No lashes") {
      if (!p.includes("natural with no extensions")) {
        throw new Error(`Missing no-lash detail in ${name}`);
      }
    } else {
      if (!p.includes(input.lashStyle.toLowerCase())) {
        throw new Error(`Missing lash style in ${name}`);
      }
    }

    console.log(`✅ ${name} passed`);
  }
}
