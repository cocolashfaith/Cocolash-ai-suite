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
 *     productSku?: "jasmine", // OPTIONAL (empty string is treated as absent)
 *     productFacts?: "WHAT THE PRODUCT ACTUALLY IS...", // OPTIONAL, image-extracted
 *     intent?: "Show the opened tray...", // OPTIONAL
 *     durationSeconds?: 12, // OPTIONAL, -1 = Auto (the model picks the length)
 *     aspectRatio?: "9:16", // OPTIONAL, defaults to the vertical phone frame
 *     influencerAlreadyHoldsProduct?: true // OPTIONAL, composed avatar (H4)
 *   }
 *
 * Response:
 *   {
 *     prompt: "Using @influencer_image1 @product_image1...", // Seedance-ready prompt
 *     scriptAudit: string[], // claims dropped/reworded because the images don't show them
 *     diagnostics?: { model, systemPromptId, durationMs, inputSummary }
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  generateSeedanceVisionPrompt,
  type VisionPromptInput,
  VisionDirectorError,
} from "@/lib/ai/director/seedance-vision-director";
import { AUTO_DURATION, SEEDANCE_25_LIMITS } from "@/lib/seedance/v25/types";
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
    /** The wizard stores "" until a library category is chosen — treat that as absent. */
    productSku: z
      .string()
      .trim()
      .optional()
      .transform((sku) => (sku ? sku : undefined)),
    intent: z.string().optional(),
    productFacts: z.string().optional(),
    /** Set on explicit "Regenerate" to request a distinctly different scene. */
    variationHint: z.string().max(2000).optional(),
    /**
     * F2 — the clip the user actually ordered. `-1` is Seedance 2.5's AUTO
     * duration (the model picks the length), so negatives below it are rejected
     * rather than silently planned as a zero-second clip.
     */
    durationSeconds: z
      .number()
      .int()
      .min(AUTO_DURATION, "durationSeconds must be -1 (Auto) or a positive length")
      .max(SEEDANCE_25_LIMITS.durationMax)
      .refine((value) => value === AUTO_DURATION || value > 0, {
        message: "durationSeconds must be -1 (Auto) or a positive length",
      })
      .optional(),
    /** F2 — the frame the clip ships in, e.g. "9:16". */
    aspectRatio: z.string().trim().max(16).optional(),
    /**
     * H4 — the first influencer reference is the composed shot in which the
     * creator is already staged with the product.
     */
    influencerAlreadyHoldsProduct: z.boolean().optional(),
    /**
     * Staging (2026-09-18) — camera rig + product staging for the clip.
     * Absent → the campaign type's default applies server-side.
     */
    stagingMode: z.enum(["holding-selfie", "desk-propped"]).optional(),
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
      hasFacts: !!parsed.productFacts,
      durationSeconds: parsed.durationSeconds ?? null,
      aspectRatio: parsed.aspectRatio ?? null,
      composedInfluencer: !!parsed.influencerAlreadyHoldsProduct,
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
      durationSeconds: parsed.durationSeconds,
      aspectRatio: parsed.aspectRatio,
      influencerAlreadyHoldsProduct: parsed.influencerAlreadyHoldsProduct,
      stagingMode: parsed.stagingMode,
    };

    const result = await generateSeedanceVisionPrompt(visionPromptInput);

    console.log("[seedance/director-vision] Prompt generated successfully", {
      promptLength: result.prompt.length,
      durationMs: result.diagnostics.durationMs,
      model: result.diagnostics.model,
      scriptAuditCount: result.scriptAudit?.length ?? 0,
    });

    return NextResponse.json({
      prompt: result.prompt,
      // What the Director refused to stage because the images don't support it.
      // Step 3 shows this to the user; it is never part of the outgoing prompt.
      scriptAudit: result.scriptAudit ?? [],
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
      // A bad request is the caller's fault (400); a truncated or empty model
      // reply is ours (500) — and is now surfaced instead of silently returning
      // a cut-off prompt.
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.code === "INVALID_INPUT" ? 400 : 500 }
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
