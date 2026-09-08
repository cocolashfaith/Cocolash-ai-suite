import { describe, it, expect } from "vitest";
import {
  KNOWN_PRODUCT_CATEGORY_KEYS,
  getActiveProducts,
  getProductTruthByHandle,
  getProductTruthBySku,
} from "@/lib/brand/product-truth";
import { getProductReferenceImagesByCategoryKey } from "@/lib/brand/get-product-references";

/**
 * Sorrel / Fern / Ivy reference-image resolution.
 *
 * ORIGINALLY (Phase 31 DAT-02) this file asserted Sorrel resolved via the
 * shared `single-nude-tray` category and called the remaining gap "cosmetic".
 * Seedance 2.5 discovery proved that is wrong in a way that shows up in every
 * render: the five nude-tray reference photos are BLACK lashes, while Sorrel
 * is Shopify's "Brown Volume Lash" — so grounding a Sorrel video on them
 * produced the wrong colour on screen. D7 therefore gives Sorrel (and the two
 * half-lash kits, which the packaging categories describe equally badly) their
 * own per-SKU categories, seeded from the live Shopify imagery by
 * scripts/seed-shopify-references.ts.
 *
 * Updated deliberately by Wave 1 package C.
 */
describe("D7 — Sorrel resolves to its own dark-brown reference set", () => {
  it("Sorrel maps to the `sorrel` category, not the black-lash nude tray", () => {
    const sorrelTruth = getProductTruthBySku("sorrel");

    expect(sorrelTruth).toBeDefined();
    expect(sorrelTruth?.sku).toBe("sorrel");
    expect(sorrelTruth?.categoryKey).toBe("sorrel");
    expect(sorrelTruth?.categoryKey).not.toBe("single-nude-tray");

    // Physical truth is unchanged — only the image source moved.
    expect(sorrelTruth?.colorTone).toBe("dark warm brown");
    expect(sorrelTruth?.packagingType).toBe("single-pack lash tray");
    expect(sorrelTruth?.lashType).toBe("clusters");
    expect(sorrelTruth?.magneticClosure).toBe(false);
  });

  it("Sorrel-4pack keeps resolving via multi-lash-book (the four-pack book is shared)", () => {
    const sorrel4packTruth = getProductTruthBySku("sorrel-4pack");

    expect(sorrel4packTruth).toBeDefined();
    expect(sorrel4packTruth?.categoryKey).toBe("multi-lash-book");
    expect(sorrel4packTruth?.packagingType).toBe("four-pack box");
  });

  it("the resolver chain is complete: SKU → known categoryKey → images", () => {
    const sorrelTruth = getProductTruthBySku("sorrel");

    expect(sorrelTruth?.categoryKey).toBeTruthy();
    expect(KNOWN_PRODUCT_CATEGORY_KEYS).toContain(sorrelTruth?.categoryKey);
    expect(getProductReferenceImagesByCategoryKey).toBeDefined();
  });

  it("no active SKU is grounded on the nude tray any more (Sorrel was its only user)", () => {
    // Documented consequence of D7: `single-nude-tray` keeps its five seeded
    // rows in product_categories, but no product points at it — Sorrel was the
    // sole consumer, and those photos are black lashes.
    const stillNude = getActiveProducts()
      .filter((p) => p.categoryKey === "single-nude-tray")
      .map((p) => p.sku);

    expect(stillNude).toEqual([]);
    expect(getProductTruthBySku("violet")?.categoryKey).toBe("single-black-tray");
  });
});

describe("D7 — Fern and Ivy exist with facts taken from live Shopify copy", () => {
  const halfLashKits = ["fern", "ivy"] as const;

  it.each(halfLashKits)("%s has its own per-SKU category", (sku) => {
    const truth = getProductTruthBySku(sku);
    expect(truth).toBeDefined();
    expect(truth?.categoryKey).toBe(sku);
    expect(KNOWN_PRODUCT_CATEGORY_KEYS).toContain(truth?.categoryKey);
  });

  it.each(halfLashKits)("%s resolves by its live Shopify handle", (handle) => {
    expect(getProductTruthByHandle(handle)?.sku).toBe(handle);
  });

  it.each(halfLashKits)(
    "%s makes NO magnetic-closure claim (the Shopify copy says nothing about one)",
    (sku) => {
      const truth = getProductTruthBySku(sku);
      expect(truth?.magneticClosure).toBe(false);
      expect(truth?.packagingType).toBe("half lash kit box");
      expect(truth?.packagingType).not.toMatch(/magnet/i);
    }
  );

  it("uses the display names Shopify shows customers", () => {
    expect(getProductTruthBySku("fern")?.displayName).toBe("Fern Half Lash Kit");
    expect(getProductTruthBySku("ivy")?.displayName).toBe("Ivy Half Lash Kit");
  });

  it("records the pre-glued design that both descriptions lead with", () => {
    for (const sku of halfLashKits) {
      expect(getProductTruthBySku(sku)?.kitContents).toEqual(["pre-glued half lashes"]);
    }
  });
});
