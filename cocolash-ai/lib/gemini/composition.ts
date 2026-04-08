/**
 * Person + Product Image Composition
 *
 * Uses the existing Gemini integration to compose a person image with a
 * CocoLash product image. The result is a realistic photo of the person
 * holding/applying/presenting the product — used as the avatar input
 * for HeyGen video generation.
 *
 * Architecture: Leverages the same Gemini 3 Pro model used for all
 * CocoLash image generation, ensuring visual consistency across the
 * content ecosystem. Reference images (person + product) are passed
 * via Gemini's multimodal input.
 */

import { generateImage, type ReferenceImage } from "./generate";
import { createAdminClient } from "@/lib/supabase/server";
import { uploadGeneratedImage } from "@/lib/supabase/storage";
import type { AspectRatio, CompositionPose } from "@/lib/types";

// ── Pose-Specific Prompts ────────────────────────────────────

const POSE_PROMPTS: Record<CompositionPose, string> = {
  holding: `The EXACT same woman from IMAGE 1, in the EXACT same setting and background, now elegantly holding the exact lash product box shown in IMAGE 2. 
Natural, relaxed grip in her right hand, product held at chest level with the brand label clearly visible to camera. Her fingers wrap around the product naturally — not stiff, not posed, just like someone casually showing a friend what she bought.
She looks directly at camera with a warm, genuine smile. Her body is angled slightly (not perfectly squared to camera) for a natural feel.
Medium shot from waist up. The product is important but secondary to her expression and energy.
Keep the EXACT same lighting, skin tone, environment, and background as the original person photo. Do NOT alter her appearance in any way.`,

  applying: `The EXACT same woman from IMAGE 1, in the EXACT same setting and background, now applying false lashes from the exact product shown in IMAGE 2. 
She holds a single lash strip delicately between her thumb and index finger, positioned near her outer eye corner, with her other hand gently pulling her eyelid taut. A small handheld mirror or compact is nearby or held in her other hand.
Beauty tutorial aesthetic — close enough to see the lash fibers and the precision of her placement. Her eyes are looking slightly downward into the mirror.
Her expression is focused yet relaxed and confident, as if filming a how-to video she's done a hundred times.
Keep the EXACT same lighting, skin tone, and background as the original person photo. Do NOT alter her appearance in any way.`,

  selfie: `The EXACT same woman from IMAGE 1, in the EXACT same setting and background, now taking a selfie-style photo while holding the exact lash product shown in IMAGE 2.
Smartphone-camera perspective, slightly above eye level, with a subtle wide-angle distortion. She holds the product box near her chin/jaw with one hand, brand label angled toward camera.
Social media UGC aesthetic — natural, authentic, relatable, slightly off-center framing. The kind of candid selfie you'd scroll past on Instagram and double-tap.
Genuine excited expression — eyes bright, slight smile or open-mouth joy. Not a forced model pose.
Keep the EXACT same lighting, skin tone, environment, and background as the original person photo. Do NOT alter her appearance in any way.`,

  testimonial: `The EXACT same woman from IMAGE 1, in the EXACT same setting and background, now holding the exact lash product shown in IMAGE 2 at chest level.
Testimonial video still — as if she's mid-sentence, talking directly to camera about why she loves this product. Her body language is open and inviting.
Product held steady with both hands or cradled in one palm, label facing forward but not perfectly centered — natural, not staged.
Her expression is genuine, trustworthy, and conversational — slightly raised eyebrows, warm eyes, as if sharing a recommendation with a close friend.
Upper body framing, like a well-framed UGC review video on TikTok or YouTube Shorts.
Keep the EXACT same lighting, skin tone, environment, and background as the original person photo. Do NOT alter her appearance in any way.`,
};

// ── Composition Instruction ──────────────────────────────────

const COMPOSITION_INSTRUCTION = `[PERSON + PRODUCT COMPOSITION — 2 reference images provided]

IMAGE 1 (Person): This is the EXACT person to feature. You MUST preserve:
- Her exact face, facial features, bone structure, and expression
- Her exact skin tone, texture, and complexion — NO modifications
- Her exact hair style, color, and texture
- Her overall appearance and body proportions
- The EXACT background, setting, and environment from this image

IMAGE 2 (Product): This is the EXACT product to include. You MUST preserve:
- The exact product packaging, colors, and branding
- The exact shape, size, and proportions of the product
- All visible text, labels, and design elements on the product

CRITICAL RULES:
- Do NOT alter, lighten, darken, or modify the person's skin tone in ANY way
- Do NOT change the person's facial features, hair, or expression
- Do NOT modify the product's appearance, colors, or branding
- The composition must look like a real photograph, not a collage or overlay
- Natural hand positioning — fingers wrap around the product realistically
- Lighting must be consistent between person and product
- PRESERVE the EXACT background from IMAGE 1 — do NOT change, replace, simplify, or modify the background in ANY way
- The final image must look like the person was photographed in their original setting, just now holding the product
- Do NOT use a solid color, gradient, or studio background unless IMAGE 1 already has one`;

// ── Negative Prompt for Composition ──────────────────────────

const COMPOSITION_NEGATIVE = `ABSOLUTELY NO TEXT, WRITING, OR TYPOGRAPHY IN THE IMAGE.
Do NOT add any brand names, watermarks, labels, or text overlays.
Do NOT modify the person's skin tone, features, or appearance.
Do NOT alter the product packaging or branding.
Do NOT change, replace, or modify the background from the original person image.
AVOID: illustration, cartoon, 3d render, collage effect, cut-and-paste look, 
unnatural hand positioning, floating product, mismatched lighting, 
plastic skin, airbrushed, cool blue lighting, aggressive expression,
different background, studio background replacement, solid color background.`;

// ── Main Composition Function ────────────────────────────────

export interface ComposeParams {
  personImageUrl: string;
  productImageUrl: string;
  pose: CompositionPose;
  brandId: string;
  /** Output aspect ratio (defaults to 4:5 for legacy studio compositions). */
  outputAspectRatio?: AspectRatio;
}

export interface ComposeResult {
  composedImageUrl: string;
  storagePath: string;
}

/**
 * Composes a person image with a product image using Gemini.
 *
 * Downloads both reference images, passes them to Gemini with a
 * pose-specific composition prompt, then uploads the result to
 * Supabase Storage.
 *
 * @returns URL and storage path of the composed image
 * @throws Error on download failure, Gemini error, or upload failure
 */
export async function composePersonWithProduct(
  params: ComposeParams
): Promise<ComposeResult> {
  const { personImageUrl, productImageUrl, pose, brandId, outputAspectRatio = "4:5" } =
    params;

  const [personRef, productRef] = await Promise.all([
    downloadAsReference(personImageUrl),
    downloadAsReference(productImageUrl),
  ]);

  const posePrompt = POSE_PROMPTS[pose];

  const fullPrompt = `${posePrompt}

${COMPOSITION_NEGATIVE}`;

  const referenceImages: ReferenceImage[] = [personRef, productRef];

  const result = await generateImage(
    fullPrompt,
    outputAspectRatio,
    referenceImages,
    COMPOSITION_INSTRUCTION,
    "1K"
  );

  const supabase = await createAdminClient();
  const { url, path } = await uploadGeneratedImage(
    supabase,
    result.buffer,
    brandId,
    "-composed",
    result.mimeType
  );

  return {
    composedImageUrl: url,
    storagePath: path,
  };
}

// ── Helper: Download Image as Reference ──────────────────────

async function downloadAsReference(imageUrl: string): Promise<ReferenceImage> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download reference image (${response.status}): ${imageUrl.substring(0, 100)}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") || "image/jpeg";

  const base64Data = buffer.toString("base64");

  return {
    base64Data,
    mimeType: contentType,
  };
}
