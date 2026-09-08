import { describe, it, expect, vi, beforeEach } from "vitest";
import * as storefront from "@/lib/shopify/storefront";
import { ShopifyError, type ShopifyProduct } from "@/lib/shopify/types";
import { GET } from "@/app/api/shopify/product-images/route";

/**
 * Package C — GET /api/shopify/product-images (D7).
 *
 * The wizard's "Store products" tab needs EVERY image of every product, not
 * just `featuredImage`. Enhancor rejects WebP/AVIF/GIF, so only PNG/JPEG
 * originals may be handed to the picker.
 */

vi.mock("@/lib/shopify/storefront");

const CDN = "https://cdn.shopify.com/s/files/1/0660/8646/9831/files";

function product(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: "gid://shopify/Product/1",
    handle: "sorrel",
    title: "Sorrel",
    description: "Meet Sorrel…",
    productType: "Brown Volume Lash",
    tags: [],
    totalInventory: 10,
    availableForSale: true,
    featuredImage: { url: `${CDN}/Sorel_Dark_Brown.png?v=1`, altText: "kit_1" },
    images: [
      { url: `${CDN}/Sorel_Dark_Brown.png?v=1`, altText: "kit_1", width: 800, height: 800 },
      { url: `${CDN}/Productwithbox2.jpg?v=2`, altText: null, width: 800, height: 800 },
      { url: `${CDN}/animated.webp?v=3`, altText: null },
      { url: `${CDN}/loop.gif?v=4`, altText: null },
    ],
    priceRange: {
      minVariantPrice: { amount: "18.00", currencyCode: "USD" },
      maxVariantPrice: { amount: "18.00", currencyCode: "USD" },
    },
    variants: [],
    ...overrides,
  };
}

describe("GET /api/shopify/product-images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns every PNG/JPEG image per product and filters webp/gif", async () => {
    vi.mocked(storefront.listProductsWithImages).mockResolvedValue([product()]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.products).toHaveLength(1);
    const p = data.products[0];
    expect(p).toMatchObject({
      handle: "sorrel",
      title: "Sorrel",
      productType: "Brown Volume Lash",
      available: true,
    });
    expect(p.images).toHaveLength(2);
    expect(p.images[0]).toEqual({
      url: `${CDN}/Sorel_Dark_Brown.png?v=1`,
      alt: "kit_1",
      width: 800,
      height: 800,
    });
    // the ?v= query string is part of the Shopify URL — never strip it
    expect(p.images[1].url).toContain("?v=2");
    expect(p.images[1].alt).toBeNull();
    expect(JSON.stringify(data)).not.toContain(".webp");
    expect(JSON.stringify(data)).not.toContain(".gif");
    expect(typeof data.fetchedAt).toBe("string");
    expect(typeof data.cached).toBe("boolean");
  });

  it("keeps products that have no usable image (handle still selectable)", async () => {
    vi.mocked(storefront.listProductsWithImages).mockResolvedValue([
      product({ handle: "fan", images: [], featuredImage: null }),
    ]);
    const res = await GET();
    const data = await res.json();
    expect(data.products[0].handle).toBe("fan");
    expect(data.products[0].images).toEqual([]);
  });

  it("falls back to featuredImage when the images connection is absent", async () => {
    vi.mocked(storefront.listProductsWithImages).mockResolvedValue([
      product({ images: undefined }),
    ]);
    const res = await GET();
    const data = await res.json();
    expect(data.products[0].images).toHaveLength(1);
    expect(data.products[0].images[0].url).toContain("Sorel_Dark_Brown.png");
  });

  it("ignores malformed URLs instead of throwing", async () => {
    vi.mocked(storefront.listProductsWithImages).mockResolvedValue([
      product({ images: [{ url: "not-a-url", altText: null }] }),
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).products[0].images).toEqual([]);
  });

  it("returns 503 shopify_not_configured when the token is missing", async () => {
    vi.mocked(storefront.listProductsWithImages).mockRejectedValue(
      new ShopifyError("SHOPIFY_STOREFRONT_API_TOKEN not configured", 500, "missing_api_key")
    );
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "shopify_not_configured" });
  });

  it("returns 502 shopify_unavailable on any other Shopify failure", async () => {
    vi.mocked(storefront.listProductsWithImages).mockRejectedValue(
      new ShopifyError("Storefront HTTP 500", 500, "graphql_error")
    );
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "shopify_unavailable" });
  });

  it("returns 502 on an unexpected error", async () => {
    vi.mocked(storefront.listProductsWithImages).mockRejectedValue(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
