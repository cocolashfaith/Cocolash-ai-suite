/**
 * Package C — the product-truth database is switched on and can describe a lid.
 *
 * Two defects are locked down here, both from
 * docs/seedance-2.5/05-GROUNDING-FIX.md:
 *
 *  1. HANDLE DRIFT (root cause #5, §4 C). Ten of the sixteen live Shopify
 *     handles did not match `productHandle` — the truth rows said "violet",
 *     "daisy", "iris" while the store says "violet-subtle-charm",
 *     "daisy-lash-kit", "iris-striking-drama". `getProductTruthByHandle()`
 *     therefore resolved nothing at all and had zero callers.
 *
 *  2. AN UNREPRESENTABLE LID (root cause #7). The schema had no field for lids,
 *     mirrors, transparency or finish, so "glass cover" was literally
 *     inexpressible and therefore uncheckable. The four full-kit rows now carry
 *     the construction established in §1 by opening the real photographs.
 */

import { describe, it, expect } from "vitest";
import {
  LIVE_SHOPIFY_PRODUCT_HANDLES,
  PRODUCT_TRUTH,
  getActiveProducts,
  getProductTruthByHandle,
  getProductTruthBySku,
  getProductTruthEntriesByHandle,
  resolveCategoryKeyToSku,
} from "@/lib/brand/product-truth";
import { KB_SKIP_PRODUCT_HANDLES } from "@/lib/shopify/kb-exclusions";

const FULL_KITS = ["kit-daisy", "kit-dahlia", "kit-violet", "kit-sorrel"] as const;

describe("handle drift — every live Shopify handle resolves", () => {
  it("lists sixteen live handles", () => {
    expect(new Set(LIVE_SHOPIFY_PRODUCT_HANDLES).size).toBe(16);
  });

  it.each(LIVE_SHOPIFY_PRODUCT_HANDLES)("%s resolves to a truth row", (handle) => {
    const entry = getProductTruthByHandle(handle);
    expect(entry, `no PRODUCT_TRUTH entry carries the handle "${handle}"`).toBeDefined();
    expect(entry?.productHandle).toBe(handle);
  });

  it("resolves the ten handles that used to be wrong", () => {
    const corrected: Record<string, string> = {
      "violet-subtle-charm": "violet",
      "daisy-lash-kit": "daisy",
      "dahlia-lash-extensions": "dahlia",
      "iris-striking-drama": "iris",
      "peony-soft-sophistication": "peony",
      "jasmine-delicate-beauty": "jasmine",
      "marigold-radiant-warmth": "marigold",
      "orchid-exotic-sophistication": "orchid",
      "poppy-dramatic-allure": "poppy",
      "rose-romantic-boldness": "rose",
    };
    for (const [handle, sku] of Object.entries(corrected)) {
      expect(getProductTruthByHandle(handle)?.sku).toBe(sku);
    }
  });

  it("no entry keeps a bare style name as its handle any more", () => {
    const stale = PRODUCT_TRUTH.filter((p) =>
      ["violet", "daisy", "dahlia", "iris", "peony", "jasmine", "marigold", "orchid", "poppy", "rose"].includes(
        p.productHandle ?? ""
      )
    ).map((p) => p.sku);
    expect(stale).toEqual([]);
  });

  it("a 4-pack shares its parent product's handle and resolves to the single", () => {
    expect(getProductTruthBySku("violet-4pack")?.productHandle).toBe(
      getProductTruthBySku("violet")?.productHandle
    );
    // getProductTruthByHandle returns the base variant, not the bundle.
    expect(getProductTruthByHandle("violet-subtle-charm")?.sku).toBe("violet");
    expect(
      getProductTruthEntriesByHandle("violet-subtle-charm").map((p) => p.sku)
    ).toEqual(["violet", "violet-4pack"]);
  });

  it("all four kits share one handle; the base variant comes back first", () => {
    expect(
      getProductTruthEntriesByHandle("cocolash-kit-ultimate-lash-essentials").map(
        (p) => p.sku
      )
    ).toEqual([...FULL_KITS]);
    expect(getProductTruthByHandle("cocolash-kit-ultimate-lash-essentials")?.sku).toBe(
      "kit-daisy"
    );
  });

  it("the handles Coco is told to skip still resolve here, so prompts can be checked", () => {
    // Presence in PRODUCT_TRUTH must not make a hidden product recommendable —
    // that gate lives in lib/shopify/kb-exclusions.ts and is handle-based.
    for (const handle of KB_SKIP_PRODUCT_HANDLES) {
      expect(getProductTruthByHandle(handle), handle).toBeDefined();
    }
    expect(KB_SKIP_PRODUCT_HANDLES.has("cocolash-bond-sealant-duo")).toBe(true);
  });

  it("returns undefined for an unknown handle", () => {
    expect(getProductTruthByHandle("not-a-real-handle")).toBeUndefined();
    expect(getProductTruthEntriesByHandle("not-a-real-handle")).toEqual([]);
  });
});

describe("full kit construction — §1 ground truth, read off the photographs", () => {
  it.each(FULL_KITS)("%s records the real box", (sku) => {
    const kit = getProductTruthBySku(sku);
    expect(kit).toBeDefined();
    expect(kit?.exteriorColor).toBe("tan");
    expect(kit?.interiorColor).toBe("black");
    expect(kit?.boxMaterial).toBe("rigid board");
    expect(kit?.finish).toBe("matte");
    expect(kit?.lidType).toBe("book");
    expect(kit?.magneticClosure).toBe(true);
  });

  it.each(FULL_KITS)("%s has the mirror that is genuinely there", (sku) => {
    // The Director was RIGHT about this one — the mirror is visible in the
    // images. It is the glass cover that was invented.
    expect(getProductTruthBySku(sku)?.hasMirror).toBe(true);
  });

  it.each(FULL_KITS)("%s is not see-through anywhere", (sku) => {
    expect(getProductTruthBySku(sku)?.transparentWindow).toBe(false);
  });

  it.each(FULL_KITS)("%s lists the six real contents, not the old nine", (sku) => {
    const contents = getProductTruthBySku(sku)?.kitContents ?? [];
    expect(contents).toHaveLength(6);
    const joined = contents.join(" | ").toLowerCase();
    for (const item of [
      "bond + sealant",
      "remover",
      "tweezers",
      "applicator",
      "scissors",
      "lash case",
    ]) {
      expect(joined, `missing "${item}"`).toContain(item);
    }
    // The nine-item list invented a curved tweezer and a spoolie.
    expect(joined).not.toContain("spoolie");
    expect(joined).not.toContain("curved");
  });

  it("names the bundled lash style so the four kits stay distinguishable", () => {
    expect(getProductTruthBySku("kit-sorrel")?.kitContents?.join(" ")).toContain("Sorrel");
    expect(getProductTruthBySku("kit-violet")?.kitContents?.join(" ")).toContain("Violet");
  });

  it("claims glass nowhere in the entire database", () => {
    const glass = PRODUCT_TRUTH.filter((p) =>
      /glass|crystal/i.test(
        [p.packagingType, p.boxMaterial, p.finish, p.bestFor, ...(p.kitContents ?? [])]
          .filter(Boolean)
          .join(" ")
      )
    ).map((p) => p.sku);
    expect(glass).toEqual([]);
  });
});

describe("hasMirror is an assertion, not a guess", () => {
  it("is true only for the four full kits", () => {
    const mirrored = PRODUCT_TRUTH.filter((p) => p.hasMirror === true).map((p) => p.sku);
    expect(mirrored.sort()).toEqual([...FULL_KITS].sort());
  });

  it("is explicitly false everywhere else, so a mirror claim is correctable", () => {
    const unset = getActiveProducts()
      .filter((p) => p.hasMirror === undefined)
      .map((p) => p.sku);
    expect(unset).toEqual([]);
  });
});

describe("category → SKU resolution", () => {
  it("resolves the three one-to-one categories", () => {
    expect(resolveCategoryKeyToSku("sorrel")).toBe("sorrel");
    expect(resolveCategoryKeyToSku("fern")).toBe("fern");
    expect(resolveCategoryKeyToSku("ivy")).toBe("ivy");
  });

  it("resolves full-kit-box to the base kit variant", () => {
    expect(resolveCategoryKeyToSku("full-kit-box")).toBe("kit-daisy");
  });

  it("refuses categories that cover many different styles", () => {
    for (const key of [
      "single-black-tray",
      "single-nude-tray",
      "multi-lash-book",
      "full-kit-pouch",
      "storage-pouch",
      "branding-flatlay",
      "custom-uploads",
    ]) {
      expect(resolveCategoryKeyToSku(key), key).toBeUndefined();
    }
  });

  it("is safe on empty input", () => {
    expect(resolveCategoryKeyToSku(undefined)).toBeUndefined();
    expect(resolveCategoryKeyToSku(null)).toBeUndefined();
    expect(resolveCategoryKeyToSku("")).toBeUndefined();
    expect(resolveCategoryKeyToSku("nope")).toBeUndefined();
  });

  it("only ever names a SKU that exists", () => {
    for (const key of ["sorrel", "fern", "ivy", "full-kit-box"]) {
      const sku = resolveCategoryKeyToSku(key);
      expect(getProductTruthBySku(sku!), key).toBeDefined();
    }
  });
});
