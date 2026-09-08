/**
 * POST /api/seedance/director
 *
 * Runs the Seedance Director (Claude Opus 4.7) for the user's mode + inputs
 * and returns the generated Seedance prompt (or array of multi-frame
 * segment prompts). The user reviews / edits the prompt in Step 3 of the
 * mode-first flow before approving generation.
 *
 * No Enhancor call happens here — this route only writes the prompt.
 * The actual Enhancor /queue submission happens in /api/seedance/generate
 * after user approval.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runSeedanceDirector, SeedanceDirectorError } from "@/lib/ai/director/seedance-director";
import type { DirectorInput } from "@/lib/ai/director/types";
import {
  getProductTruthBySku,
} from "@/lib/brand/product-truth";
import {
  getProductReferenceImagesByCategory,
  getProductReferenceImagesByCategoryKey,
} from "@/lib/brand/get-product-references";
import { MASTER_BRAND_DNA } from "@/lib/prompts/brand-dna";
import {
  AUTO_DURATION,
  SEEDANCE_25_LIMITS,
  SEEDANCE_25_MODES,
} from "@/lib/seedance/v25/types";
import { createClient } from "@/lib/supabase/server";

const ImageRoleSchema = z.object({
  url: z.string().url(),
  role: z.enum(["appearance", "product", "background", "style"]).optional(),
  note: z.string().optional(),
});

/**
 * Seedance 2.5 (D10): 4–30 s, or the Auto sentinel (-1). Seedance 2.0 durations
 * (4–15) sit inside that range, so one rule serves both engines.
 */
const DurationSecondsSchema = z
  .number()
  .int()
  .refine(
    (d) =>
      d === AUTO_DURATION ||
      (d >= SEEDANCE_25_LIMITS.durationMin && d <= SEEDANCE_25_LIMITS.durationMax),
    {
      message: `durationSeconds must be ${AUTO_DURATION} (Auto) or between ${SEEDANCE_25_LIMITS.durationMin} and ${SEEDANCE_25_LIMITS.durationMax}`,
    }
  );

const BodySchema = z.object({
  mode: z.enum(SEEDANCE_25_MODES),
  campaignType: z.string().min(1),
  tone: z.string().min(1),
  durationSeconds: DurationSecondsSchema,
  aspectRatio: z.string().min(1),
  script: z.string().optional(),
  composedPersonProductImage: ImageRoleSchema.optional(),
  referenceImages: z.array(ImageRoleSchema).optional(),
  referenceVideoUrl: z.string().url().optional(),
  referenceAudioUrl: z.string().url().optional(),
  /** Seedance 2.5 multi_reference: extra @videoN / @audioN references. */
  referenceVideoUrls: z
    .array(z.string().url())
    .max(SEEDANCE_25_LIMITS.maxVideos)
    .optional(),
  referenceAudioUrls: z
    .array(z.string().url())
    .max(SEEDANCE_25_LIMITS.maxAudios)
    .optional(),
  /** Seedance 2.5 edit / extend: the clip(s) to change or continue. */
  sourceVideoUrls: z
    .array(z.string().url())
    .max(SEEDANCE_25_LIMITS.maxVideos)
    .optional(),
  /** Seedance 2.5 edit / extend: what to change (edit) or how to continue (extend). */
  editInstruction: z.string().max(2000).optional(),
  firstFrameImage: ImageRoleSchema.optional(),
  lastFrameImage: ImageRoleSchema.optional(),
  multiFrameSegmentCount: z
    .number()
    .int()
    .min(1)
    .max(SEEDANCE_25_LIMITS.maxMultiFrameSegments)
    .optional(),
  subjectBrief: z.string().optional(),
  sceneDescription: z.string().optional(),
  userInstructions: z.string().optional(),
  productSku: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = BodySchema.parse(json);

    const requestId = crypto.randomUUID();
    console.log(
      `[seedance/director] ${requestId} mode=${parsed.mode} campaign=${parsed.campaignType} duration=${parsed.durationSeconds}s`
    );

    // Phase 27, D-27-08: Resolve product truth and reference images server-side.
    // Phase 27 Wave-6 (27-09): prefer categoryKey (stable slug) over categoryId
    // (project-scoped UUID); fall back to legacy categoryId if a future entry
    // sets it directly.
    const productTruth = parsed.productSku
      ? getProductTruthBySku(parsed.productSku)
      : undefined;

    let productReferenceImageUrls: string[] | undefined;
    if (productTruth?.categoryKey) {
      productReferenceImageUrls = await getProductReferenceImagesByCategoryKey(
        await createClient(),
        productTruth.categoryKey
      );
    } else if (productTruth?.categoryId) {
      productReferenceImageUrls = await getProductReferenceImagesByCategory(
        await createClient(),
        productTruth.categoryId
      );
    }

    const directorInput: DirectorInput = {
      ...(parsed as unknown as DirectorInput),
      productTruth,
      productReferenceImageUrls,
      brandDna: MASTER_BRAND_DNA,
    };

    const result = await runSeedanceDirector(directorInput);

    console.log(
      `[seedance/director] ${requestId} OK ${result.diagnostics.durationMs}ms model=${result.diagnostics.model} systemPromptId=${result.diagnostics.systemPromptId}`
    );

    return NextResponse.json({
      success: true,
      requestId,
      ...result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof SeedanceDirectorError) {
      const status = error.code === "INVALID_INPUT" ? 400 : 500;
      console.error(`[seedance/director] ${error.code}: ${error.message}`);
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[seedance/director] ERR ${message}`);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
