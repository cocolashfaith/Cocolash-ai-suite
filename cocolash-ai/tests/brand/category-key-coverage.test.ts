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
describe("Phase 27 — categoryKey coverage", () => {
  const active = getActiveProducts();

  it("every active product is either a tool OR has a categoryKey", () => {
    const missing = active
      .filter((p) => p.lashType !== "tools" && !p.categoryKey)
      .map((p) => p.sku);

    expect(missing).toEqual([]);
  });

  it("every categoryKey is in the known seven-key allowlist", () => {
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
      expect(p.categoryKey).toMatch(/^single-(black|nude)-tray$/);
    }
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
      expect(p.categoryKey).toBe("full-kit-box");
    }
  });
});
