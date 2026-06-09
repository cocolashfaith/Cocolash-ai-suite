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
 *     influencerImageUrl: "https://...", // REQUIRED
 *     productImageUrls: ["https://...", ...], // REQUIRED (1-9 URLs)
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

// ── Zod schema for request validation ────────────────────────

const VisionDirectorBodySchema = z.object({
  influencerImageUrl: z
    .string()
    .url("influencerImageUrl must be a valid HTTPS URL"),
  productImageUrls: z
    .array(z.string().url("Each product image URL must be valid HTTPS"))
    .min(1, "At least one product image is required")
    .max(9, "Maximum 9 product images allowed"),
  script: z.string().min(1, "script is required and must be non-empty"),
  campaignType: z
    .string()
    .min(1, "campaignType is required and must be non-empty"),
  productSku: z.string().optional(),
  intent: z.string().optional(),
  productFacts: z.string().optional(),
});

type VisionDirectorBody = z.infer<typeof VisionDirectorBodySchema>;

// ── POST handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const parsed: VisionDirectorBody = VisionDirectorBodySchema.parse(body);

    console.log("[seedance/director-vision] Generating vision prompt from images...", {
      influencerUrl: parsed.influencerImageUrl.substring(0, 50) + "...",
      productCount: parsed.productImageUrls.length,
      scriptLength: parsed.script.length,
      campaignType: parsed.campaignType,
      hasSku: !!parsed.productSku,
    });

    // Call the vision director
    // productSku is optional per D-34-04; if absent, uses image analysis alone
    const visionPromptInput: VisionPromptInput = {
      influencerImageUrl: parsed.influencerImageUrl,
      productImageUrls: parsed.productImageUrls,
      script: parsed.script,
      campaignType: parsed.campaignType,
      productSku: parsed.productSku,
      intent: parsed.intent,
      productFacts: parsed.productFacts,
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
