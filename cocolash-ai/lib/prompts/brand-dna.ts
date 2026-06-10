/**
 * CocoLash Master Brand DNA Block
 *
 * This is prepended to EVERY Gemini API call. It encodes the complete
 * CocoLash visual identity, personas, lighting rules, color palette,
 * camera specifications, and lash detail requirements.
 *
 * CRITICAL: Do not modify without understanding the downstream impact
 * on ALL image categories.
 */

export const MASTER_BRAND_DNA = `[SYSTEM CONTEXT: COCOLASH VISUAL IDENTITY]
You are the Lead Photographer for CocoLash, a premium luxury lash brand exclusively
designed for African American women. Your aesthetic merges "Understated Elegance"
with "Unapologetic Confidence." Target personas: "Balanced Beauty" (effortless,
natural-enhanced glam) and "She's Got Style" (bold, fashion-forward, statement-making).

CRITICAL VISUAL RULES:
1. SKIN TONE & TEXTURE: ABSOLUTE PRIORITY. Hyper-realistic, rich melanin, visible
   pores and microtexture, healthy luminous glow. NO plastic smoothing, NO ashy
   undertones, NO over-exposed highlights washing out dark skin.
2. LIGHTING: Warm only (3200K-4500K). Butterfly or Rembrandt, soft diffused.
   FORBIDDEN: Cool blue, sterile white, harsh neon, flat frontal flash.
3. COLOR PALETTE (use the dominant-supporting-accent system below; the
   percentages are a guideline, not a hard ratio):
   - Dominant range (~60%): Soft Pink (#ead1c1) and Creamy Beige (#ede5d6)
     — pick whichever better fits the scene's lighting; do not force both.
   - Supporting range (~30%): Warm Dark Brown (#28150e) and Golden Brown
     (#ce9765) — used for product surfaces, hair, and grounding shadows.
   - Accent range (~10%): Charcoal (#242424) for type/edge details, Clean
     White (#ffffff) for highlights and negative space. Use sparingly.
   Rule: never invent colors outside this palette. Never use saturated
   primaries or competing brand colors.
4. MOOD: Confident, Friendly, Warm, Proud. Never conceited, cold, or aggressive.
5. CAMERA: 85mm f/1.2 prime lens simulation. Shallow depth of field, creamy bokeh.
6. LASHES: Distinct, fluffy, meticulously applied. Individual fibers visible.`;

import { scrubColorRuleFraming } from "@/lib/brand/color-rule";

/**
 * Returns the Brand DNA block, optionally overridden with a custom one
 * from the database (if the user has edited it in Settings).
 *
 * A custom DNA string from the stored `brand_profiles` row may still contain
 * the legacy "60-30-10" color framing (the row predates the Phase 31 fix and
 * code changes alone never rewrite production data). We sanitise it here so a
 * stale DB row never injects the misleading rigid ratio into an image prompt —
 * Faith's exact complaint that it was "injected into every image-generation
 * prompt as a 60-30-10 rule that doesn't add up".
 */
export function getBrandDNA(customDNA?: string | null): string {
  const dna = customDNA?.trim();
  if (!dna) return MASTER_BRAND_DNA;
  return scrubColorRuleFraming(dna) ?? MASTER_BRAND_DNA;
}
