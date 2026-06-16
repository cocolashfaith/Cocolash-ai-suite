import { describe, it, expect } from "vitest";
import { isTryOnEligible } from "@/lib/shopify/storefront";
import type { ShopifyProduct } from "@/lib/shopify/types";

/**
 * "See it on you" composites a lash style onto the user's selfie, so it must
 * only appear for wearable lashes — never for adhesives, tools, or accessories
 * (the Bond + Sealant Duo being the reported case). This pins the deterministic
 * gate, including that the adhesive/tool blocklist wins over a "lash" mention.
 */
function product(over: Partial<ShopifyProduct>): ShopifyProduct {
  return {
    id: "gid://shopify/Product/1",
    handle: "x",
    title: "X",
    description: "",
    productType: "",
    tags: [],
    totalInventory: null,
    availableForSale: true,
    featuredImage: null,
    priceRange: {
      minVariantPrice: { amount: "10", currencyCode: "USD" },
      maxVariantPrice: { amount: "10", currencyCode: "USD" },
    },
    variants: [],
    ...over,
  };
}

describe("isTryOnEligible", () => {
  it("excludes adhesives / tools / accessories (blocklist wins over 'lash')", () => {
    expect(
      isTryOnEligible(
        product({
          handle: "bond-sealant-duo",
          title: "CocoLash Bond + Sealant Duo",
          productType: "Adhesive",
        })
      )
    ).toBe(false);
    expect(isTryOnEligible(product({ title: "Lash Applicator Tool" }))).toBe(false);
    expect(isTryOnEligible(product({ title: "Lash Glue Remover" }))).toBe(false);
    expect(isTryOnEligible(product({ title: "Precision Tweezers" }))).toBe(false);
    expect(isTryOnEligible(product({ title: "CocoLash Gift Card" }))).toBe(false);
  });

  it("includes wearable lash products", () => {
    expect(
      isTryOnEligible(
        product({
          handle: "dahlia-lash-extensions",
          title: "Dahlia Lash Extensions",
          productType: "Lashes",
        })
      )
    ).toBe(true);
    expect(
      isTryOnEligible(product({ title: "Violet Cluster Lashes", tags: ["lashes"] }))
    ).toBe(true);
    expect(
      isTryOnEligible(product({ handle: "sorrel", title: "Sorrel", productType: "Lashes" }))
    ).toBe(true);
    expect(isTryOnEligible(product({ title: "Wispy Strip Lashes" }))).toBe(true);
  });

  it("defaults unknown products to false (no try-on unless clearly a lash)", () => {
    expect(isTryOnEligible(product({ title: "Mystery Box", productType: "Misc" }))).toBe(false);
  });
});
