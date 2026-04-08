import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateImage } from "@/lib/gemini/generate";
import { uploadGeneratedImage } from "@/lib/supabase/storage";
import {
  buildUGCImagePrompt,
  type UGCImageParams,
  type UGCEthnicity,
  type UGCSkinTone,
  type UGCAgeRange,
  type UGCHairStyle,
  type UGCScene,
  type UGCVibe,
  type UGCLashStyle,
} from "@/lib/seedance/ugc-image-prompt";

/**
 * POST /api/seedance/generate-ugc-image
 *
 * Generate a UGC-style avatar image using the Gemini image generation
 * pipeline with the specialized UGC prompt engine.
 *
 * Returns the uploaded image URL and storage path.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const errors = validateRequest(body);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const params: UGCImageParams = {
      ethnicity: body.ethnicity as UGCEthnicity,
      skinTone: body.skinTone as UGCSkinTone,
      ageRange: body.ageRange as UGCAgeRange,
      hairStyle: body.hairStyle as UGCHairStyle,
      scene: body.scene as UGCScene,
      vibe: body.vibe as UGCVibe,
      lashStyle: body.lashStyle as UGCLashStyle,
      hasProduct: Boolean(body.hasProduct),
      productDescription: body.productDescription,
    };

    // Build the UGC-optimized prompt
    const { prompt, negativePrompt } = buildUGCImagePrompt(params);

    // Combine prompt with negative prompt for Gemini
    const fullPrompt = `${prompt}\n\n[NEGATIVE PROMPT — avoid these qualities entirely]\n${negativePrompt}`;

    // Generate image via Gemini (9:16 portrait, 1K resolution)
    const result = await generateImage(fullPrompt, "9:16", undefined, undefined, "1K");

    // Upload to Supabase Storage
    const supabase = await createAdminClient();
    const { url: imageUrl, path: storagePath } = await uploadGeneratedImage(
      supabase,
      result.buffer,
      "cocolash",
      "-ugc",
      result.mimeType
    );

    return NextResponse.json({
      imageUrl,
      storagePath,
      model: result.model,
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
const VALID_LASH_STYLES: UGCLashStyle[] = [
  "Natural flutter", "Dramatic glam", "Wispy cat-eye", "No lashes",
];

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
  if (!body.lashStyle || !VALID_LASH_STYLES.includes(body.lashStyle as UGCLashStyle)) {
    errors.push(`lashStyle must be one of: ${VALID_LASH_STYLES.join(", ")}`);
  }

  if (body.hasProduct && !body.productDescription) {
    errors.push("productDescription is required when hasProduct is true");
  }

  return errors;
}
