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
import type { CompositionPose } from "@/lib/types";

// ── Pose-Specific Prompts ────────────────────────────────────

const POSE_PROMPTS: Record<CompositionPose, string> = {
  holding: `A confident woman elegantly holding the exact lash product box shown in the reference image. 
Natural grip in her right hand, product held at chest level with the brand label clearly visible to camera. 
Product placement is organic — not forced or stiff. She looks directly at camera with a warm, genuine smile.
Medium shot from waist up, professional product photography lighting, warm golden tones.`,

  applying: `A woman applying false lashes from the exact product shown in the reference image. 
She holds a lash strip delicately between her fingertips near her eye, with a small handheld mirror nearby.
Beauty tutorial aesthetic — close enough to see the lash details. Soft focus background.
Her expression is focused yet relaxed, as if filming a how-to video. Warm vanity lighting.`,

  selfie: `A woman taking a selfie-style photo while holding the exact lash product shown in the reference image.
Phone-camera perspective, slightly above eye level. She holds the product box near her face with one hand.
Social media UGC style — natural, authentic, relatable. Bright but warm lighting.
Genuine excited expression, as if sharing a new beauty find with followers.`,

  testimonial: `A woman looking directly at camera, holding the exact lash product shown in the reference image at chest level.
Testimonial video still — as if she's about to speak to camera about the product.
Product held steady with both hands or cradled in one palm, label facing forward.
Genuine, trustworthy expression. Clean background, professional but approachable lighting.
Upper body framing, as if for a UGC review video.`,
};

// ── Composition Instruction ──────────────────────────────────

const COMPOSITION_INSTRUCTION = `[PERSON + PRODUCT COMPOSITION — 2 reference images provided]

IMAGE 1 (Person): This is the EXACT person to feature. You MUST preserve:
- Her exact face, facial features, bone structure, and expression
- Her exact skin tone, texture, and complexion — NO modifications
- Her exact hair style, color, and texture
- Her overall appearance and body proportions

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
- Background should be simple and clean (soft gradient or neutral)`;

// ── Negative Prompt for Composition ──────────────────────────

const COMPOSITION_NEGATIVE = `ABSOLUTELY NO TEXT, WRITING, OR TYPOGRAPHY IN THE IMAGE.
Do NOT add any brand names, watermarks, labels, or text overlays.
Do NOT modify the person's skin tone, features, or appearance.
Do NOT alter the product packaging or branding.
AVOID: illustration, cartoon, 3d render, collage effect, cut-and-paste look, 
unnatural hand positioning, floating product, mismatched lighting, 
plastic skin, airbrushed, cool blue lighting, aggressive expression.`;

// ── Main Composition Function ────────────────────────────────

export interface ComposeParams {
  personImageUrl: string;
  productImageUrl: string;
  pose: CompositionPose;
  brandId: string;
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
  const { personImageUrl, productImageUrl, pose, brandId } = params;

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
    "4:5",
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
