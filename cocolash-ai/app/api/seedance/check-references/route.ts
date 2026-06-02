import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveSkuReferences } from "@/lib/seedance/reference-resolver";
import type { SeedanceMode } from "@/lib/seedance/types";

/**
 * GET /api/seedance/check-references?sku=X&mode=Y
 *
 * Lightweight pre-check endpoint that returns { degraded, degradedMessage? }
 * for a given SKU and seedance mode. Reuses resolveSkuReferences from Phase 29
 * without triggering external generation (no Enhancor API call).
 *
 * Per Phase 31 D-04, this enables the frontend (Step3) to warn the user
 * before they click "Generate" if the SKU has no reference images.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get("sku");
    const modeParam = searchParams.get("mode");

    if (!sku || !modeParam) {
      return NextResponse.json(
        { error: "sku and mode query parameters are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const mode = modeParam as SeedanceMode;

    // Reuse the resolver without any request-body overrides (pure DB lookup)
    const { degraded, degradedMessage } = await resolveSkuReferences(
      supabase,
      sku,
      mode,
      undefined
    );

    return NextResponse.json({
      degraded,
      ...(degradedMessage && { degradedMessage }),
    });
  } catch (error) {
    console.error("Error in check-references endpoint:", error);
    return NextResponse.json(
      { error: "Failed to check reference status" },
      { status: 500 }
    );
  }
}
