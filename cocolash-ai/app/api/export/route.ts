/**
 * POST /api/export — Multi-Platform Export (Reference-Based Ratio Adaptation)
 *
 * Reframes an existing image to a different aspect ratio by passing the original
 * image as a reference to Gemini with strict instructions to preserve all content.
 * Gemini intelligently extends/crops the image to fit the new ratio.
 *
 * Pipeline:
 *   1. Fetch the original image record from the database
 *   2. Validate the target aspect ratio (must differ from original)
 *   3. Download the original image pixels
 *   4. Pass original image as reference to Gemini with a reformat instruction + new aspect ratio
 *   5. Apply logo overlay if the original had one
 *   6. Upload to Supabase Storage
 *   7. Insert a new record in generated_images (linked to original via tags)
 *   8. Return the new image record
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadGeneratedImage } from "@/lib/supabase/storage";
import { generateImage, type ReferenceImage } from "@/lib/gemini/generate";
import { GeminiError } from "@/lib/gemini/safety";
import { applyLogoOverlay, selectLogoUrl } from "@/lib/image-processing/logo-overlay";
import type {
  AspectRatio,
  GeneratedImage,
  GenerateErrorResponse,
} from "@/lib/types";

export const maxDuration = 60;

const VALID_RATIOS: AspectRatio[] = ["1:1", "4:5", "9:16", "16:9"];

interface ExportRequest {
  imageId: string;
  targetAspectRatio: AspectRatio;
}

interface ExportResponse {
  success: boolean;
  image: GeneratedImage;
  generationTimeMs: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Parse request
    const body = (await request.json()) as ExportRequest;
    const { imageId, targetAspectRatio } = body;

    if (!imageId || typeof imageId !== "string") {
      return NextResponse.json<GenerateErrorResponse>(
        { error: "Missing or invalid imageId.", code: "UNKNOWN" },
        { status: 400 }
      );
    }

    if (!targetAspectRatio || !VALID_RATIOS.includes(targetAspectRatio)) {
      return NextResponse.json<GenerateErrorResponse>(
        { error: `Invalid target aspect ratio: ${targetAspectRatio}`, code: "UNKNOWN" },
        { status: 400 }
      );
    }

    // 2. Fetch original image (auth is handled by middleware)
    const supabase = await createClient();

    const { data: originalImage, error: fetchError } = await supabase
      .from("generated_images")
      .select("*")
      .eq("id", imageId)
      .single();

    if (fetchError || !originalImage) {
      return NextResponse.json<GenerateErrorResponse>(
        { error: "Image not found.", code: "UNKNOWN" },
        { status: 404 }
      );
    }

    const original = originalImage as GeneratedImage;

    // 3. Don't re-export to the same ratio
    if (original.aspect_ratio === targetAspectRatio) {
      return NextResponse.json<GenerateErrorResponse>(
        { error: "Target ratio is the same as the original. Download the original instead.", code: "UNKNOWN" },
        { status: 400 }
      );
    }

    // Don't allow export of composite images
    if (original.is_composite) {
      return NextResponse.json<GenerateErrorResponse>(
        { error: "Cannot export composite images. Export the individual Before or After image instead.", code: "UNKNOWN" },
        { status: 400 }
      );
    }

    console.log(`[Export] Reframing image ${imageId} from ${original.aspect_ratio} → ${targetAspectRatio}`);
    console.log(`[Export] Category: ${original.category}`);

    // 4. Download the original image to use as a reference
    // Use the raw image (without logo) if available, otherwise the final image
    const sourceUrl = original.raw_image_url || original.image_url;
    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) {
      return NextResponse.json<GenerateErrorResponse>(
        { error: "Failed to download original image for reframing.", code: "UNKNOWN" },
        { status: 500 }
      );
    }
    const originalBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const originalMimeType = imageResponse.headers.get("content-type") || "image/png";
    console.log(`[Export] Downloaded original: ${originalBuffer.length} bytes (${originalMimeType})`);

    // 5. Build the reference image and reformat instruction
    const referenceImg: ReferenceImage = {
      base64Data: originalBuffer.toString("base64"),
      mimeType: originalMimeType,
    };

    const referenceInstruction = `[ORIGINAL IMAGE — REFORMAT TO ${targetAspectRatio} ASPECT RATIO]
Study the image below carefully. This is the ORIGINAL photograph that must be reframed.`;

    const reformatPrompt = `TASK: Reformat the provided reference image from ${original.aspect_ratio} to ${targetAspectRatio} aspect ratio.

CRITICAL RULES (NON-NEGOTIABLE):
1. This must be the EXACT SAME image — same people, same clothing, same poses, same expressions, same hair, same makeup, same accessories.
2. Do NOT change, replace, or alter ANY visual elements: faces, skin tones, outfits, background objects, lighting, colors, textures, or styling.
3. Do NOT add new people, objects, text, watermarks, or any elements that were not in the original.
4. Do NOT remove any people or objects from the original.
5. If the new ratio is WIDER than the original: naturally extend the background/scene on the left and right edges. The extended areas must seamlessly blend with the existing background style, colors, and lighting.
6. If the new ratio is TALLER than the original: naturally extend the background/scene on the top and bottom edges. The extended areas must seamlessly blend with the existing background.
7. If the new ratio requires cropping: center the main subject(s) and crop minimally from the edges, keeping all faces and key elements fully visible.
8. The result must look like the exact same professional photograph, just reframed for a ${targetAspectRatio} format.
9. Maintain the exact same image quality, color grading, and photographic style.

OUTPUT: A single clean image at ${targetAspectRatio} aspect ratio that preserves 100% of the original content.`;

    // 6. Call Gemini with the original image as reference + reformat instructions
    const result = await generateImage(
      reformatPrompt,
      targetAspectRatio,
      [referenceImg],
      referenceInstruction
    );
    console.log(`[Export] Gemini returned ${result.buffer.length} bytes (${result.mimeType})`);

    // 7. Upload the raw image
    const rawUpload = await uploadGeneratedImage(
      supabase,
      result.buffer,
      original.brand_id,
      `-export-${targetAspectRatio.replace(":", "x")}-raw`
    );

    let finalUrl = rawUpload.url;
    let finalPath = rawUpload.path;
    let hasLogoOverlay = false;

    // 8. Re-apply logo overlay if the original had one
    if (original.has_logo_overlay && original.selections?.logoOverlay?.enabled) {
      const { data: brandProfile } = await supabase
        .from("brand_profiles")
        .select("logo_white_url, logo_dark_url, logo_gold_url")
        .eq("id", original.brand_id)
        .single();

      if (brandProfile) {
        const logoUrl = selectLogoUrl(
          original.selections.logoOverlay.variant || "white",
          brandProfile
        );

        if (logoUrl) {
          try {
            const overlayResult = await applyLogoOverlay(result.buffer, {
              ...original.selections.logoOverlay,
              logoUrl,
            });

            const finalUpload = await uploadGeneratedImage(
              supabase,
              overlayResult.buffer,
              original.brand_id,
              `-export-${targetAspectRatio.replace(":", "x")}-final`
            );

            finalUrl = finalUpload.url;
            finalPath = finalUpload.path;
            hasLogoOverlay = true;
            console.log(`[Export] Logo overlay re-applied`);
          } catch (logoErr) {
            console.warn("[Export] Logo overlay failed, using raw image:", logoErr);
          }
        }
      }
    }

    // 9. Insert the export record into the database
    const exportRecord = {
      brand_id: original.brand_id,
      prompt_used: `[EXPORT ${original.aspect_ratio} → ${targetAspectRatio}] ${reformatPrompt}`,
      selections: {
        ...original.selections,
        aspectRatio: targetAspectRatio,
      },
      image_url: finalUrl,
      raw_image_url: hasLogoOverlay ? rawUpload.url : null,
      storage_path: finalPath,
      aspect_ratio: targetAspectRatio,
      category: original.category,
      composition: original.composition,
      has_logo_overlay: hasLogoOverlay,
      logo_position: hasLogoOverlay ? (original.logo_position || null) : null,
      generation_time_ms: Date.now() - startTime,
      gemini_model: result.model,
      seasonal_preset_id: original.seasonal_preset_id,
      group_count: original.group_count,
      diversity_selections: original.diversity_selections,
      is_composite: false,
      tags: [`exported-from:${imageId}`, `original-ratio:${original.aspect_ratio}`],
    };

    const { data: insertedImage, error: insertError } = await supabase
      .from("generated_images")
      .insert(exportRecord)
      .select()
      .single();

    if (insertError) {
      console.error("[Export] DB insert failed:", insertError);
      return NextResponse.json<GenerateErrorResponse>(
        { error: "Failed to save exported image.", code: "UNKNOWN" },
        { status: 500 }
      );
    }

    const generationTimeMs = Date.now() - startTime;
    console.log(`[Export] Complete in ${generationTimeMs}ms — ${original.aspect_ratio} → ${targetAspectRatio}`);

    return NextResponse.json<ExportResponse>({
      success: true,
      image: insertedImage as GeneratedImage,
      generationTimeMs,
    });
  } catch (error) {
    console.error("[Export] Error:", error);

    if (error instanceof GeminiError) {
      const statusMap: Record<string, number> = {
        SAFETY_BLOCK: 422,
        RATE_LIMITED: 429,
        INVALID_API_KEY: 500,
        TIMEOUT: 504,
      };
      return NextResponse.json<GenerateErrorResponse>(
        {
          error: error.message,
          code: error.code as GenerateErrorResponse["code"],
          retryAfterMs: error.code === "RATE_LIMITED" ? 10000 : undefined,
        },
        { status: statusMap[error.code] || 500 }
      );
    }

    return NextResponse.json<GenerateErrorResponse>(
      {
        error: error instanceof Error ? error.message : "Export failed.",
        code: "UNKNOWN",
      },
      { status: 500 }
    );
  }
}
