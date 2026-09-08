/**
 * Step-1 product picker — the two list-shaping rules behind the QA defects.
 *
 * There is no DOM environment in this suite (vitest runs `environment: "node"`),
 * so the pure helpers are unit-tested and the layout rules they feed are
 * asserted on the component source, the same way
 * tests/seedance-v25/step3-settings-and-progress.test.ts does.
 *
 *  1. Store tab: `GET /api/shopify/product-images` deliberately KEEPS products
 *     whose images are all WebP/GIF (Enhancor rejects those formats), so a
 *     product like "Fan" arrived with `images: []` and rendered as a heading
 *     above an empty grid.
 *  2. Library tab: ~100 thumbnails arrived as one ungrouped wall with no
 *     category headings and no height cap, pushing the rest of Step 1 off
 *     screen.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  groupLibraryByCategory,
  productsWithUsableImages,
} from "@/components/video/seedance-v4/ProductReferencePicker";

const ROOT = resolve(__dirname, "../../..");
const picker = readFileSync(
  resolve(ROOT, "components/video/seedance-v4/ProductReferencePicker.tsx"),
  "utf8"
);

/** The shape the Store tab actually receives from /api/shopify/product-images. */
interface StoreProductLike {
  handle: string;
  images?: Array<{ url: string }>;
}

function img(id: string, category: string) {
  return { id, image_url: `https://cdn.example.com/${id}.png`, category_name: category };
}

describe("productsWithUsableImages — no empty store groups", () => {
  it("drops a product whose usable-image list is empty", () => {
    const products: StoreProductLike[] = [
      { handle: "sorrel", images: [{ url: "a" }] },
      { handle: "fan", images: [] },
    ];
    expect(productsWithUsableImages(products).map((p) => p.handle)).toEqual(["sorrel"]);
  });

  it("drops a product with no images key at all", () => {
    const products: StoreProductLike[] = [{ handle: "fan" }];
    expect(productsWithUsableImages(products)).toEqual([]);
  });

  it("keeps every product that has at least one image", () => {
    const products: StoreProductLike[] = [
      { handle: "sorrel", images: [{ url: "a" }, { url: "b" }] },
      { handle: "fern", images: [{ url: "c" }] },
    ];
    expect(productsWithUsableImages(products)).toEqual(products);
  });
});

describe("groupLibraryByCategory — the Library tab is grouped like the Store tab", () => {
  it("groups images under one heading per category", () => {
    const groups = groupLibraryByCategory([
      img("1", "Fern"),
      img("2", "Sorrel"),
      img("3", "Fern"),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Fern", "Sorrel"]);
    expect(groups[0].images.map((i) => i.id)).toEqual(["1", "3"]);
    expect(groups[1].images.map((i) => i.id)).toEqual(["2"]);
  });

  it("keeps the incoming order, so a fresh upload's category comes first", () => {
    const groups = groupLibraryByCategory([
      img("new", "Custom Uploads"),
      img("old", "Fern"),
    ]);
    expect(groups[0].name).toBe("Custom Uploads");
  });

  it("files an image with no category under 'Uncategorized' instead of ''", () => {
    const groups = groupLibraryByCategory([img("1", ""), img("2", "   ")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Uncategorized");
    expect(groups[0].images).toHaveLength(2);
  });

  it("loses no images", () => {
    const all = [img("1", "A"), img("2", "B"), img("3", "A"), img("4", "C")];
    const total = groupLibraryByCategory(all).reduce((n, g) => n + g.images.length, 0);
    expect(total).toBe(all.length);
  });
});

describe("picker layout — both tabs scroll inside a capped box", () => {
  it("caps the height of the grids so Step 1 stays compact", () => {
    const capped = picker.match(/max-h-\[60vh\][^"]*overflow-y-auto/g) ?? [];
    // One for the Library tab, one for the Store tab.
    expect(capped.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the library through the grouped list, not the flat one", () => {
    expect(picker).toContain("libraryGroups.map((group)");
    expect(picker).not.toMatch(/\{images\.map\(\(img\)/);
  });

  it("renders the store grid from the filtered list", () => {
    expect(picker).toContain("withImages.map((product)");
    expect(picker).not.toMatch(/\{products\.map\(\(product\)/);
  });
});
