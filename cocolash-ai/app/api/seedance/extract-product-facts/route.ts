/**
 * POST /api/seedance/extract-product-facts
 *
 * Runs ONE vision pass over the selected product images and returns a small,
 * structured, honest fact blob (Phase 34.1 R-34.1-04, "extract once, reuse
 * twice"). The client caches the result in wizard state and reuses it for both
 * script generation (Step 1) and the Step-3 Seedance prompt agent.
 *
 * Request body: { productImageUrls: ["https://...", ...] }  // 1–9 HTTPS URLs
 * Response:     { facts: ProductFacts }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  extractProductFacts,
  ProductFactExtractorError,
} from "@/lib/ai/director/product-fact-extractor";

const BodySchema = z.object({
  productImageUrls: z
    .array(z.string().url("Each product image URL must be a valid HTTPS URL"))
    .min(1, "At least one product image is required")
    .max(9, "Maximum 9 product images allowed"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BodySchema.parse(body);

    // Defense in depth: the extractor also enforces HTTPS, but reject early.
    for (const url of parsed.productImageUrls) {
      if (!url.startsWith("https://")) {
        return NextResponse.json(
          { error: "Product image URLs must be HTTPS" },
          { status: 400 }
        );
      }
    }

    console.log("[seedance/extract-product-facts] Extracting facts...", {
      productCount: parsed.productImageUrls.length,
    });

    const facts = await extractProductFacts(parsed.productImageUrls);

    return NextResponse.json({ facts });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof ProductFactExtractorError) {
      console.error(
        `[seedance/extract-product-facts] (${error.code}):`,
        error.message
      );
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "INVALID_INPUT" ? 400 : 500 }
      );
    }
    console.error("[seedance/extract-product-facts] Unexpected error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to extract product facts",
      },
      { status: 500 }
    );
  }
}
