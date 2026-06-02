import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSkuReferences } from "@/lib/seedance/reference-resolver";
import { getProductReferenceImagesByCategoryKey } from "@/lib/brand/get-product-references";
import { getProductTruthBySku } from "@/lib/brand/product-truth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeedanceMode } from "@/lib/seedance/types";

/**
 * Mock DB functions so tests don't make live Supabase calls.
 * Tests define the contract for resolveSkuReferences() which will be
 * implemented in Wave 1.
 */
vi.mock("@/lib/brand/get-product-references");
vi.mock("@/lib/brand/product-truth");

/**
 * Phase 29 Wave 0: RED phase specs for resolveSkuReferences()
 * These tests verify:
 * - RCS-01: SKU resolution returns correct image URLs per mode
 * - RCS-04: Resolution failure → degraded flag + message (D-06)
 * - D-04: Per-mode image count capping (UGC: products+influencers ≤9, multi_reference: ≤9, etc.)
 * - D-08: Request-body refs take precedence over DB refs
 * - D-01: Per-mode field assignment (products, influencers, images, first_frame_image, last_frame_image)
 *
 * All tests are expected to FAIL (RED) until Wave 1 implementation.
 */
describe("resolveSkuReferences — SKU resolution (RCS-01, D-04)", () => {
  let mockSupabase: SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {} as SupabaseClient;
  });

  it("resolves single-black-tray (5 images, UGC mode) and returns all images, degraded false", async () => {
    // Arrange: Mock getProductTruthBySku to return categoryKey
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "single-black-tray",
      displayName: "Single Black Tray",
      lashType: "clusters",
      bandMaterial: "plastic",
      magneticClosure: false,
      packagingType: "single-pack lash tray",
      colorTone: "black",
      retired: false,
      categoryKey: "single-black-tray",
    } as any);

    // Mock getProductReferenceImagesByCategoryKey to return 5 test URLs
    vi.mocked(getProductReferenceImagesByCategoryKey).mockResolvedValueOnce([
      "https://example.com/single-black-tray-1.jpg",
      "https://example.com/single-black-tray-2.jpg",
      "https://example.com/single-black-tray-3.jpg",
      "https://example.com/single-black-tray-4.jpg",
      "https://example.com/single-black-tray-5.jpg",
    ]);

    // Act
    const result = await resolveSkuReferences(
      mockSupabase,
      "single-black-tray",
      "ugc",
      undefined
    );

    // Assert: RCS-01 — all 5 images in productImages, degraded false
    expect(result.productImages).toHaveLength(5);
    expect(result.productImages).toContain(
      "https://example.com/single-black-tray-1.jpg"
    );
    expect(result.degraded).toBe(false);
  });

  it("resolves full-kit-box (8 images, multi_reference mode) and returns in images array", async () => {
    // Arrange
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "full-kit-box",
      displayName: "Full Kit Box",
      lashType: "kit",
      bandMaterial: "none",
      magneticClosure: true,
      packagingType: "full magnetic kit box",
      colorTone: "multicolor",
      retired: false,
      categoryKey: "full-kit-box",
    } as any);

    vi.mocked(getProductReferenceImagesByCategoryKey).mockResolvedValueOnce(
      Array.from({ length: 8 }, (_, i) => `https://example.com/kit-${i + 1}.jpg`)
    );

    // Act
    const result = await resolveSkuReferences(
      mockSupabase,
      "full-kit-box",
      "multi_reference",
      undefined
    );

    // Assert: RCS-01 — 8 images in images array (not productImages), degraded false
    expect(result.images).toHaveLength(8);
    expect(result.productImages).toHaveLength(0);
    expect(result.degraded).toBe(false);
  });

  it("caps UGC products+influencers to 9 combined when category has 12 images", async () => {
    // Arrange: Mock 12 images, UGC mode should cap to 9
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "sku-with-12",
      displayName: "Test SKU",
      lashType: "clusters",
      bandMaterial: "plastic",
      magneticClosure: false,
      packagingType: "test",
      colorTone: "black",
      retired: false,
      categoryKey: "single-black-tray",
    } as any);

    vi.mocked(getProductReferenceImagesByCategoryKey).mockResolvedValueOnce(
      Array.from({ length: 12 }, (_, i) => `https://example.com/img-${i + 1}.jpg`)
    );

    // Act
    const result = await resolveSkuReferences(
      mockSupabase,
      "sku-with-12",
      "ugc",
      undefined
    );

    // Assert: D-04 — products + influencers combined ≤ 9
    const combinedCount =
      result.productImages.length + result.influencerImages.length;
    expect(combinedCount).toBeLessThanOrEqual(9);
  });
});

describe("resolveSkuReferences — degraded flag (RCS-04, D-06)", () => {
  let mockSupabase: SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {} as SupabaseClient;
  });

  it("returns degraded:true + exact message for lash-wand (no categoryKey)", async () => {
    // Arrange: Mock getProductTruthBySku to return product without categoryKey
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "lash-wand",
      displayName: "Lash Wand",
      lashType: "tools",
      bandMaterial: "none",
      magneticClosure: false,
      packagingType: "tool",
      colorTone: "black",
      retired: false,
      // categoryKey is undefined (tools have no references)
    } as any);

    // Act
    const result = await resolveSkuReferences(
      mockSupabase,
      "lash-wand",
      "ugc",
      undefined
    );

    // Assert: RCS-04, D-06 — degraded true with exact message
    expect(result.degraded).toBe(true);
    expect(result.degradedMessage).toBe(
      "This product has no reference images. Output may drift toward generic or unrelated product types."
    );
  });

  it("returns degraded:true when category resolves but image list is empty", async () => {
    // Arrange
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "some-sku",
      displayName: "Some SKU",
      lashType: "clusters",
      bandMaterial: "plastic",
      magneticClosure: false,
      packagingType: "test",
      colorTone: "black",
      retired: false,
      categoryKey: "single-black-tray",
    } as any);

    // Mock empty image list
    vi.mocked(getProductReferenceImagesByCategoryKey).mockResolvedValueOnce([]);

    // Act
    const result = await resolveSkuReferences(
      mockSupabase,
      "some-sku",
      "ugc",
      undefined
    );

    // Assert: RCS-04 — degraded true
    expect(result.degraded).toBe(true);
  });

  it("returns degraded:true when getProductTruthBySku returns undefined", async () => {
    // Arrange: Unknown SKU
    vi.mocked(getProductTruthBySku).mockReturnValueOnce(undefined as any);

    // Act
    const result = await resolveSkuReferences(
      mockSupabase,
      "unknown-sku",
      "ugc",
      undefined
    );

    // Assert: RCS-04 — degraded true
    expect(result.degraded).toBe(true);
  });
});

describe("resolveSkuReferences — request-body override (D-08)", () => {
  let mockSupabase: SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {} as SupabaseClient;
  });

  it("uses request-body products when provided, ignores DB, degraded stays false", async () => {
    // Arrange
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "sku",
      displayName: "Test",
      lashType: "clusters",
      bandMaterial: "plastic",
      magneticClosure: false,
      packagingType: "test",
      colorTone: "black",
      retired: false,
      categoryKey: "single-black-tray",
    } as any);

    // Mock DB returns 3 URLs (will be ignored)
    vi.mocked(getProductReferenceImagesByCategoryKey).mockResolvedValueOnce([
      "https://db.com/1.jpg",
      "https://db.com/2.jpg",
      "https://db.com/3.jpg",
    ]);

    // Act: requestBodyRefs takes precedence
    const result = await resolveSkuReferences(
      mockSupabase,
      "sku",
      "ugc",
      { products: ["https://custom.jpg"], influencers: [] }
    );

    // Assert: D-08 — custom URL used, DB ignored, degraded NOT set
    expect(result.productImages).toEqual(["https://custom.jpg"]);
    expect(result.degraded).toBe(false);
  });

  it("uses DB refs when request-body products array is empty", async () => {
    // Arrange
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "sku",
      displayName: "Test",
      lashType: "clusters",
      bandMaterial: "plastic",
      magneticClosure: false,
      packagingType: "test",
      colorTone: "black",
      retired: false,
      categoryKey: "single-black-tray",
    } as any);

    // Mock DB returns 5 URLs
    vi.mocked(getProductReferenceImagesByCategoryKey).mockResolvedValueOnce([
      "https://db.com/1.jpg",
      "https://db.com/2.jpg",
      "https://db.com/3.jpg",
      "https://db.com/4.jpg",
      "https://db.com/5.jpg",
    ]);

    // Act: empty request-body falls back to DB
    const result = await resolveSkuReferences(
      mockSupabase,
      "sku",
      "ugc",
      { products: [], influencers: [] }
    );

    // Assert: D-08 — DB refs used as fallback
    expect(result.productImages).toHaveLength(5);
  });
});

describe("resolveSkuReferences — mode-specific field assignment (D-01)", () => {
  let mockSupabase: SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {} as SupabaseClient;
  });

  it("assigns images to first_frame_image/last_frame_image scalars for first_n_last_frames mode", async () => {
    // Arrange
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "sku",
      displayName: "Test",
      lashType: "clusters",
      bandMaterial: "plastic",
      magneticClosure: false,
      packagingType: "test",
      colorTone: "black",
      retired: false,
      categoryKey: "single-black-tray",
    } as any);

    vi.mocked(getProductReferenceImagesByCategoryKey).mockResolvedValueOnce([
      "https://example.com/0.jpg",
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
      "https://example.com/3.jpg",
      "https://example.com/4.jpg",
    ]);

    // Act
    const result = await resolveSkuReferences(
      mockSupabase,
      "sku",
      "first_n_last_frames",
      undefined
    );

    // Assert: D-01 — first/last are scalars, not arrays
    expect(typeof result.firstFrameImage).toBe("string");
    expect(result.firstFrameImage).toBe("https://example.com/0.jpg");
    expect(typeof result.lastFrameImage).toBe("string");
    expect(result.lastFrameImage).toBe("https://example.com/1.jpg");
    expect(result.images).toHaveLength(0);
  });

  it("assigns images to images[] for lipsyncing mode (not influencers)", async () => {
    // Arrange
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "sku",
      displayName: "Test",
      lashType: "clusters",
      bandMaterial: "plastic",
      magneticClosure: false,
      packagingType: "test",
      colorTone: "black",
      retired: false,
      categoryKey: "single-black-tray",
    } as any);

    vi.mocked(getProductReferenceImagesByCategoryKey).mockResolvedValueOnce([
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
      "https://example.com/3.jpg",
      "https://example.com/4.jpg",
    ]);

    // Act
    const result = await resolveSkuReferences(
      mockSupabase,
      "sku",
      "lipsyncing",
      undefined
    );

    // Assert: D-01 — images array populated, not influencers
    expect(result.images).toHaveLength(4);
    expect(result.influencerImages).toHaveLength(0);
  });
});

/**
 * Regression coverage for the two CRITICAL findings fixed post-code-review:
 * 1. UGC must keep products[] and influencers[] as SEPARATE fields (never collapse
 *    a face/avatar ref into products[]).
 * 2. A request-body override must SUPPRESS degraded and be used, even when the SKU
 *    is unknown/a tool (D-08 must win over the invalid-SKU degraded path).
 */
describe("resolveSkuReferences — UGC separate fields + override regressions (D-01, D-08)", () => {
  let mockSupabase: SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {} as SupabaseClient;
  });

  it("UGC: keeps DB product refs in products[] and caller influencer in influencers[] (no cross-contamination)", async () => {
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "single-black-tray",
      displayName: "Single Black Tray",
      lashType: "clusters",
      bandMaterial: "plastic",
      magneticClosure: false,
      packagingType: "single-pack lash tray",
      colorTone: "black",
      retired: false,
      categoryKey: "single-black-tray",
    } as any);
    vi.mocked(getProductReferenceImagesByCategoryKey).mockResolvedValueOnce([
      "https://db.com/p1.jpg",
      "https://db.com/p2.jpg",
      "https://db.com/p3.jpg",
    ]);

    const result = await resolveSkuReferences(mockSupabase, "single-black-tray", "ugc", {
      influencers: ["https://faces.com/avatar.jpg"],
    });

    // products[] holds ONLY the DB product shots
    expect(result.productImages).toEqual([
      "https://db.com/p1.jpg",
      "https://db.com/p2.jpg",
      "https://db.com/p3.jpg",
    ]);
    // influencers[] holds ONLY the caller-supplied face — and it is NOT in products[]
    expect(result.influencerImages).toEqual(["https://faces.com/avatar.jpg"]);
    expect(result.productImages).not.toContain("https://faces.com/avatar.jpg");
    expect(result.degraded).toBe(false);
  });

  it("UGC: combined products+influencers cap is 9, splitting across both fields", async () => {
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "sku",
      displayName: "Test",
      lashType: "clusters",
      bandMaterial: "plastic",
      magneticClosure: false,
      packagingType: "test",
      colorTone: "black",
      retired: false,
      categoryKey: "single-black-tray",
    } as any);
    // 8 DB product images
    vi.mocked(getProductReferenceImagesByCategoryKey).mockResolvedValueOnce(
      Array.from({ length: 8 }, (_, i) => `https://db.com/p${i + 1}.jpg`)
    );

    const result = await resolveSkuReferences(mockSupabase, "sku", "ugc", {
      influencers: ["https://faces.com/a.jpg", "https://faces.com/b.jpg", "https://faces.com/c.jpg"],
    });

    // 8 products + only 1 influencer fits under the ≤9 combined cap
    expect(result.productImages).toHaveLength(8);
    expect(result.influencerImages).toHaveLength(1);
    expect(result.productImages.length + result.influencerImages.length).toBe(9);
  });

  it("override suppresses degraded even for a tool SKU with no categoryKey (D-08 > invalid-SKU)", async () => {
    vi.mocked(getProductTruthBySku).mockReturnValueOnce({
      sku: "lash-wand",
      displayName: "Lash Wand",
      lashType: "tools",
      bandMaterial: "none",
      magneticClosure: false,
      packagingType: "tool",
      colorTone: "black",
      retired: false,
      // no categoryKey
    } as any);

    const result = await resolveSkuReferences(mockSupabase, "lash-wand", "ugc", {
      products: ["https://custom.com/uploaded-product.jpg"],
    });

    expect(result.degraded).toBe(false);
    expect(result.degradedMessage).toBeUndefined();
    expect(result.productImages).toEqual(["https://custom.com/uploaded-product.jpg"]);
  });

  it("override images suppress degraded for an unknown SKU (getProductTruthBySku undefined)", async () => {
    vi.mocked(getProductTruthBySku).mockReturnValueOnce(undefined as any);

    const result = await resolveSkuReferences(mockSupabase, "unknown-sku", "multi_reference", {
      images: ["https://custom.com/ref1.jpg", "https://custom.com/ref2.jpg"],
    });

    expect(result.degraded).toBe(false);
    expect(result.images).toEqual([
      "https://custom.com/ref1.jpg",
      "https://custom.com/ref2.jpg",
    ]);
  });
});
