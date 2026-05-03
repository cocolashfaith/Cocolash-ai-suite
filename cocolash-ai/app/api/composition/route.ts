/**
 * POST /api/composition
 *
 * Standalone endpoint that composes a person image with a product image
 * using Gemini and returns the composed image URL. This is the primitive
 * the v4.0 mode-first UGC flow calls when "Show holding product" is ON —
 * the composed image (single URL) is what flows to Seedance, NOT two
 * separate URLs (the BROKEN-04 fix from Phase 14 audit).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { composePersonWithProduct } from "@/lib/gemini/composition";
import type { CompositionPose, AspectRatio } from "@/lib/types";

const VALID_POSES: CompositionPose[] = ["holding", "applying", "selfie", "testimonial"];
const VALID_ASPECTS: AspectRatio[] = ["1:1", "4:5", "9:16", "16:9"];

const BodySchema = z.object({
  personImageUrl: z.string().url(),
  productImageUrl: z.string().url(),
  pose: z.enum(VALID_POSES as [CompositionPose, ...CompositionPose[]]).default("holding"),
  outputAspectRatio: z
    .enum(VALID_ASPECTS as [AspectRatio, ...AspectRatio[]])
    .default("9:16"),
  brandId: z.string().default("cocolash"),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = BodySchema.parse(json);
    const requestId = crypto.randomUUID();

    console.log(
      `[composition] ${requestId} pose=${parsed.pose} aspect=${parsed.outputAspectRatio}`
    );

    const result = await composePersonWithProduct({
      personImageUrl: parsed.personImageUrl,
      productImageUrl: parsed.productImageUrl,
      pose: parsed.pose,
      brandId: parsed.brandId,
      outputAspectRatio: parsed.outputAspectRatio,
    });

    console.log(`[composition] ${requestId} OK ${result.composedImageUrl}`);

    return NextResponse.json({
      success: true,
      requestId,
      composedImageUrl: result.composedImageUrl,
      storagePath: result.storagePath,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[composition] ERR ${message}`);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
