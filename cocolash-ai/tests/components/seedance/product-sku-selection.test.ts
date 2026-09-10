/**
 * Package C — the wizard finally writes `productSku`.
 *
 * Root cause #5 of docs/seedance-2.5/05-GROUNDING-FIX.md: `productSku` was
 * declared in wizard state (types.ts) and NOTHING ever assigned it, so the
 * Director's `truthContext` was permanently "" and every product-truth guard —
 * magnetic closure, kit contents, lash length — was dead code on the live path.
 *
 * There is no DOM in this suite (vitest runs `environment: "node"`), so the
 * pure resolver is unit-tested and the wiring that calls it is asserted against
 * the component source, the same way ProductReferencePicker.test.ts does.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveSelectedProductSku,
  type SelectionSource,
} from "@/components/video/seedance-v4/ProductReferencePicker";

const ROOT = resolve(__dirname, "../../..");
const picker = readFileSync(
  resolve(ROOT, "components/video/seedance-v4/ProductReferencePicker.tsx"),
  "utf8"
);

const KIT_A = "https://cdn.example.com/kit-a.png";
const KIT_B = "https://cdn.example.com/kit-b.png";
const TRAY_A = "https://cdn.example.com/tray-a.png";
const SORREL_A = "https://cdn.example.com/sorrel-a.png";
const UPLOAD = "https://cdn.example.com/my-upload.png";
const SHOPIFY_FERN = "https://cdn.shopify.com/fern-1.jpg";

const SOURCES: SelectionSource[] = [
  { url: KIT_A, categoryKey: "full-kit-box" },
  { url: KIT_B, categoryKey: "full-kit-box" },
  { url: TRAY_A, categoryKey: "single-black-tray" },
  { url: SORREL_A, categoryKey: "sorrel" },
  { url: UPLOAD, categoryKey: "custom-uploads" },
  { url: SHOPIFY_FERN, productHandle: "fern" },
];

describe("resolveSelectedProductSku — sets the SKU", () => {
  it("resolves several images from one identifiable category", () => {
    expect(resolveSelectedProductSku([KIT_A, KIT_B], SOURCES)).toBe("kit-daisy");
  });

  it("resolves a per-SKU category", () => {
    expect(resolveSelectedProductSku([SORREL_A], SOURCES)).toBe("sorrel");
  });

  it("resolves a Store-tab image through its live Shopify handle", () => {
    expect(resolveSelectedProductSku([SHOPIFY_FERN], SOURCES)).toBe("fern");
  });

  it("only ever names a SKU when every attributable image agrees", () => {
    expect(resolveSelectedProductSku([KIT_A, KIT_A, KIT_B], SOURCES)).toBe("kit-daisy");
  });
});

describe("resolveSelectedProductSku — clears the SKU", () => {
  it("clears on an empty selection", () => {
    expect(resolveSelectedProductSku([], SOURCES)).toBeUndefined();
  });

  it("clears when the selection mixes two different products", () => {
    expect(resolveSelectedProductSku([KIT_A, SORREL_A], SOURCES)).toBeUndefined();
    expect(resolveSelectedProductSku([SHOPIFY_FERN, KIT_A], SOURCES)).toBeUndefined();
  });

  it("clears for a category that covers ten different lash styles", () => {
    // "single-black-tray" could be any of Dahlia, Poppy, Marigold, Orchid,
    // Rose… A wrong SKU is worse than none.
    expect(resolveSelectedProductSku([TRAY_A], SOURCES)).toBeUndefined();
  });

  it("clears when an ad-hoc upload of something unknown is mixed in", () => {
    expect(resolveSelectedProductSku([KIT_A, UPLOAD], SOURCES)).toBeUndefined();
  });

  it("clears for an upload on its own", () => {
    expect(resolveSelectedProductSku([UPLOAD], SOURCES)).toBeUndefined();
  });

  it("clears when no selected URL can be attributed to a source at all", () => {
    // e.g. a selection rehydrated from another environment.
    expect(
      resolveSelectedProductSku(["https://elsewhere.example/x.png"], SOURCES)
    ).toBeUndefined();
  });

  it("ignores unattributable URLs rather than treating them as a conflict", () => {
    expect(
      resolveSelectedProductSku([KIT_A, "https://elsewhere.example/x.png"], SOURCES)
    ).toBe("kit-daisy");
  });

  it("clears for an unknown Shopify handle", () => {
    expect(
      resolveSelectedProductSku(
        ["https://cdn.shopify.com/x.jpg"],
        [{ url: "https://cdn.shopify.com/x.jpg", productHandle: "not-a-product" }]
      )
    ).toBeUndefined();
  });

  it("survives empty and missing source metadata", () => {
    expect(resolveSelectedProductSku([KIT_A], [])).toBeUndefined();
    expect(
      resolveSelectedProductSku([KIT_A], [{ url: KIT_A, categoryKey: null }])
    ).toBeUndefined();
  });
});

describe("the picker is actually wired to write productSku", () => {
  it("carries the stable category key through from the API", () => {
    expect(picker).toContain("category_key: cat.key ?? undefined");
  });

  it("labels ad-hoc uploads so they resolve to no product", () => {
    expect(picker).toContain('category_key: data.image.category_key ?? "custom-uploads"');
  });

  it("feeds both tabs into the resolver", () => {
    expect(picker).toContain("resolveSelectedProductSku(selected, selectionSources)");
    expect(picker).toContain("productHandle: p.handle");
  });

  it("writes the result into wizard state", () => {
    expect(picker).toContain("setState({ productSku: resolvedSku })");
  });

  it("only writes when the value actually changed, so the effect cannot loop", () => {
    expect(picker).toContain("if (currentSku === resolvedSku) return;");
  });
});
