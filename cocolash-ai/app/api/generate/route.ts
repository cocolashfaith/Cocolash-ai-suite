/**
 * POST /api/generate — Image Generation Pipeline
 *
 * Full pipeline:
 *   1. Validate selections from the form
 *   2. Fetch brand profile for overrides + logos
 *   3. Fetch diversity data for "random" rotation
 *   4. Compose prompt via prompt engine
 *   5. Call Gemini generateImage()
 *   6. Upload raw image to Supabase Storage
 *   7. If logo enabled, apply overlay and upload final version
 *   8. Insert record into generated_images table
 *   9. Record diversity selection
 *  10. Return { success, image, generationTimeMs }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadGeneratedImage } from "@/lib/supabase/storage";
import { generateImage, type ReferenceImage } from "@/lib/gemini/generate";
import { GeminiError } from "@/lib/gemini/safety";
import { composePrompt } from "@/lib/prompts/compose";
import { getRecentDiversityUsage, recordDiversitySelection } from "@/lib/diversity/tracker";
import { applyLogoOverlay, selectLogoUrl } from "@/lib/image-processing/logo-overlay";
import type {
  GenerationSelections,
  ContentCategory,
  ProductCategoryKey,
  AspectRatio,
  Composition,
  LashStyle,
  SkinTone,
  HairStyle,
  Scene,
  Vibe,
  SeasonalSelection,
  GroupDiversitySelections,
  GroupAction,
  AgeRange,
  GenerateResponse,
  GenerateErrorResponse,
} from "@/lib/types";

// Allow up to 60 seconds for image generation
export const maxDuration = 60;

// ── Validation Helpers ───────────────────────────────────────
const VALID_CATEGORIES: ContentCategory[] = ["lash-closeup", "lifestyle", "product"];
const VALID_RATIOS: AspectRatio[] = ["1:1", "4:5", "9:16", "16:9"];
const VALID_COMPOSITIONS: Composition[] = ["solo", "duo", "group"];
const VALID_GROUP_ACTIONS: GroupAction[] = ["laughing", "walking", "posing", "brunch", "getting-ready"];
const VALID_AGE_RANGES: AgeRange[] = ["same", "mixed", "mature"];
const VALID_LASH_STYLES: LashStyle[] = [
  "natural", "volume", "dramatic", "cat-eye",
  "wispy", "doll-eye", "hybrid", "mega-volume",
];
const VALID_SKIN_TONES: SkinTone[] = ["deep", "medium-deep", "medium", "light", "random"];
const VALID_HAIR_STYLES: HairStyle[] = [
  "4c-natural", "afro", "twist-out", "blown-out",
  "box-braids", "locs", "sew-in", "cornrows", "bantu-knots",
  "silk-press", "loose-waves", "short-tapered", "random",
];
const VALID_SCENES: Scene[] = [
  "studio", "bedroom", "cafe", "outdoor-golden-hour",
  "rooftop", "salon", "bathroom-vanity", "minimalist-backdrop", "random",
];
const VALID_VIBES: Vibe[] = [
  "confident-glam", "soft-romantic", "bold-editorial",
  "natural-beauty", "night-out", "self-care", "professional", "random",
];
const VALID_PRODUCT_SUB_CATEGORIES: ProductCategoryKey[] = [
  "single-black-tray", "single-nude-tray", "multi-lash-book",
  "full-kit-pouch", "full-kit-box",
  "storage-pouch", "branding-flatlay",
];

function validateSelections(body: unknown): GenerationSelections {
  const data = body as Record<string, unknown>;

  if (!data || typeof data !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  // Required fields
  const category = data.category as ContentCategory;
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }

  const aspectRatio = (data.aspectRatio as AspectRatio) || "4:5";
  if (!VALID_RATIOS.includes(aspectRatio)) {
    throw new Error(`Invalid aspect ratio: ${aspectRatio}`);
  }

  const lashStyle = (data.lashStyle as LashStyle) || "natural";
  if (!VALID_LASH_STYLES.includes(lashStyle)) {
    throw new Error(`Invalid lash style: ${lashStyle}`);
  }

  const skinTone = (data.skinTone as SkinTone) || "random";
  if (!VALID_SKIN_TONES.includes(skinTone)) {
    throw new Error(`Invalid skin tone: ${skinTone}`);
  }

  const hairStyle = (data.hairStyle as HairStyle) || "random";
  if (!VALID_HAIR_STYLES.includes(hairStyle)) {
    throw new Error(`Invalid hair style: ${hairStyle}`);
  }

  const scene = (data.scene as Scene) || "studio";
  if (!VALID_SCENES.includes(scene)) {
    throw new Error(`Invalid scene: ${scene}`);
  }

  const composition = (data.composition as Composition) || "solo";
  if (!VALID_COMPOSITIONS.includes(composition)) {
    throw new Error(`Invalid composition: ${composition}`);
  }

  const vibe = (data.vibe as Vibe) || "confident-glam";
  if (!VALID_VIBES.includes(vibe)) {
    throw new Error(`Invalid vibe: ${vibe}`);
  }

  // Logo overlay settings
  const logoData = (data.logoOverlay as Record<string, unknown>) || {};
  const logoOverlay = {
    enabled: Boolean(logoData.enabled),
    position: (logoData.position as string) || "bottom-right",
    variant: (logoData.variant as string) || "white",
    opacity: typeof logoData.opacity === "number" ? logoData.opacity : 0.9,
    paddingPercent: typeof logoData.paddingPercent === "number" ? logoData.paddingPercent : 3,
    sizePercent: typeof logoData.sizePercent === "number" ? logoData.sizePercent : 22,
  } as GenerationSelections["logoOverlay"];

  // Product sub-category (required when category is "product")
  const productSubCategory = data.productSubCategory as ProductCategoryKey | undefined;
  if (category === "product" && productSubCategory) {
    if (!VALID_PRODUCT_SUB_CATEGORIES.includes(productSubCategory)) {
      throw new Error(`Invalid product sub-category: ${productSubCategory}`);
    }
  }

  // Optional context note (max 100 chars)
  const contextNote = typeof data.contextNote === "string"
    ? data.contextNote.substring(0, 100)
    : undefined;

  // [M2] Seasonal preset selection (optional)
  const seasonalData = data.seasonal as Record<string, unknown> | undefined;
  let seasonal: SeasonalSelection | undefined;
  if (seasonalData && typeof seasonalData === "object" && seasonalData.presetSlug) {
    seasonal = {
      presetSlug: String(seasonalData.presetSlug),
      selectedProps: Array.isArray(seasonalData.selectedProps)
        ? (seasonalData.selectedProps as string[]).map(String)
        : [],
    };
  }

  // [M2] Group diversity selections (required when composition is "group")
  const groupDiversityData = data.groupDiversity as Record<string, unknown> | undefined;
  let groupDiversity: GroupDiversitySelections | undefined;
  if (composition === "group" && groupDiversityData && typeof groupDiversityData === "object") {
    const groupCount = Number(groupDiversityData.groupCount) as 3 | 4 | 5;
    if (![3, 4, 5].includes(groupCount)) {
      throw new Error(`Invalid group count: ${groupCount}`);
    }

    const mode = groupDiversityData.mode === "custom" ? "custom" : "diverse-mix";

    const groupAction = (groupDiversityData.groupAction as GroupAction) || "posing";
    if (!VALID_GROUP_ACTIONS.includes(groupAction)) {
      throw new Error(`Invalid group action: ${groupAction}`);
    }

    const ageRange = (groupDiversityData.ageRange as AgeRange) || "same";
    if (!VALID_AGE_RANGES.includes(ageRange)) {
      throw new Error(`Invalid age range: ${ageRange}`);
    }

    // Parse per-person configs
    const rawPeople = Array.isArray(groupDiversityData.people) ? groupDiversityData.people : [];
    const people = rawPeople.slice(0, groupCount).map((p: unknown) => {
      const person = p as Record<string, unknown>;
      return {
        skinTone: (VALID_SKIN_TONES.includes(person?.skinTone as SkinTone)
          ? person.skinTone
          : "random") as SkinTone,
        hairStyle: (VALID_HAIR_STYLES.includes(person?.hairStyle as HairStyle)
          ? person.hairStyle
          : "random") as HairStyle,
      };
    });

    // Pad with defaults if needed
    while (people.length < groupCount) {
      people.push({ skinTone: "random" as SkinTone, hairStyle: "random" as HairStyle });
    }

    groupDiversity = {
      groupCount,
      mode,
      people,
      ageRange,
      groupAction,
    };
  } else if (composition === "group") {
    // Default group config if none provided
    groupDiversity = {
      groupCount: 3,
      mode: "diverse-mix",
      people: [
        { skinTone: "random", hairStyle: "random" },
        { skinTone: "random", hairStyle: "random" },
        { skinTone: "random", hairStyle: "random" },
      ],
      ageRange: "same",
      groupAction: "posing",
    };
  }

  return {
    category,
    productSubCategory,
    skinTone,
    lashStyle,
    hairStyle,
    scene,
    composition,
    aspectRatio,
    vibe,
    logoOverlay,
    contextNote,
    seasonal,
    groupDiversity,
  };
}

// ── POST Handler ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Parse and validate selections
    const body = await request.json();
    const selections = validateSelections(body);

    // 2. Get Supabase client
    const supabase = await createClient();

    // 3. Fetch brand profile for prompt overrides and logo URLs
    const { data: brandProfile, error: brandError } = await supabase
      .from("brand_profiles")
      .select("*")
      .limit(1)
      .single();

    if (brandError || !brandProfile) {
      console.error("Failed to fetch brand profile:", brandError?.message);
      return NextResponse.json<GenerateErrorResponse>(
        { error: "Brand profile not found. Please configure it in Settings.", code: "UNKNOWN" },
        { status: 500 }
      );
    }

    const brandId = brandProfile.id;

    // 4. Fetch diversity data for "random" rotation
    const { recentSkinTones, recentHairStyles } = await getRecentDiversityUsage(
      supabase,
      brandId
    );

    // 5. Fetch product reference images for the selected sub-category
    const isProductCategory = selections.category === "product";
    let productSubCategoryLabel = "";
    let productSubCategoryDescription = "";
    let referenceImages: ReferenceImage[] | undefined;
    let hasProductRefs = false;

    if (isProductCategory && selections.productSubCategory) {
      // Look up the category and its images from the database
      const { data: productCat } = await supabase
        .from("product_categories")
        .select("id, label, description, prompt_template")
        .eq("key", selections.productSubCategory)
        .single();

      if (productCat) {
        productSubCategoryLabel = productCat.label;
        productSubCategoryDescription = productCat.description || "";

        // Fetch reference images for this specific category
        const { data: refImages } = await supabase
          .from("product_reference_images")
          .select("image_url")
          .eq("category_id", productCat.id)
          .order("sort_order", { ascending: true });

        const imageUrls = (refImages || []).map((r) => r.image_url);

        if (imageUrls.length > 0) {
          console.log(`[Generate] Fetching ${imageUrls.length} reference image(s) for "${productCat.label}"...`);
          referenceImages = [];
          for (const url of imageUrls) {
            try {
              const cleanUrl = url.split("?")[0];
              const res = await fetch(cleanUrl);
              if (res.ok) {
                const arrayBuffer = await res.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const contentType = res.headers.get("content-type") || "image/png";
                referenceImages.push({
                  base64Data: buffer.toString("base64"),
                  mimeType: contentType,
                });
              } else {
                console.warn(`[Generate] Failed to fetch product image: ${cleanUrl} (${res.status})`);
              }
            } catch (err) {
              console.warn(`[Generate] Error fetching product image:`, err);
            }
          }
          hasProductRefs = referenceImages.length > 0;
          console.log(`[Generate] Successfully loaded ${referenceImages.length} reference image(s) for "${productCat.label}"`);
        }
      }
    }

    // 5b. [M2] Look up seasonal preset ID if a seasonal slug is provided
    let seasonalPresetId: string | null = null;
    if (selections.seasonal?.presetSlug) {
      const { data: seasonalPreset } = await supabase
        .from("seasonal_presets")
        .select("id")
        .eq("slug", selections.seasonal.presetSlug)
        .eq("is_active", true)
        .single();

      if (seasonalPreset) {
        seasonalPresetId = seasonalPreset.id;
      }
      console.log(`[Generate] Seasonal preset: "${selections.seasonal.presetSlug}" (ID: ${seasonalPresetId || "not found"}), Props: ${selections.seasonal.selectedProps.join(", ") || "none"}`);
    }

    // 6. Compose the prompt
    const composed = composePrompt(selections, {
      customBrandDNA: brandProfile.brand_dna_prompt,
      customNegativePrompt: brandProfile.negative_prompt,
      customSkinRealismPrompt: brandProfile.skin_realism_prompt,
      hasProductReferenceImages: hasProductRefs,
      productSubCategoryKey: selections.productSubCategory,
      productSubCategoryLabel,
      productSubCategoryDescription,
      seasonalSelection: selections.seasonal || null,
      groupDiversity: selections.groupDiversity || null,
      recentSkinTones,
      recentHairStyles,
    });

    console.log(`[Generate] Category: ${selections.category}${selections.productSubCategory ? ` (${selections.productSubCategory})` : ""}${selections.seasonal?.presetSlug ? `, Season: ${selections.seasonal.presetSlug}` : ""}, Aspect: ${selections.aspectRatio}`);
    console.log(`[Generate] Resolved: skin=${composed.resolvedSelections.skinTone}, hair=${composed.resolvedSelections.hairStyle}, scene=${composed.resolvedSelections.scene}, vibe=${composed.resolvedSelections.vibe}`);
    if (selections.composition === "group" && selections.groupDiversity) {
      console.log(`[Generate] Group: ${selections.groupDiversity.groupCount} people, mode=${selections.groupDiversity.mode}, action=${selections.groupDiversity.groupAction}, age=${selections.groupDiversity.ageRange}`);
    }
    if (hasProductRefs) {
      console.log(`[Generate] Product reference images for "${productSubCategoryLabel}": ${referenceImages?.length ?? 0}`);
    }

    // 7. Call Gemini to generate the image (with optional product references)
    const geminiResult = await generateImage(
      composed.fullPrompt,
      selections.aspectRatio,
      referenceImages
    );

    console.log(`[Generate] Gemini returned ${geminiResult.buffer.length} bytes (${geminiResult.mimeType})`);

    // 8. Upload raw image to Supabase Storage
    const rawUpload = await uploadGeneratedImage(
      supabase,
      geminiResult.buffer,
      brandId,
      "-raw"
    );

    // 9. Logo overlay (if enabled)
    let finalImageUrl = rawUpload.url;
    let finalStoragePath = rawUpload.path;
    let hasLogoOverlay = false;

    if (selections.logoOverlay.enabled) {
      const logoUrl = selectLogoUrl(selections.logoOverlay.variant, {
        logo_white_url: brandProfile.logo_white_url,
        logo_dark_url: brandProfile.logo_dark_url,
        logo_gold_url: brandProfile.logo_gold_url,
      });

      if (logoUrl) {
        try {
          const overlayResult = await applyLogoOverlay(geminiResult.buffer, {
            ...selections.logoOverlay,
            logoUrl,
          });

          // Upload the logo-overlaid version
          const finalUpload = await uploadGeneratedImage(
            supabase,
            overlayResult.buffer,
            brandId,
            "-final"
          );

          finalImageUrl = finalUpload.url;
          finalStoragePath = finalUpload.path;
          hasLogoOverlay = true;

          console.log(`[Generate] Logo overlay applied (${selections.logoOverlay.position})`);
        } catch (logoError) {
          console.warn("[Generate] Logo overlay failed, using raw image:", logoError);
          // Continue with the raw image if logo overlay fails
        }
      } else {
        console.warn("[Generate] Logo overlay requested but no logo uploaded for variant:", selections.logoOverlay.variant);
      }
    }

    // 10. Insert record into generated_images
    const generationTimeMs = Date.now() - startTime;

    const imageRecord = {
      brand_id: brandId,
      prompt_used: composed.fullPrompt,
      selections: selections,
      image_url: finalImageUrl,
      raw_image_url: hasLogoOverlay ? rawUpload.url : null,
      storage_path: finalStoragePath,
      aspect_ratio: selections.aspectRatio,
      category: selections.category,
      composition: selections.composition,
      has_logo_overlay: hasLogoOverlay,
      logo_position: hasLogoOverlay ? selections.logoOverlay.position : null,
      generation_time_ms: generationTimeMs,
      gemini_model: geminiResult.model,
      seasonal_preset_id: seasonalPresetId,
      group_count: selections.composition === "group" && selections.groupDiversity
        ? selections.groupDiversity.groupCount
        : selections.composition === "duo" ? 2 : 1,
      diversity_selections: selections.groupDiversity || null,
    };

    const { data: insertedImage, error: insertError } = await supabase
      .from("generated_images")
      .insert(imageRecord)
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert image record:", insertError.message);
      // Don't fail the request — the image was generated and uploaded
    }

    // 11. Record diversity selection for rotation
    await recordDiversitySelection(
      supabase,
      brandId,
      composed.resolvedSelections.skinTone,
      composed.resolvedSelections.hairStyle
    );

    console.log(`[Generate] Complete in ${generationTimeMs}ms`);

    return NextResponse.json<GenerateResponse>({
      success: true,
      image: insertedImage || {
        ...imageRecord,
        id: "temp-" + Date.now(),
        is_favorite: false,
        tags: null,
        created_at: new Date().toISOString(),
      },
      generationTimeMs,
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Generate] Failed after ${elapsed}ms:`, error);

    // Handle Gemini-specific errors
    if (error instanceof GeminiError) {
      return NextResponse.json<GenerateErrorResponse>(
        {
          error: error.userMessage,
          code: error.code,
          retryAfterMs: error.retryAfterMs,
        },
        { status: error.statusCode }
      );
    }

    // Handle validation errors
    if (error instanceof Error && error.message.startsWith("Invalid ")) {
      return NextResponse.json<GenerateErrorResponse>(
        { error: error.message, code: "UNKNOWN" },
        { status: 400 }
      );
    }

    // Generic server error
    return NextResponse.json<GenerateErrorResponse>(
      {
        error: "An unexpected error occurred during image generation.",
        code: "UNKNOWN",
      },
      { status: 500 }
    );
  }
}
