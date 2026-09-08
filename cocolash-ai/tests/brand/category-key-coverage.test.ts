import { describe, it, expect } from "vitest";
import {
  getActiveProducts,
  KNOWN_PRODUCT_CATEGORY_KEYS,
} from "@/lib/brand/product-truth";

/**
 * Phase 27, Wave-6 (27-09) regression test.
 *
 * The fresh-context review (27-REVIEWS.md, finding #2) flagged that ALL
 * active products had `categoryId` undefined, so reference images never
 * flowed to the Director despite the upstream wiring being correct.
 *
 * After 27-09, every active non-tool product carries a `categoryKey` that
 * resolves to a row in product_categories.key at runtime. This test locks
 * that contract — adding a new lash style or kit without a categoryKey
 * (or with a key that does not exist in the live DB) will fail CI.
 */
/**
 * Seedance 2.5 (D7) exceptions to the packaging→category rule. Three SKUs get
 * their OWN category because the shared packaging category misrepresents them
 * on screen: Sorrel is a dark-brown lash but the nude-tray reference photos are
 * black, and Fern/Ivy are pre-glued half lashes that look nothing like the
 * full-kit box shots. Their images are seeded from live Shopify imagery by
 * scripts/seed-shopify-references.ts. Everything else still follows the rule.
 */
const PER_SKU_CATEGORY_EXCEPTIONS: Record<string, string> = {
  sorrel: "sorrel",
  fern: "fern",
  ivy: "ivy",
};

describe("Phase 27 — categoryKey coverage", () => {
  const active = getActiveProducts();

  it("every active product is either a tool OR has a categoryKey", () => {
    const missing = active
      .filter((p) => p.lashType !== "tools" && !p.categoryKey)
      .map((p) => p.sku);

    expect(missing).toEqual([]);
  });

  it("every categoryKey is in the known allowlist", () => {
    const allowed = new Set(KNOWN_PRODUCT_CATEGORY_KEYS);
    const invalid = active
      .filter((p) => p.categoryKey && !allowed.has(p.categoryKey))
      .map((p) => `${p.sku}=${p.categoryKey}`);

    expect(invalid).toEqual([]);
  });

  it("singles map to single-black-tray or single-nude-tray", () => {
    const singles = active.filter(
      (p) =>
        p.lashType === "clusters" &&
        p.packagingType === "single-pack lash tray"
    );

    for (const p of singles) {
      const exception = PER_SKU_CATEGORY_EXCEPTIONS[p.sku];
      if (exception) {
        expect(p.categoryKey).toBe(exception);
        continue;
      }
      expect(p.categoryKey).toMatch(/^single-(black|nude)-tray$/);
    }
  });

  it("the per-SKU exceptions are exactly Sorrel, Fern and Ivy", () => {
    const offRule = active
      .filter((p) => {
        if (p.lashType === "tools" || !p.categoryKey) return false;
        if (p.lashType === "kit") return p.categoryKey !== "full-kit-box";
        if (p.packagingType === "single-pack lash tray") {
          return !/^single-(black|nude)-tray$/.test(p.categoryKey);
        }
        if (p.packagingType === "four-pack box") return p.categoryKey !== "multi-lash-book";
        return false;
      })
      .map((p) => p.sku)
      .sort();

    expect(offRule).toEqual(["fern", "ivy", "sorrel"]);
  });

  it("four-packs map to multi-lash-book", () => {
    const fourPacks = active.filter(
      (p) =>
        p.lashType === "clusters" && p.packagingType === "four-pack box"
    );

    for (const p of fourPacks) {
      expect(p.categoryKey).toBe("multi-lash-book");
    }
  });

  it("kits map to full-kit-box", () => {
    const kits = active.filter((p) => p.lashType === "kit");

    for (const p of kits) {
      const exception = PER_SKU_CATEGORY_EXCEPTIONS[p.sku];
      if (exception) {
        expect(p.categoryKey).toBe(exception);
        continue;
      }
      expect(p.categoryKey).toBe("full-kit-box");
    }
  });
});
