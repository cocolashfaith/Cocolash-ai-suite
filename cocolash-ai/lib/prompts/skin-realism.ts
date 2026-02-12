/**
 * CocoLash Skin Realism DNA Block
 *
 * Injected into every human-featuring generation (lifestyle, lash-closeup)
 * to ensure hyper-realistic African-American skin rendering.
 *
 * Skipped for product-only shots where no human skin is visible.
 */

export const DEFAULT_SKIN_REALISM_PROMPT = `[SKIN REALISM DIRECTIVE — ABSOLUTE PRIORITY]
Hyper-realistic African-American skin with rich melanin pigmentation evenly distributed,
subtle natural tonal variations for depth and authenticity. Visible skin pores and fine
texture details including tiny imperfections and micro-bumps for a lifelike feel. NO smooth,
plastic, or doll-like appearance whatsoever.

Subdermal vascularity: faint veins visible under the skin for added realism. Capillary
visibility on cheeks and nose to mimic natural blood flow. Vellus hair softly present on
skin surface, especially on arms and face.

Melanin variance: gentle shifts in tone across the body — warmer highlights on cheekbones,
forehead, and bridge of nose; cooler shadows in creases, under the jaw, and inner arms.

Subsurface scattering: light gently bouncing under the skin for a natural inner glow,
without harsh reflections or artificial luminosity.

Natural oil sheen on forehead and nose for a hydrated satin finish — not greasy or overly
shiny. Subtle lip texture with natural moisture. Iris striations in the eyes for sharp
detail that complements the skin realism.

Soft diffused cinematic lighting that wraps around the skin to highlight textures and avoid
flat or washed-out dark tones. RAW photo style, 8K ultra-high resolution, fine grain in
shadows for professional editorial quality.

FORBIDDEN: airbrushing, over-smoothing, plastic skin, wax-figure appearance, flat matte
skin, grey or ashy undertones, AI skin artifacts, uncanny valley texture.`;

/**
 * Returns the Skin Realism block, optionally overridden with a custom one
 * from the database (if the user has edited it in Settings).
 */
export function getSkinRealismDNA(customPrompt?: string | null): string {
  return customPrompt?.trim() || DEFAULT_SKIN_REALISM_PROMPT;
}
