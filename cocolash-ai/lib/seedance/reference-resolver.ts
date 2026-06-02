/**
 * lib/seedance/reference-resolver.ts — Reference image resolution seam
 *
 * Pure, separately-testable function that maps SKU → categoryKey → DB images
 * and shapes them per Enhancor mode. Consumed by app/api/seedance/generate/route.ts
 * before createSeedanceTask() (D-09).
 *
 * Per-mode field mapping (D-01):
 * - UGC: productImages[] + influencers[] (≤9 combined)
 * - Multi-Reference/Lip-Sync: images[] (≤9)
 * - First+Last Frames: firstFrameImage + lastFrameImage scalars
 * - Text-to-Video: all fields empty
 * - Multi-Frame: images[] (best-effort, D-03)
 *
 * Degraded signal (D-06): When SKU resolves to no refs, returns degraded:true
 * + exact message string. Generation still proceeds (text prompt anchors product).
 *
 * Request-body override (D-08): If caller supplies custom refs in requestBodyRefs,
 * those take precedence over DB refs for that field, and degraded is NOT set.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { getProductTruthBySku } from "@/lib/brand/product-truth";
import { getProductReferenceImagesByCategoryKey } from "@/lib/brand/get-product-references";
import type { SeedanceMode } from "@/lib/seedance/types";

const DEGRADED_MESSAGE =
  "This product has no reference images. Output may drift toward generic or unrelated product types.";

export interface ResolvedReferences {
  productImages: string[];
  influencerImages: string[];
  images: string[];
  firstFrameImage?: string;
  lastFrameImage?: string;
  degraded: boolean;
  degradedMessage?: string;
}

export interface RequestBodyRefs {
  products?: string[];
  influencers?: string[];
  images?: string[];
}

/**
 * Resolve SKU to reference images, apply per-mode field shaping.
 * Graceful degradation (no throw) — returns degraded flag instead.
 *
 * @param supabase - Supabase client for DB queries
 * @param sku - Product SKU from request (may be undefined)
 * @param mode - Seedance mode governing field mapping
 * @param requestBodyRefs - Optional caller-supplied refs that override DB refs (D-08)
 * @returns Resolved refs object with per-mode fields and degraded flag
 */
export async function resolveSkuReferences(
  supabase: SupabaseClient,
  sku: string | undefined,
  mode: SeedanceMode,
  requestBodyRefs?: RequestBodyRefs
): Promise<ResolvedReferences> {
  // ── Request-body overrides (D-08) ──
  // A non-empty array in requestBodyRefs wins over the DB for that field.
  // An absent/empty array means "fall back to the DB-resolved refs".
  const overrideProducts =
    requestBodyRefs?.products && requestBodyRefs.products.length > 0
      ? requestBodyRefs.products
      : undefined;
  const overrideInfluencers =
    requestBodyRefs?.influencers && requestBodyRefs.influencers.length > 0
      ? requestBodyRefs.influencers
      : undefined;
  const overrideImages =
    requestBodyRefs?.images && requestBodyRefs.images.length > 0
      ? requestBodyRefs.images
      : undefined;

  // ── DB image resolution (D-04) ──
  // Empty when the SKU is missing/unknown/a tool (no categoryKey) or the query fails.
  const productTruth = sku ? getProductTruthBySku(sku) : undefined;
  let dbImages: string[] = [];
  if (productTruth?.categoryKey) {
    try {
      dbImages = await getProductReferenceImagesByCategoryKey(
        supabase,
        productTruth.categoryKey
      );
    } catch {
      // Graceful: a DB failure resolves to no DB refs (degraded unless overridden).
      dbImages = [];
    }
  }

  // ── Per-field sources: override wins, else DB. ──
  // The DB reference library holds only PRODUCT shots, so influencers/avatars
  // come exclusively from a caller-supplied override (there is no DB source).
  const productsToUse = overrideProducts ?? dbImages;
  const influencersToUse = overrideInfluencers ?? [];
  const imagesToUse = overrideImages ?? dbImages;

  // ── Degradation (D-06) ──
  // Degraded only when NO reference is available from ANY source for this request.
  // A request-body override therefore always suppresses degraded (D-08).
  const hasAnyRef =
    productsToUse.length > 0 ||
    influencersToUse.length > 0 ||
    imagesToUse.length > 0;
  if (!hasAnyRef) {
    return {
      productImages: [],
      influencerImages: [],
      images: [],
      degraded: true,
      degradedMessage: DEGRADED_MESSAGE,
    };
  }

  // ── Per-mode field assignment (D-01, D-04) ──
  const result = applyPerModeShaping(
    productsToUse,
    influencersToUse,
    imagesToUse,
    mode
  );

  return {
    ...result,
    degraded: false,
  };
}

/**
 * Apply per-mode field shaping: assign images to the correct fields per mode.
 * Caps at mode limit (D-04): UGC products+influencers ≤9, multi_reference/lipsyncing images ≤9.
 *
 * @param productsRef - Product images (from DB or request-body override)
 * @param influencersRef - Influencer/avatar images (from request-body override or empty)
 * @param imagesRef - General images array (from request-body override or empty for modes that use it)
 * @param mode - Seedance mode governing which fields to populate
 * @returns Shaped object with per-mode fields populated
 */
function applyPerModeShaping(
  productsRef: string[],
  influencersRef: string[],
  imagesRef: string[],
  mode: SeedanceMode
): Omit<ResolvedReferences, "degraded" | "degradedMessage"> {
  const base: Omit<ResolvedReferences, "degraded" | "degradedMessage"> = {
    productImages: [],
    influencerImages: [],
    images: [],
  };

  if (mode === "ugc") {
    // UGC: products[] and influencers[] are SEPARATE Enhancor fields with a
    // ≤9 COMBINED cap. Product refs → products[]; face/avatar refs → influencers[].
    // Never collapse them into one field (would miscategorize a face as a product).
    base.productImages = productsRef.slice(0, 9);
    const remaining = Math.max(0, 9 - base.productImages.length);
    base.influencerImages = influencersRef.slice(0, remaining);
    return base;
  }

  if (mode === "multi_reference" || mode === "lipsyncing") {
    // Multi-Reference / Lip-Sync: images[] (≤9)
    // Use productsRef if it has items, otherwise use imagesRef (from DB)
    const imagesToUse = productsRef.length > 0 ? productsRef : imagesRef;
    base.images = imagesToUse.slice(0, 9);
    return base;
  }

  if (mode === "first_n_last_frames") {
    // First+Last Frames: first + optional last as scalars (not arrays)
    // Use productsRef if available, otherwise imagesRef
    const imagesToUse = productsRef.length > 0 ? productsRef : imagesRef;
    base.firstFrameImage = imagesToUse[0] ?? undefined;
    base.lastFrameImage = imagesToUse[1] ?? undefined;
    return base;
  }

  if (mode === "multi_frame") {
    // Multi-Frame: images[] (best-effort, D-03; Enhancor docs don't document this field)
    const imagesToUse = productsRef.length > 0 ? productsRef : imagesRef;
    base.images = imagesToUse.slice(0, 9);
    return base;
  }

  if (mode === "text-to-video") {
    // Text-to-Video: no image fields at all
    return base;
  }

  // Fallback (should not happen; mode is enum-constrained at type level)
  return base;
}
