import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient, getCurrentUserId } from "@/lib/supabase/server";
import { generateImage, type ReferenceImage } from "@/lib/gemini/generate";
import { uploadGeneratedImage } from "@/lib/supabase/storage";
import {
  buildMinimalSelectionsForVideoAsset,
  getDefaultBrandId,
  insertVideoGalleryAsset,
  videoAspectToImageAspect,
} from "@/lib/video/insert-gallery-asset";
import {
  buildUGCImagePrompt,
  type UGCImageParams,
  type UGCEthnicity,
  type UGCSkinTone,
  type UGCAgeRange,
  type UGCHairStyle,
  type UGCScene,
  type UGCVibe,
} from "@/lib/seedance/ugc-image-prompt";
import type { LashStyle, VideoAspectRatio } from "@/lib/types";

/**
 * POST /api/seedance/generate-ugc-image
 *
 * Generate a UGC-style avatar image using Gemini + UGC prompt engine.
 * Persists to gallery with tag `ugc-avatar`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const errors = validateRequest(body);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const aspectRatio = (body.aspectRatio as VideoAspectRatio) ?? "9:16";
    const imageAspect = videoAspectToImageAspect(aspectRatio);

    const params: UGCImageParams = {
      ethnicity: body.ethnicity as UGCEthnicity,
      skinTone: body.skinTone as UGCSkinTone,
      ageRange: body.ageRange as UGCAgeRange,
      hairStyle: body.hairStyle as UGCHairStyle,
      scene: body.scene as UGCScene,
      vibe: body.vibe as UGCVibe,
      lashStyle: body.lashStyle as LashStyle,
      hasProduct: Boolean(body.hasProduct),
      productDescription: body.productDescription,
    };

    const { prompt, negativePrompt } = buildUGCImagePrompt(params);

    // v4.1 — when the user has selected a productImageUrl AND toggled
    // "Show holding product", we ask Gemini to compose the avatar already
    // holding the product. This produces ONE image instead of two separate
    // images (the BROKEN-04 fix from the audit) AND moves composition to
    // gen-time so the user only generates one image, not two.
    const productImageUrl: string | undefined =
      typeof body.productImageUrl === "string" && body.productImageUrl
        ? body.productImageUrl
        : undefined;

    let fullPrompt: string;
    let referenceImages: ReferenceImage[] | undefined;
    let referenceInstruction: string | undefined;

    if (productImageUrl) {
      // Download the product image to pass as a reference to Gemini.
      const productResp = await fetch(productImageUrl);
      if (!productResp.ok) {
        return NextResponse.json(
          { error: `Failed to fetch product image (${productResp.status})` },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await productResp.arrayBuffer());
      const productRef: ReferenceImage = {
        base64Data: buf.toString("base64"),
        mimeType: productResp.headers.get("content-type") || "image/png",
      };
      referenceImages = [productRef];
      referenceInstruction = `[PRODUCT INTEGRATION — 1 reference image provided]
The reference image is the EXACT product the creator must be holding. Preserve:
- The exact product packaging, colors, branding, label text, and proportions
- Orientation: the product's FRONT face — the one with the main brand lettering — faces the camera squarely and upright, so the lettering reads correctly left-to-right, exactly as printed in the reference
- Natural hand positioning — fingers wrap around the product realistically without covering the brand lettering
- Lighting consistent with the bedroom / scene
DO NOT alter the product. Integrate it naturally into the creator's hand or close to her face. The product should be clearly visible to camera.`;
      // Orientation is the #1 compose failure mode (label away from camera,
      // tilted, or mirrored) — say it positively in the prompt AND list the
      // failure modes in the image negative prompt (image models honour
      // negatives; this never reaches the video prompt).
      const composeNegatives =
        "mirrored or reversed brand lettering, upside-down packaging, back of the packaging to camera, label turned away from camera, product tilted so the text is unreadable, fingers covering the brand name";
      fullPrompt =
        `${prompt}\n\nThe creator is naturally holding the product shown in the reference image — at chest level, in one hand, the FRONT label facing the camera squarely, upright and fully readable. Treat this composition as if it's the same UGC photograph already framed; the product should look like it was naturally part of the scene.\n\n[NEGATIVE PROMPT — avoid these qualities entirely]\n${negativePrompt}, ${composeNegatives}`;
    } else {
      fullPrompt = `${prompt}\n\n[NEGATIVE PROMPT — avoid these qualities entirely]\n${negativePrompt}`;
    }

    // F10 (docs/seedance-2.5/06-QUALITY-PASS.md): 2K, not 1K. This image is
    // the identity reference Seedance conditions every frame on — the extra
    // pixels are where lash fibres, pores and brand text survive the render.
    const result = await generateImage(
      fullPrompt,
      imageAspect,
      referenceImages,
      referenceInstruction,
      "2K"
    );

    const supabase = await createAdminClient();
    const { url: imageUrl, path: storagePath } = await uploadGeneratedImage(
      supabase,
      result.buffer,
      "cocolash",
      "-ugc",
      result.mimeType
    );

    const userSupabase = await createClient();
    const userId = await getCurrentUserId(userSupabase);
    const brandId = await getDefaultBrandId(supabase);

    let galleryImageId: string | undefined;
    if (brandId) {
      const selections = buildMinimalSelectionsForVideoAsset({
        aspectRatio: imageAspect,
        lashStyle: params.lashStyle,
        heygenAsset: { kind: "ugc-avatar" },
      });
      const inserted = await insertVideoGalleryAsset({
        supabase,
        userId,
        brandId,
        imageUrl,
        storagePath,
        aspectRatio: imageAspect,
        promptUsed: fullPrompt.slice(0, 8000),
        selections,
        // Composed shots carry a second tag so the wizard's gallery can mark
        // them "holding product" and restore the composed flag in a later
        // session.
        tags: productImageUrl
          ? ["ugc-avatar", "ugc-avatar-composed"]
          : ["ugc-avatar"],
        geminiModel: result.model,
      });
      galleryImageId = inserted?.id;
    }

    return NextResponse.json({
      imageUrl,
      storagePath,
      model: result.model,
      galleryImageId,
    });
  } catch (error: unknown) {
    console.error("[seedance/generate-ugc-image] Error:", error);
    const message =
      error instanceof Error ? error.message : "UGC image generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const VALID_ETHNICITIES: UGCEthnicity[] = [
  "Caucasian", "Black", "Latina", "South Asian",
  "East Asian", "Middle Eastern", "Mixed",
];
const VALID_SKIN_TONES: UGCSkinTone[] = [
  "Light", "Medium", "Olive", "Tan", "Dark", "Deep",
];
const VALID_AGE_RANGES: UGCAgeRange[] = ["18-24", "25-34", "35-44", "45+"];
const VALID_HAIR_STYLES: UGCHairStyle[] = [
  "Straight long", "Straight short", "Wavy", "Curly", "Braids", "Bun", "Ponytail",
];
const VALID_SCENES: UGCScene[] = [
  "messy-car", "bathroom-mirror", "casual-bedroom", "kitchen-counter",
  "sunny-sidewalk", "couch", "vanity-desk", "gym-locker",
];
const VALID_VIBES: UGCVibe[] = [
  "excited-discovery", "chill-review", "ranting",
  "whispering-asmr", "surprised", "casual-unboxing",
];
const VALID_LASH_STYLES: LashStyle[] = [
  "natural", "volume", "dramatic", "cat-eye",
  "wispy", "doll-eye", "hybrid", "mega-volume",
];
const VALID_ASPECT_RATIOS: VideoAspectRatio[] = ["9:16", "1:1", "16:9"];

function validateRequest(body: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!body.ethnicity || !VALID_ETHNICITIES.includes(body.ethnicity as UGCEthnicity)) {
    errors.push(`ethnicity must be one of: ${VALID_ETHNICITIES.join(", ")}`);
  }
  if (!body.skinTone || !VALID_SKIN_TONES.includes(body.skinTone as UGCSkinTone)) {
    errors.push(`skinTone must be one of: ${VALID_SKIN_TONES.join(", ")}`);
  }
  if (!body.ageRange || !VALID_AGE_RANGES.includes(body.ageRange as UGCAgeRange)) {
    errors.push(`ageRange must be one of: ${VALID_AGE_RANGES.join(", ")}`);
  }
  if (!body.hairStyle || !VALID_HAIR_STYLES.includes(body.hairStyle as UGCHairStyle)) {
    errors.push(`hairStyle must be one of: ${VALID_HAIR_STYLES.join(", ")}`);
  }
  if (!body.scene || !VALID_SCENES.includes(body.scene as UGCScene)) {
    errors.push(`scene must be one of: ${VALID_SCENES.join(", ")}`);
  }
  if (!body.vibe || !VALID_VIBES.includes(body.vibe as UGCVibe)) {
    errors.push(`vibe must be one of: ${VALID_VIBES.join(", ")}`);
  }
  if (!body.lashStyle || !VALID_LASH_STYLES.includes(body.lashStyle as LashStyle)) {
    errors.push(`lashStyle must be one of: ${VALID_LASH_STYLES.join(", ")}`);
  }

  if (body.aspectRatio && !VALID_ASPECT_RATIOS.includes(body.aspectRatio as VideoAspectRatio)) {
    errors.push(`aspectRatio must be one of: ${VALID_ASPECT_RATIOS.join(", ")}`);
  }

  if (body.hasProduct && !body.productDescription) {
    errors.push("productDescription is required when hasProduct is true");
  }

  return errors;
}
