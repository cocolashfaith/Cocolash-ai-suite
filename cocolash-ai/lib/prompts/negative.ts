/**
 * CocoLash Negative Prompt Constants
 *
 * Appended to every Gemini call to explicitly exclude unwanted
 * visual elements, styles, and artifacts.
 */

export const DEFAULT_NEGATIVE_PROMPT = `illustration, 3d render, cartoon, anime, plastic skin, airbrushed, blurry, blue lighting, cool tones, disfigured eyes, double iris, messy makeup, clumpy lashes, aggressive expression, stock photo feel, watermark, text overlay, logo text, no text in image, no typography, no lettering, no brand names rendered in image, no watermarks, no embedded logos, no words, no captions, no signatures`;

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
