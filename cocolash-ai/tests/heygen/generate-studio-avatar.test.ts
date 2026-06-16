import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Phase 30 Wave 0 — RED Test Specs for Reference-Conditioning (HeyGen)
 *
 * Establishes the contract that Wave 1 implementation must satisfy:
 * - RCH-01: generateImage is called with non-empty ReferenceImage[] for seeded SKUs
 * - RCH-02: Prompt contains product-truth labels with exact Director wording
 * - RCH-03: Degraded flag is set true when SKU resolves to no reference images
 * - D-01: SKU parameter is optional; missing SKU generates text-only
 * - D-05: Per-image fetch failures are logged and omitted; only all-empty triggers degraded
 *
 * These tests are EXPECTED TO FAIL in Wave 0 (RED phase). Wave 1 implementation
 * makes them pass (GREEN phase) by implementing:
 * - productSku validation in route body
 * - getProductTruthBySku resolution
 * - getProductReferenceImagesByCategoryKey fetch
 * - Image URL → base64 encoding via fetch
 * - Product-truth block injection into prompt
 * - generateImage spy capturing referenceImages param
 */

// ──────────────────────────────────────────────────────────────────────
// Hoisted: NextRequest import for mock factory use
// ──────────────────────────────────────────────────────────────────────

const { NextRequest } = vi.hoisted(() => {
  const { NextRequest: NR } = require("next/server");
  return { NextRequest: NR };
});

// ──────────────────────────────────────────────────────────────────────
// Mocks & Test Fixtures
// ──────────────────────────────────────────────────────────────────────

/**
 * Mock getProductTruthBySku: returns ProductTruthEntry for seeded SKUs.
 * D-01 — SKU validation and resolution
 */
vi.mock("@/lib/brand/product-truth", () => ({
  getProductTruthBySku: vi.fn((sku: string) => {
    const mockData: Record<string, unknown> = {
      "single-black-tray": {
        sku: "single-black-tray",
        displayName: "Single Black Tray",
        categoryKey: "single-black-tray",
        lashType: "clusters",
        lengthRange: "6-14mm",
        bandMaterial: "cotton",
        magneticClosure: false,
        packagingType: "single-pack lash tray",
        colorTone: "black",
        retired: false,
      },
      "lash-wand": {
        sku: "lash-wand",
        displayName: "Lash Wand",
        categoryKey: undefined, // Tool with no seeded images
        lashType: "tools",
        bandMaterial: "none",
        magneticClosure: false,
        packagingType: "individual tool",
        retired: false,
      },
    };
    return mockData[sku] ?? null;
  }),
}));

/**
 * Mock getProductReferenceImagesByCategoryKey: returns URLs for seeded categories.
 * D-02 — Direct resolution via categoryKey; graceful empty array on unknown key.
 */
vi.mock("@/lib/brand/get-product-references", () => ({
  getProductReferenceImagesByCategoryKey: vi.fn(
    (supabase: unknown, categoryKey: string) => {
      const mockUrls: Record<string, string[]> = {
        "single-black-tray": [
          "https://example.com/ref-1.jpg",
          "https://example.com/ref-2.jpg",
          "https://example.com/ref-3.jpg",
        ],
      };
      return Promise.resolve(mockUrls[categoryKey] ?? []);
    }
  ),
}));

/**
 * Mock global fetch: converts URLs to base64-encoded image data.
 *
 * Two named implementations:
 * - allSuccessFetch: every ref URL fetches successfully (used by RCH-01 to prove that
 *   ALL of a SKU's reference images reach generateImage — none silently dropped).
 * - defaultFetch: fails `ref-2.jpg` so the D-05 graceful-degradation test can assert that
 *   a single failed fetch is logged and omitted while the rest still flow through.
 *
 * beforeEach re-installs defaultFetch so a per-test override (RCH-01) never leaks.
 */
function makeImageResponse(): Response {
  // Return RAW image bytes (not base64) so the route's
  // Buffer.from(await resp.arrayBuffer()).toString("base64") is exercised realistically
  // (mirrors a real HTTP image response; avoids a double-encode false-positive).
  const fakeJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // JPEG SOI marker
  return new Response(fakeJpegBytes, {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

const allSuccessFetch = async (_url: unknown): Promise<Response> => makeImageResponse();

const defaultFetch = async (url: unknown): Promise<Response> => {
  const urlStr = typeof url === "string" ? url : String(url);
  if (urlStr.includes("ref-2.jpg")) {
    throw new Error("Simulated fetch error: 500 Server Error");
  }
  return makeImageResponse();
};

global.fetch = vi.fn(defaultFetch) as typeof fetch;

/**
 * Mock generateImage: spy on calls to assert referenceImages and prompt content.
 * RCH-01 & RCH-02 — Assert refs are passed and prompt contains product-truth.
 */
const { mockGenerateImage } = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(async () => ({
    buffer: Buffer.from("fake-image-data"),
    mimeType: "image/png",
    model: "gemini-2.0-flash-001",
  })),
}));

vi.mock("@/lib/gemini/generate", () => ({
  generateImage: mockGenerateImage,
}));

/**
 * Mock uploadGeneratedImage: return fake URL.
 */
vi.mock("@/lib/supabase/storage", () => ({
  uploadGeneratedImage: vi.fn(async () => ({
    url: "https://storage.example.com/studio-avatar-123.png",
    path: "cocolash/-studio-avatar-123.png",
  })),
}));

/**
 * Mock Supabase admin client.
 */
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(async () => ({})),
  createClient: vi.fn(async () => ({})),
  getCurrentUserId: vi.fn(async () => "user-123"),
}));

/**
 * Mock video/insert-gallery-asset utilities.
 */
vi.mock("@/lib/video/insert-gallery-asset", () => ({
  buildMinimalSelectionsForVideoAsset: vi.fn(() => ({})),
  getDefaultBrandId: vi.fn(async () => "brand-123"),
  insertVideoGalleryAsset: vi.fn(async () => "gallery-image-123"),
  videoAspectToImageAspect: vi.fn((aspect: string) => {
    const map: Record<string, string> = {
      "9:16": "4:5",
      "16:9": "16:9",
    };
    return map[aspect] ?? "4:5";
  }),
}));

// Import POST after all mocks are registered
import { POST } from "@/app/api/heygen/generate-studio-avatar/route";

// ──────────────────────────────────────────────────────────────────────
// Test Suite
// ──────────────────────────────────────────────────────────────────────

describe("POST /api/heygen/generate-studio-avatar — reference conditioning", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Re-install the default fetch (fails ref-2.jpg) so a per-test override never leaks.
    vi.mocked(global.fetch).mockImplementation(defaultFetch as typeof fetch);
    mockGenerateImage.mockResolvedValueOnce({
      buffer: Buffer.from("fake-image-data"),
      mimeType: "image/png",
      model: "gemini-2.0-flash-001",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────
  // RCH-01: generateImage receives non-empty ReferenceImage[]
  // ─────────────────────────────────────────────────────────────────

  describe("RCH-01: generateImage receives non-empty ReferenceImage[]", () => {
    it("passes 3 reference images to generateImage when productSku='single-black-tray' (3 seeded images)", async () => {
      // Arrange: POST body with productSku pointing to a seeded category
      const body = {
        ethnicity: "south-asian",
        skinTone: "medium",
        ageRange: "25-35",
        hairStyle: "straight-long",
        scene: "clean-white-cyclorama",
        outfit: "neutral-button-up",
        framing: "head-chest",
        expression: "confident-teacher",
        lashStyle: "clusters",
        aspectRatio: "9:16",
        productSku: "single-black-tray", // ← D-01: SKU parameter
      };

      // RCH-01 proves that when the SKU's reference images are all available, ALL of
      // them reach generateImage (none silently dropped). Use the all-success fetch so
      // this is independent of D-05's deliberate single-image failure case.
      vi.mocked(global.fetch).mockImplementation(allSuccessFetch as typeof fetch);

      const mockRequest = new NextRequest(new URL("http://localhost:3000/api/heygen/generate-studio-avatar"), {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });

      // Act: Call POST handler
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert: generateImage was called with referenceImages array
      // RCH-01: Verify param 3 (referenceImages) is non-empty and carries all 3 refs
      expect(mockGenerateImage).toHaveBeenCalled();
      const calls = mockGenerateImage.mock.calls as unknown as [string, string, { base64Data: string; mimeType: string }[]][];
      expect(calls.length).toBeGreaterThan(0);

      const [prompt, aspect, referenceImages] = calls[0];
      expect(referenceImages).toBeDefined();
      expect(Array.isArray(referenceImages)).toBe(true);
      expect((referenceImages as unknown[]).length).toBe(3);

      // Each reference image must have base64Data and mimeType
      for (const ref of referenceImages as { base64Data: string; mimeType: string }[]) {
        expect(typeof ref.base64Data).toBe("string");
        expect(ref.mimeType).toBe("image/jpeg");
      }

      // Verify response contains imageUrl and degraded: false
      expect(responseData.imageUrl).toBeDefined();
      expect(responseData.degraded).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // RCH-02: Prompt contains product-truth labels with exact Director wording
  // ─────────────────────────────────────────────────────────────────

  describe("RCH-02: prompt contains product-truth labels with exact Director wording", () => {
    it("injects product-truth block with canonical field labels (Display name, Lash type, Band material, Magnetic closure, Packaging, Tone/colour)", async () => {
      // Arrange: Same setup as RCH-01
      const body = {
        ethnicity: "south-asian",
        skinTone: "medium",
        ageRange: "25-35",
        hairStyle: "straight-long",
        scene: "clean-white-cyclorama",
        outfit: "neutral-button-up",
        framing: "head-chest",
        expression: "confident-teacher",
        lashStyle: "clusters",
        aspectRatio: "9:16",
        productSku: "single-black-tray",
      };

      const mockRequest = new NextRequest(new URL("http://localhost:3000/api/heygen/generate-studio-avatar"), {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });

      // Act: Call POST handler
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert: Capture prompt passed to generateImage (param 1)
      expect(mockGenerateImage).toHaveBeenCalled();
      const calls = mockGenerateImage.mock.calls as unknown as [string, string, { base64Data: string; mimeType: string }[]][];
      const [prompt] = calls[0];

      // RCH-02: Assert prompt contains canonical product-truth field labels
      // These must match the Seedance Director's exact wording from product-truth-injection.test.ts
      expect(prompt as string).toMatch(/^- Display name:\s*Single Black Tray$/m);
      // Includes the optional length range, exactly like the Seedance Director (D-04 parity).
      expect(prompt as string).toMatch(/^- Lash type:\s*clusters\s*\(6-14mm\)$/m);
      expect(prompt as string).toMatch(/^- Band material:\s*cotton$/m);
      expect(prompt as string).toMatch(/^- Magnetic closure:\s*NO\s*—\s*never claim magnetic$/m);
      expect(prompt as string).toMatch(/^- Packaging:\s*single-pack lash tray$/m);
      expect(prompt as string).toMatch(/^- Tone\/colour:\s*black$/m);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // RCH-03: Degraded flag on empty references
  // ─────────────────────────────────────────────────────────────────

  describe("RCH-03: degraded flag and message on empty references", () => {
    it("returns degraded: true + exact message when productSku='lash-wand' (no seeded images)", async () => {
      // Arrange: POST with SKU that has no seeded references
      const body = {
        ethnicity: "south-asian",
        skinTone: "medium",
        ageRange: "25-35",
        hairStyle: "straight-long",
        scene: "clean-white-cyclorama",
        outfit: "neutral-button-up",
        framing: "head-chest",
        expression: "confident-teacher",
        lashStyle: "clusters",
        aspectRatio: "9:16",
        productSku: "lash-wand", // ← Tool SKU with no categoryKey/refs
      };

      const mockRequest = new NextRequest(new URL("http://localhost:3000/api/heygen/generate-studio-avatar"), {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });

      // Act: Call POST handler
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert: Response contains degraded: true and exact message (D-06)
      expect(responseData.degraded).toBe(true);
      expect(responseData.degradedMessage).toBe(
        "This product has no reference images. Output may drift toward generic or unrelated product types."
      );

      // Verify: Generation still completed (imageUrl is present)
      expect(responseData.imageUrl).toBeDefined();

      // Verify: generateImage was called (with empty or undefined referenceImages)
      expect(mockGenerateImage).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // D-01: SKU is optional
  // ─────────────────────────────────────────────────────────────────

  describe("D-01: SKU is optional; missing productSku generates text-only", () => {
    it("allows POST without productSku; degraded=false, no product-truth in prompt", async () => {
      // Arrange: POST body WITHOUT productSku
      const body = {
        ethnicity: "south-asian",
        skinTone: "medium",
        ageRange: "25-35",
        hairStyle: "straight-long",
        scene: "clean-white-cyclorama",
        outfit: "neutral-button-up",
        framing: "head-chest",
        expression: "confident-teacher",
        lashStyle: "clusters",
        aspectRatio: "9:16",
        // ← No productSku
      };

      const mockRequest = new NextRequest(new URL("http://localhost:3000/api/heygen/generate-studio-avatar"), {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });

      // Act: Call POST handler
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert: Response is successful and degraded: false
      expect(response.ok).toBe(true);
      expect(responseData.degraded).toBe(false);

      // Verify: generateImage was called
      expect(mockGenerateImage).toHaveBeenCalled();

      // Verify: prompt does NOT contain product-truth labels
      const calls = mockGenerateImage.mock.calls as unknown as [string, string, { base64Data: string; mimeType: string }[]][];
      const [prompt] = calls[0];
      expect(prompt as string).not.toMatch(/^- Display name:/m);
      expect(prompt as string).not.toMatch(/^- Lash type:/m);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Validation: canonical (space-separated) ethnicity values are accepted
  // ─────────────────────────────────────────────────────────────────

  describe("ethnicity normalization accepts the UI's canonical values", () => {
    it.each(["East Asian", "South Asian", "Middle Eastern", "east-asian", "Caucasian"])(
      "accepts ethnicity=%s without a validation error",
      async (ethnicity) => {
        const body = {
          ethnicity,
          skinTone: "Light",
          ageRange: "18-24",
          hairStyle: "Straight short",
          scene: "clean-white-cyclorama",
          outfit: "neutral-button-up",
          framing: "head-chest",
          expression: "confident-teacher",
          lashStyle: "natural",
          aspectRatio: "9:16",
        };

        const mockRequest = new NextRequest(
          new URL("http://localhost:3000/api/heygen/generate-studio-avatar"),
          { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        );

        const response = await POST(mockRequest);
        const data = await response.json();

        // The bug surfaced as a 400 "ethnicity must be one of…"; assert it's gone.
        expect(response.status).not.toBe(400);
        expect(data.error ?? "").not.toMatch(/ethnicity must be one of/);
      }
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // D-05: Per-image fetch failure is non-fatal
  // ─────────────────────────────────────────────────────────────────

  describe("D-05: per-image fetch failure is non-fatal", () => {
    it("omits failed fetch, includes successful fetches; logs warning for failed URL", async () => {
      // Arrange: Override fetch mock to simulate failure on the second image
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const body = {
        ethnicity: "south-asian",
        skinTone: "medium",
        ageRange: "25-35",
        hairStyle: "straight-long",
        scene: "clean-white-cyclorama",
        outfit: "neutral-button-up",
        framing: "head-chest",
        expression: "confident-teacher",
        lashStyle: "clusters",
        aspectRatio: "9:16",
        productSku: "single-black-tray", // ← 3 refs; fetch will fail on the 2nd
      };

      const mockRequest = new NextRequest(new URL("http://localhost:3000/api/heygen/generate-studio-avatar"), {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });

      // Act: Call POST handler
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert: generateImage was called with 2 ReferenceImage objects (1st and 3rd succeeded, 2nd failed)
      expect(mockGenerateImage).toHaveBeenCalled();
      const calls = mockGenerateImage.mock.calls as unknown as [string, string, { base64Data: string; mimeType: string }[]][];
      const [, , referenceImages] = calls[0];

      // D-05: Exactly 2 successful references
      expect((referenceImages as unknown[]).length).toBe(2);

      // Assert: console.warn was called with error for the failed URL
      // (Implementation should log: console.warn(`[heygen] Failed to fetch ref image ${url}:`, error))
      expect(warnSpy).toHaveBeenCalled();
      const warnCalls = warnSpy.mock.calls;
      const warnCall = warnCalls.find((call) => String(call[0]).includes("Failed to fetch"));
      expect(warnCall).toBeDefined();
      expect(String(warnCall?.[0])).toMatch(/ref-2\.jpg|500/);

      // Cleanup
      warnSpy.mockRestore();
    });
  });
});
