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
  buildStudioAvatarPrompt,
  type StudioAvatarParams,
  type StudioScene,
  type StudioOutfit,
  type StudioFraming,
  type StudioExpression,
  STUDIO_SCENE_OPTIONS,
  STUDIO_OUTFIT_OPTIONS,
  STUDIO_FRAMING_OPTIONS,
  STUDIO_EXPRESSION_OPTIONS,
} from "@/lib/heygen/studio-avatar-prompt";
import type {
  UGCEthnicity,
  UGCSkinTone,
  UGCAgeRange,
  UGCHairStyle,
} from "@/lib/seedance/ugc-image-prompt";
import type { LashStyle, VideoAspectRatio } from "@/lib/types";
import { getProductTruthBySku, type ProductTruthEntry } from "@/lib/brand/product-truth";
import { getProductReferenceImagesByCategoryKey } from "@/lib/brand/get-product-references";

/**
 * POST /api/heygen/generate-studio-avatar
 *
 * Generate a professional studio-style avatar image for the
 * Brand Content Studio (HeyGen pipeline). Tags output `studio-avatar`.
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

    const params: StudioAvatarParams = {
      ethnicity: body.ethnicity as UGCEthnicity,
      skinTone: body.skinTone as UGCSkinTone,
      ageRange: body.ageRange as UGCAgeRange,
      hairStyle: body.hairStyle as UGCHairStyle,
      scene: body.scene as StudioScene,
      outfit: body.outfit as StudioOutfit,
      framing: body.framing as StudioFraming,
      expression: body.expression as StudioExpression,
      lashStyle: body.lashStyle as LashStyle,
      customPrompt: body.customPrompt,
    };

    // Initialize product-truth, reference images, and degraded flag
    let productTruth: ProductTruthEntry | undefined;
    let referenceImages: ReferenceImage[] = [];
    let degraded = false;
    let degradedMessage: string | undefined;

    // SKU resolution and reference image fetching (D-01, D-03, D-05, D-06)
    const productSku = body.productSku as string | undefined;
    if (productSku) {
      try {
        // Resolve SKU to product-truth
        const truthEntry = getProductTruthBySku(productSku);
        if (truthEntry && truthEntry.categoryKey) {
          productTruth = truthEntry;

          // Fetch reference images for this category
          const supabaseAdmin = await createAdminClient();
          const urls = await getProductReferenceImagesByCategoryKey(
            supabaseAdmin,
            truthEntry.categoryKey
          );

          // Fetch each URL in parallel (D-05: per-image failure is non-fatal)
          if (urls.length > 0) {
            const refImagePromises = urls.map(async (url) => {
              try {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`Fetch returned ${resp.status}`);
                const buffer = await resp.arrayBuffer();
                const base64Data = Buffer.from(buffer).toString("base64");
                const mimeType = resp.headers.get("content-type") || "image/jpeg";
                return { base64Data, mimeType } as ReferenceImage;
              } catch (e) {
                console.warn(`[heygen] Failed to fetch reference image ${url}:`, e);
                return null;
              }
            });

            referenceImages = (await Promise.all(refImagePromises)).filter(
              (img): img is ReferenceImage => img !== null
            );

            // D-06: Set degraded flag if all fetches failed (D-05: single failures are omitted)
            if (urls.length > 0 && referenceImages.length === 0) {
              degraded = true;
              degradedMessage =
                "This product has no reference images. Output may drift toward generic or unrelated product types.";
            }
          } else {
            // No URLs resolved for this category
            degraded = true;
            degradedMessage =
              "This product has no reference images. Output may drift toward generic or unrelated product types.";
          }
        } else if (truthEntry) {
          // SKU exists but has no categoryKey (e.g., a tool)
          productTruth = truthEntry;
          degraded = true;
          degradedMessage =
            "This product has no reference images. Output may drift toward generic or unrelated product types.";
        }
        // If truthEntry is null, SKU is unknown; proceed without product-truth (not an error per D-01)
      } catch (error) {
        // Graceful degradation: log error and proceed without product-truth
        console.warn("[heygen] Error resolving product SKU:", error);
      }
    }

    const { prompt, negativePrompt } = buildStudioAvatarPrompt(
      params,
      productTruth
    );
    const fullPrompt = `${prompt}\n\n[NEGATIVE PROMPT — avoid these qualities entirely]\n${negativePrompt}`;

    const result = await generateImage(
      fullPrompt,
      imageAspect,
      referenceImages.length > 0 ? referenceImages : undefined,
      undefined,
      "1K"
    );

    const supabase = await createAdminClient();
    const { url: imageUrl, path: storagePath } = await uploadGeneratedImage(
      supabase,
      result.buffer,
      "cocolash",
      "-studio-avatar",
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
        heygenAsset: { kind: "studio-avatar" },
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
        tags: ["studio-avatar"],
        geminiModel: result.model,
      });
      galleryImageId = inserted?.id;
    }

    return NextResponse.json({
      imageUrl,
      storagePath,
      model: result.model,
      galleryImageId,
      degraded,
      ...(degradedMessage && { degradedMessage }),
    });
  } catch (error: unknown) {
    console.error("[heygen/generate-studio-avatar] Error:", error);
    const message =
      error instanceof Error ? error.message : "Studio avatar generation failed";
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
const VALID_SCENES = STUDIO_SCENE_OPTIONS.map((o) => o.value);
const VALID_OUTFITS = STUDIO_OUTFIT_OPTIONS.map((o) => o.value);
const VALID_FRAMINGS = STUDIO_FRAMING_OPTIONS.map((o) => o.value);
const VALID_EXPRESSIONS = STUDIO_EXPRESSION_OPTIONS.map((o) => o.value);
const VALID_LASH_STYLES: LashStyle[] = [
  "natural", "volume", "dramatic", "cat-eye",
  "wispy", "doll-eye", "hybrid", "mega-volume", "clusters",
];
const VALID_ASPECT_RATIOS: VideoAspectRatio[] = ["9:16", "1:1", "16:9"];

// Normalize ethnicity to canonical form, capitalizing each word.
// Accepts slug input ("east-asian"), canonical input ("East Asian"), and
// mixed casing ("EAST ASIAN") — splitting on hyphen OR whitespace so the
// space-separated values the UI sends ("East Asian", "South Asian",
// "Middle Eastern") aren't mangled to "East asian" and rejected.
function normalizeEthnicity(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .toLowerCase()
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Normalize skin tone: "medium" / "MEDIUM" -> "Medium" (capitalize first letter only)
function normalizeSkinTone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Normalize hair style: "straight-long" / "STRAIGHT-LONG" -> "Straight long"
function normalizeHairStyle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const withSpaces = value.toLowerCase().replace(/-/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

// Normalize ageRange: attempt to match to known ranges
function normalizeAgeRange(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Try exact match first
  if (VALID_AGE_RANGES.includes(value as UGCAgeRange)) return value;
  // Try normalizing: "25-35" might be user error for "25-34"
  if (value === "25-35") return "25-34";
  return value;
}

function validateRequest(body: Record<string, unknown>): string[] {
  const errors: string[] = [];

  const ethnicity = normalizeEthnicity(body.ethnicity);
  if (!ethnicity || !VALID_ETHNICITIES.includes(ethnicity as UGCEthnicity)) {
    errors.push(`ethnicity must be one of: ${VALID_ETHNICITIES.join(", ")}`);
  } else {
    body.ethnicity = ethnicity;
  }

  const skinTone = normalizeSkinTone(body.skinTone);
  if (!skinTone || !VALID_SKIN_TONES.includes(skinTone as UGCSkinTone)) {
    errors.push(`skinTone must be one of: ${VALID_SKIN_TONES.join(", ")}`);
  } else {
    body.skinTone = skinTone;
  }

  const ageRange = normalizeAgeRange(body.ageRange);
  if (!ageRange || !VALID_AGE_RANGES.includes(ageRange as UGCAgeRange)) {
    errors.push(`ageRange must be one of: ${VALID_AGE_RANGES.join(", ")}`);
  } else {
    body.ageRange = ageRange;
  }

  const hairStyle = normalizeHairStyle(body.hairStyle);
  if (!hairStyle || !VALID_HAIR_STYLES.includes(hairStyle as UGCHairStyle)) {
    errors.push(`hairStyle must be one of: ${VALID_HAIR_STYLES.join(", ")}`);
  } else {
    body.hairStyle = hairStyle;
  }
  if (!body.scene || !VALID_SCENES.includes(body.scene as StudioScene)) {
    errors.push(`scene must be one of: ${VALID_SCENES.join(", ")}`);
  }
  if (!body.outfit || !VALID_OUTFITS.includes(body.outfit as StudioOutfit)) {
    errors.push(`outfit must be one of: ${VALID_OUTFITS.join(", ")}`);
  }
  if (!body.framing || !VALID_FRAMINGS.includes(body.framing as StudioFraming)) {
    errors.push(`framing must be one of: ${VALID_FRAMINGS.join(", ")}`);
  }
  if (!body.expression || !VALID_EXPRESSIONS.includes(body.expression as StudioExpression)) {
    errors.push(`expression must be one of: ${VALID_EXPRESSIONS.join(", ")}`);
  }
  if (!body.lashStyle || !VALID_LASH_STYLES.includes(body.lashStyle as LashStyle)) {
    errors.push(`lashStyle must be one of: ${VALID_LASH_STYLES.join(", ")}`);
  }
  if (body.aspectRatio && !VALID_ASPECT_RATIOS.includes(body.aspectRatio as VideoAspectRatio)) {
    errors.push(`aspectRatio must be one of: ${VALID_ASPECT_RATIOS.join(", ")}`);
  }
  if (body.productSku !== undefined && typeof body.productSku !== "string") {
    errors.push(`productSku must be a string if provided`);
  }

  return errors;
}
