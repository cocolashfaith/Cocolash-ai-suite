/**
 * Before/After Category Template (M2)
 *
 * Two-stage sequential generation:
 *   Stage 1: Generate "before" image (natural sparse lashes, bare eyes)
 *   Stage 2: Pass "before" as REFERENCE IMAGE to Gemini and generate "after"
 *            (same woman + stunning CocoLash extensions)
 *
 * The reference-passing approach ensures Gemini maintains the EXACT same face,
 * angle, skin tone, lighting, and setting — the only change is the lashes.
 */
import type { GenerationSelections, SkinTone, HairStyle } from "@/lib/types";
import { getSkinToneDescriptor } from "../modules/skin-tones";
import { getLashStyleDescriptor } from "../modules/lash-styles";
import { getHairStyleDescriptor } from "../modules/hair-styles";

export interface BeforeAfterPrompts {
  beforePrompt: string;
  /** The "after" prompt — designed to be used WITH the "before" image as a reference */
  afterPrompt: string;
  /** The instruction text sent alongside the reference image to Gemini */
  afterReferenceInstruction: string;
}

/**
 * Builds two prompts:
 *   - "before": standalone prompt for the bare-lash image
 *   - "after": prompt that assumes the "before" image is attached as a reference
 */
export function buildBeforeAfterPrompts(
  selections: GenerationSelections,
  resolvedSkinTone: Exclude<SkinTone, "random">,
  resolvedHairStyle: Exclude<HairStyle, "random">
): BeforeAfterPrompts {
  const skinDesc = getSkinToneDescriptor(resolvedSkinTone);
  const hairDesc = getHairStyleDescriptor(resolvedHairStyle);
  const lashDesc = getLashStyleDescriptor(selections.lashStyle);

  // ── Stage 1: BEFORE prompt (standalone, no reference needed) ──

  const beforePrompt = `CATEGORY: BEFORE/AFTER LASH TRANSFORMATION — "BEFORE" IMAGE

Generate a single, ultra-close beauty portrait of a beautiful African American woman.

SUBJECT: ${skinDesc}. ${hairDesc}.
Age: mid-20s to early 30s. Flawless makeup base — warm-toned foundation perfectly matched to skin,
subtle contour, warm bronzer, well-shaped brows filled in naturally.

SETTING: Professional beauty studio, clean neutral background in soft warm beige/pink tones.
CAMERA: 85mm f/1.2 equivalent, close-up framing showing both eyes, nose, and forehead.
Both eyes fully visible, looking directly at camera with a soft, confident gaze.
LIGHTING: Butterfly lighting from above, warm 3800K, soft diffused, creating gentle shadows
that define the brow bone and cheekbones. Catchlight visible in both eyes.

LASHES (BEFORE STATE — NO EXTENSIONS):
- Natural, sparse eyelashes — the woman's own lashes without any extensions
- Short, thin, barely visible natural lashes
- No mascara, no lash enhancement — completely bare lashes
- The eyes look beautiful but the lashes are clearly minimal/underwhelming

EYE MAKEUP: Minimal — just a hint of warm eyeshadow, NO eyeliner, NO mascara.
The focus is on showing the "bare" look before lash transformation.

CRITICAL: Generate ONE clean portrait photo. Do NOT create a split-screen, side-by-side,
or collage image. Do NOT add any text, labels, or "before/after" annotations.
This must be a single, standalone portrait photograph.${selections.contextNote ? `\n\nCONTEXT NOTE: ${selections.contextNote}` : ""}`;

  // ── Stage 2: AFTER prompt (used WITH the before image as reference) ──

  const afterReferenceInstruction = `[BEFORE IMAGE REFERENCE — Study this image carefully]
The image below is the "BEFORE" photo from a lash transformation shoot.
You MUST generate a new image of this EXACT SAME WOMAN with the following preserved IDENTICALLY:
- Same face, same facial features, same skin tone
- Same face angle, same head tilt, same camera distance and framing
- Same background, same lighting setup
- Same hair style and positioning
- Same facial expression (soft confident smile)
The ONLY thing that should change is the LASHES and eye makeup as described in the prompt below.`;

  const afterPrompt = `CATEGORY: BEFORE/AFTER LASH TRANSFORMATION — "AFTER" IMAGE

Using the reference "BEFORE" image provided above, generate the "AFTER" transformation photo.
This must be the EXACT SAME WOMAN, same angle, same pose, same everything — with ONLY the
lashes and eye makeup changed.

LASHES (AFTER STATE — COCOLASH TRANSFORMATION):
- Stunning, luxurious ${lashDesc} lash extensions now applied
- Each individual lash fiber is visible — fluffy, perfectly curled, meticulously applied
- The lashes dramatically frame the eyes, adding depth, volume, and allure
- The transformation is STRIKING — same face, but the lashes elevate the entire look
- The lashes should be the clear HERO of the image

EYE MAKEUP (UPGRADED):
- Full eye makeup that complements the new lashes
- Warm smoky eyeshadow blended beautifully
- Thin brown eyeliner that enhances the lash line
- The lashes complete the entire look — jaw-dropping difference from the "before"

CONSISTENCY REQUIREMENTS (NON-NEGOTIABLE):
- SAME face shape, features, skin tone, and skin texture as the reference image
- SAME camera angle, distance, and framing as the reference image
- SAME background color and lighting setup as the reference image
- SAME hair style and positioning as the reference image
- SAME facial expression as the reference image
- The viewer must immediately recognize this is the SAME person

CRITICAL: Generate ONE clean portrait photo. Do NOT create a split-screen, side-by-side,
or collage image. Do NOT add any text, labels, or "before/after" annotations.
This must be a single, standalone portrait photograph matching the reference.${selections.contextNote ? `\n\nCONTEXT NOTE: ${selections.contextNote}` : ""}`;

  return { beforePrompt, afterPrompt, afterReferenceInstruction };
}
