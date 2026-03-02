/**
 * CocoLash Negative Prompt Constants
 *
 * Appended to every Gemini call to explicitly exclude unwanted
 * visual elements, styles, and artifacts.
 */

export const DEFAULT_NEGATIVE_PROMPT = `ABSOLUTELY NO TEXT OR WRITING IN THE IMAGE. This is critical:
- Do NOT render any letters, words, logos, brand names, watermarks, or typography anywhere in the image
- Do NOT write "CocoLash", "COCOLASH", "CL", or ANY text at all — not even faintly or partially
- Do NOT add any semi-transparent overlays, text boxes, badges, labels, or UI elements
- The image must contain ZERO readable characters — branding is composited separately in post-processing
- If you feel tempted to add a watermark or brand name, DO NOT — leave the image completely clean

OTHER EXCLUSIONS: illustration, 3d render, cartoon, anime, plastic skin, airbrushed, blurry, blue lighting, cool tones, disfigured eyes, double iris, messy makeup, clumpy lashes, aggressive expression, stock photo feel`;

/**
 * Safety-appended negative terms for lifestyle/editorial shots.
 * Added automatically to reduce safety filter blocks.
 */
export const SAFETY_NEGATIVE_APPEND =
  "nudity, revealing clothing, suggestive poses, inappropriate content";

/**
 * Returns the negative prompt, optionally overridden with a custom one
 * from the database (if the user has edited it in Settings).
 */
export function getNegativePrompt(customNegative?: string | null): string {
  return customNegative?.trim() || DEFAULT_NEGATIVE_PROMPT;
}

/**
 * Combines the base negative prompt with safety terms for lifestyle shots.
 */
export function getSafeNegativePrompt(customNegative?: string | null): string {
  const base = getNegativePrompt(customNegative);
  return `${base}, ${SAFETY_NEGATIVE_APPEND}`;
}
