/**
 * POST /api/seedance/director-vision
 *
 * Vision-capable prompt generation endpoint. Accepts selected influencer +
 * product images + script, and calls the Seedance Vision Director to generate
 * a high-quality Seedance prompt with @-mention role assignment.
 *
 * Per D-34-04 (BLOCKER 1): productSku is OPTIONAL. Images are the primary
 * source of product truth.
 *
 * Request body:
 *   {
 *     influencerImageUrl: "https://...", // REQUIRED (unless influencerImageUrls is sent)
 *     influencerImageUrls: ["https://...", ...], // OPTIONAL (Seedance 2.5, ≤30)
 *     productImageUrls: ["https://...", ...], // REQUIRED (1-30 URLs)
 *     script: "The spoken script...", // REQUIRED
 *     campaignType: "product-showcase", // REQUIRED
 *     productSku?: "jasmine", // OPTIONAL
 *     intent?: "Show the opened tray..." // OPTIONAL
 *   }
 *
 * Response:
 *   {
 *     prompt: "Using @influencer_image1 @product_image1...", // Seedance-ready prompt
 *     diagnostics?: { model, durationMs, inputSummary }
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  generateSeedanceVisionPrompt,
  type VisionPromptInput,
  VisionDirectorError,
} from "@/lib/ai/director/seedance-vision-director";
import { SEEDANCE_25_LIMITS } from "@/lib/seedance/v25/types";
import { isPublicHttpsUrl } from "@/lib/seedance/v25/schema";

// ── Zod schema for request validation ────────────────────────

/**
 * These URLs are fetched server-side and handed to the vision model, so
 * `z.string().url()` is not enough: it happily accepts `http://`, `file:` and
 * `https://127.0.0.1/…`. Reuse the ONE SSRF guard the 2.5 request schema uses.
 */
const VisionImageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(isPublicHttpsUrl, { message: "must be a public https:// image URL" });

const VisionDirectorBodySchema = z
  .object({
    /** Single-influencer contract (still the common case). */
    influencerImageUrl: VisionImageUrl.optional(),
    /** Seedance 2.5: several influencer references (@influencer_image1…N). */
    influencerImageUrls: z
      .array(VisionImageUrl)
      .max(
        SEEDANCE_25_LIMITS.maxImages,
        `Maximum ${SEEDANCE_25_LIMITS.maxImages} influencer images allowed`
      )
      .optional(),
    productImageUrls: z
      .array(VisionImageUrl)
      .min(1, "At least one product image is required")
      .max(
        SEEDANCE_25_LIMITS.maxImages,
        `Maximum ${SEEDANCE_25_LIMITS.maxImages} product images allowed`
      ),
    script: z.string().min(1, "script is required and must be non-empty"),
    campaignType: z
      .string()
      .min(1, "campaignType is required and must be non-empty"),
    productSku: z.string().optional(),
    intent: z.string().optional(),
    productFacts: z.string().optional(),
    /** Set on explicit "Regenerate" to request a distinctly different scene. */
    variationHint: z.string().max(2000).optional(),
  })
  .refine(
    (body) => !!body.influencerImageUrl || !!body.influencerImageUrls?.length,
    {
      message: "influencerImageUrl (or influencerImageUrls) is required",
      path: ["influencerImageUrl"],
    }
  );

type VisionDirectorBody = z.infer<typeof VisionDirectorBodySchema>;

// ── POST handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const parsed: VisionDirectorBody = VisionDirectorBodySchema.parse(body);

    // The array wins when both are sent; the single field keeps working alone.
    const influencerImageUrls = parsed.influencerImageUrls?.length
      ? parsed.influencerImageUrls
      : undefined;
    const influencerImageUrl =
      parsed.influencerImageUrl ?? influencerImageUrls![0];

    console.log("[seedance/director-vision] Generating vision prompt from images...", {
      influencerUrl: influencerImageUrl.substring(0, 50) + "...",
      influencerCount: influencerImageUrls?.length ?? 1,
      productCount: parsed.productImageUrls.length,
      scriptLength: parsed.script.length,
      campaignType: parsed.campaignType,
      hasSku: !!parsed.productSku,
    });

    // Call the vision director
    // productSku is optional per D-34-04; if absent, uses image analysis alone
    const visionPromptInput: VisionPromptInput = {
      influencerImageUrl,
      influencerImageUrls,
      productImageUrls: parsed.productImageUrls,
      script: parsed.script,
      campaignType: parsed.campaignType,
      productSku: parsed.productSku,
      intent: parsed.intent,
      productFacts: parsed.productFacts,
      variationHint: parsed.variationHint,
    };

    const result = await generateSeedanceVisionPrompt(visionPromptInput);

    console.log("[seedance/director-vision] Prompt generated successfully", {
      promptLength: result.prompt.length,
      durationMs: result.diagnostics.durationMs,
      model: result.diagnostics.model,
    });

    return NextResponse.json({
      prompt: result.prompt,
      diagnostics: result.diagnostics,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[seedance/director-vision] Validation error:", error.issues);
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    if (error instanceof VisionDirectorError) {
      console.error(
        `[seedance/director-vision] Vision director error (${error.code}):`,
        error.message
      );
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: 500 }
      );
    }

    console.error("[seedance/director-vision] Unexpected error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate prompt",
      },
      { status: 500 }
    );
  }
}
