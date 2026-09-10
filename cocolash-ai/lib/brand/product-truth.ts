/**
 * lib/brand/product-truth.ts — Single canonical source of truth for every
 * CocoLash SKU's physical properties. Consumed by the Seedance Director, image
 * generators, and chatbot product recommendation engine.
 *
 * Fields:
 *   - sku: canonical short ID (e.g. "jasmine")
 *   - displayName: human-readable title (e.g. "Jasmine")
 *   - productHandle?: Shopify handle if known
 *   - categoryId?: Foreign key into product_reference_images.category_id (UUID, project-specific)
 *   - categoryKey?: Stable string key into product_categories.key — preferred over
 *     categoryId because it survives env / DB rebuilds. Resolved to UUID at runtime
 *     by getProductReferenceImagesByCategoryKey() in lib/brand/get-product-references.ts
 *   - lashType: "clusters" | "strips" | "kit" | "tools"
 *   - lengthRange?: e.g. "10-14mm" (omit if unknown)
 *   - volumeProfile?: one of the preset volume levels
 *   - bandMaterial: "cotton" | "plastic" | "none"
 *   - magneticClosure: boolean; true only for kits with magnetic boxes
 *   - packagingType: string descriptor (e.g. "single-pack lash tray")
 *   - kitContents?: array of item names when lashType === "kit"
 *   - colorTone?: e.g. "dark brown", "warm black"
 *   - bestFor?: marketing one-liner
 *   - retired: boolean; exclude from active listings, keep for backward compat
 *
 * Physical-construction fields (added 2026-09-10 after the "glass cover"
 * hallucination — see docs/seedance-2.5/05-GROUNDING-FIX.md §1). The old schema
 * had no way to say what a lid is made of, so "glass cover" was literally
 * unrepresentable and therefore uncheckable:
 *   - lidType?: how the packaging opens ("book" | "hinged" | "slide" | "tray-lid" | "none")
 *   - hasMirror?: true ONLY where a mirror is verified in the product imagery.
 *     Explicit `false` means "this product has no mirror" and lets the prompt
 *     validator rewrite a mirror claim; `undefined` means "not established".
 *   - transparentWindow?: true ONLY where part of the packaging is see-through
 *     from the outside. Same false/undefined distinction as hasMirror.
 *   - exteriorColor? / interiorColor? / boxMaterial? / finish?: plain-text
 *     descriptors used to build POSITIVE replacement phrasing (decision G5 —
 *     never send a negation like "no glass cover" to a video model).
 * Every one of them is optional: absent means unknown, and unknown is never
 * asserted. Do not guess — an empty field is safer than a wrong one.
 *
 * Sourced from:
 *   - public/brand/products_export_1 (1).csv (Shopify export)
 *   - CocoLash-System3-Knowledge-Base-for-Harry.md (product details)
 *   - Faith's 2026-05-07 email feedback (Sorrel needs adding, Lash Blooms retired)
 */

/**
 * Allowed values for categoryKey — must match a row in `product_categories.key`
 * in the live Supabase project. Tools intentionally omit this field because
 * there is no reference imagery for raw tools.
 */
export type ProductCategoryKey =
  | "single-black-tray"
  | "single-nude-tray"
  | "multi-lash-book"
  | "full-kit-pouch"
  | "full-kit-box"
  | "storage-pouch"
  | "branding-flatlay"
  // ── Seedance 2.5 (D7) — per-SKU categories seeded from live Shopify imagery
  // by scripts/seed-shopify-references.ts. These three products are visually
  // distinct enough that the packaging-based categories misrepresent them:
  // Sorrel is DARK BROWN (the nude tray shots are black lashes) and Fern/Ivy
  // are pre-glued half lashes, unlike any tray or kit already in the library.
  | "sorrel"
  | "fern"
  | "ivy"
  // Auto-created by POST /api/products/upload for user uploads. Not in
  // KNOWN_PRODUCT_CATEGORY_KEYS: no SKU is ever authored against it.
  | "custom-uploads";

export const KNOWN_PRODUCT_CATEGORY_KEYS: ReadonlyArray<ProductCategoryKey> = [
  "single-black-tray",
  "single-nude-tray",
  "multi-lash-book",
  "full-kit-pouch",
  "full-kit-box",
  "storage-pouch",
  "branding-flatlay",
  "sorrel",
  "fern",
  "ivy",
];

/**
 * How a product's packaging opens.
 *   book      — lid folds open like a book cover (full kits, four-pack boxes)
 *   hinged    — lid stays attached on a hinge
 *   slide     — sleeve / drawer that slides out
 *   tray-lid  — separate lift-off lid over a tray
 *   none      — no lid at all (bare tools, zip pouches)
 */
export type ProductLidType = "book" | "hinged" | "slide" | "tray-lid" | "none";

export interface ProductTruthEntry {
  sku: string;
  displayName: string;
  productHandle?: string;
  categoryId?: string;
  categoryKey?: ProductCategoryKey;
  lashType: "clusters" | "strips" | "kit" | "tools";
  lengthRange?: string;
  volumeProfile?: "natural" | "soft" | "medium" | "bold" | "dramatic";
  bandMaterial: "cotton" | "plastic" | "none";
  magneticClosure: boolean;
  packagingType: string;
  kitContents?: ReadonlyArray<string>;
  colorTone?: string;
  bestFor?: string;
  /** How the packaging opens. Omit when it has not been established. */
  lidType?: ProductLidType;
  /** True only where a mirror is verified. `false` = verified absent. */
  hasMirror?: boolean;
  /** True only where the packaging is see-through from the outside. */
  transparentWindow?: boolean;
  /** Outside colour of the packaging, e.g. "tan". */
  exteriorColor?: string;
  /** Inside colour of the packaging, e.g. "black". */
  interiorColor?: string;
  /** What the packaging is made of, e.g. "rigid board". */
  boxMaterial?: string;
  /** Surface finish, e.g. "matte". */
  finish?: string;
  retired: boolean;
}

/**
 * PRODUCT_TRUTH: Single source of truth for all active and retired SKUs.
 * Active cluster styles are foundation (single-pack + four-pack variants).
 * Kits bundle lashes + tools with magnetic closures.
 * Tools include bond, sealant, wand, remover.
 */
export const PRODUCT_TRUTH: ReadonlyArray<ProductTruthEntry> = [
  // ========== ACTIVE CLASSIC CLUSTER STYLES ==========

  // Violet: Subtle Charm, cat-eye, natural length
  {
    sku: "violet",
    displayName: "Violet",
    productHandle: "violet-subtle-charm",
    categoryKey: "single-black-tray",
    lashType: "clusters",
    lengthRange: "6-14mm",
    volumeProfile: "natural",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Subtle charm — everyday elegance with cat-eye definition",
    retired: false,
  },
  {
    sku: "violet-4pack",
    displayName: "Violet 4-Pack",
    productHandle: "violet-subtle-charm",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "6-14mm",
    volumeProfile: "natural",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Violet classic lash clusters, four-pack bundle",
    retired: false,
  },

  // Peony: Soft Sophistication, doll-eye, light volume
  {
    sku: "peony",
    displayName: "Peony",
    productHandle: "peony-soft-sophistication",
    categoryKey: "single-black-tray",
    lashType: "clusters",
    lengthRange: "14mm",
    volumeProfile: "soft",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Soft sophistication — delicate doll-eye with romantic appeal",
    retired: false,
  },
  {
    sku: "peony-4pack",
    displayName: "Peony 4-Pack",
    productHandle: "peony-soft-sophistication",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "14mm",
    volumeProfile: "soft",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Peony soft lash clusters, four-pack bundle",
    retired: false,
  },

  // Jasmine: Delicate Beauty, doll-eye, light to medium
  {
    sku: "jasmine",
    displayName: "Jasmine",
    productHandle: "jasmine-delicate-beauty",
    categoryKey: "single-black-tray",
    lashType: "clusters",
    lengthRange: "4-12mm",
    volumeProfile: "soft",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Delicate beauty — feathery natural look for everyday wear",
    retired: false,
  },
  {
    sku: "jasmine-4pack",
    displayName: "Jasmine 4-Pack",
    productHandle: "jasmine-delicate-beauty",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "4-12mm",
    volumeProfile: "soft",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Jasmine natural lash clusters, four-pack bundle",
    retired: false,
  },

  // Daisy: Fresh Elegance, doll-eye, natural
  {
    sku: "daisy",
    displayName: "Daisy",
    productHandle: "daisy-lash-kit",
    categoryKey: "single-black-tray",
    lashType: "clusters",
    lengthRange: "9-14mm",
    volumeProfile: "natural",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Fresh elegance — soft natural look for spring-ready eyes",
    retired: false,
  },
  {
    sku: "daisy-4pack",
    displayName: "Daisy 4-Pack",
    productHandle: "daisy-lash-kit",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "9-14mm",
    volumeProfile: "natural",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Daisy natural lash clusters, four-pack bundle",
    retired: false,
  },

  // Sorrel: Warm Radiance, dark brown, light-to-medium, versatile
  // CSV indicates: 10-16mm custom-map availability, dark brown shade
  // categoryKey is "sorrel", NOT "single-nude-tray" (D7): Sorrel is Shopify's
  // "Brown Volume Lash" and the nude-tray reference shots are black lashes, so
  // the shared category made every Sorrel render the wrong colour.
  {
    sku: "sorrel",
    displayName: "Sorrel",
    productHandle: "sorrel",
    categoryKey: "sorrel",
    lashType: "clusters",
    lengthRange: "10-16mm",
    volumeProfile: "medium",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "dark warm brown",
    bestFor: "Warm radiance — versatile dark brown for inclusive beauty",
    retired: false,
  },
  {
    sku: "sorrel-4pack",
    displayName: "Sorrel 4-Pack",
    productHandle: "sorrel",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "10-16mm",
    volumeProfile: "medium",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "dark warm brown",
    bestFor: "Sorrel warm-brown lash clusters, four-pack bundle",
    retired: false,
  },

  // ========== ACTIVE HALF LASH KITS (D7) ==========
  // Facts below come ONLY from the live Shopify descriptions (read 2026-09-08
  // via the Storefront API by scripts/seed-shopify-references.ts --dry-run).
  // Both are PRE-GLUED — "no lash glue or bond required" — and NEITHER
  // description mentions a magnetic closure, so magneticClosure stays false and
  // no packaging claim beyond "half lash kit box" is made.

  // Fern — Shopify handle "fern", product type "Half Lashes", tag "classic".
  // "the effortless classic half lash designed for a natural, lifted finish …
  //  pre-glued half-lash design … applies in seconds with no lash glue or bond
  //  required. Simply peel, place, and go."
  {
    sku: "fern",
    displayName: "Fern Half Lash Kit",
    productHandle: "fern",
    categoryKey: "fern",
    lashType: "kit",
    volumeProfile: "natural",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "half lash kit box",
    kitContents: ["pre-glued half lashes"],
    hasMirror: false,
    colorTone: "black",
    bestFor: "Effortless classic half lash — natural lifted finish, peel and place",
    retired: false,
  },

  // Ivy — Shopify handle "ivy", product type "Half Lashes", tag "volume".
  // "a fuller half lash created for soft volume and effortless glam. Designed
  //  to enhance the outer corners of the eyes … Just peel, place, and enjoy
  //  beautiful volume in seconds."
  {
    sku: "ivy",
    displayName: "Ivy Half Lash Kit",
    productHandle: "ivy",
    categoryKey: "ivy",
    lashType: "kit",
    volumeProfile: "soft",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "half lash kit box",
    kitContents: ["pre-glued half lashes"],
    hasMirror: false,
    colorTone: "black",
    bestFor: "Soft volume half lash — lifted outer corners, peel and place",
    retired: false,
  },

  // ========== ACTIVE VOLUME CLUSTER STYLES ==========

  // Iris: Striking Drama, fox-eye, high volume
  {
    sku: "iris",
    displayName: "Iris",
    productHandle: "iris-striking-drama",
    categoryKey: "single-black-tray",
    lashType: "clusters",
    lengthRange: "14mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Striking drama — bold fox-eye for glamorous impact",
    retired: false,
  },
  {
    sku: "iris-4pack",
    displayName: "Iris 4-Pack",
    productHandle: "iris-striking-drama",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "14mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Iris bold lash clusters, four-pack bundle",
    retired: false,
  },

  // Dahlia: Bold Glamour, fox-eye, maximum drama
  {
    sku: "dahlia",
    displayName: "Dahlia",
    productHandle: "dahlia-lash-extensions",
    categoryKey: "single-black-tray",
    lashType: "clusters",
    lengthRange: "8-14mm",
    volumeProfile: "dramatic",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Bold glamour — maximum drama fox-eye for special occasions",
    retired: false,
  },
  {
    sku: "dahlia-4pack",
    displayName: "Dahlia 4-Pack",
    productHandle: "dahlia-lash-extensions",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "8-14mm",
    volumeProfile: "dramatic",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Dahlia dramatic lash clusters, four-pack bundle",
    retired: false,
  },

  // Poppy: Dramatic Allure, fox-eye, glamorous impact
  {
    sku: "poppy",
    displayName: "Poppy",
    productHandle: "poppy-dramatic-allure",
    categoryKey: "single-black-tray",
    lashType: "clusters",
    lengthRange: "5-12mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Dramatic allure — glamorous fox-eye impact",
    retired: false,
  },
  {
    sku: "poppy-4pack",
    displayName: "Poppy 4-Pack",
    productHandle: "poppy-dramatic-allure",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "5-12mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Poppy dramatic lash clusters, four-pack bundle",
    retired: false,
  },

  // Marigold: Radiant Warmth, doll-eye, medium wispy
  {
    sku: "marigold",
    displayName: "Marigold",
    productHandle: "marigold-radiant-warmth",
    categoryKey: "single-black-tray",
    lashType: "clusters",
    lengthRange: "4-10mm",
    volumeProfile: "medium",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Radiant warmth — wispy medium volume for playful flair",
    retired: false,
  },
  {
    sku: "marigold-4pack",
    displayName: "Marigold 4-Pack",
    productHandle: "marigold-radiant-warmth",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "4-10mm",
    volumeProfile: "medium",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Marigold wispy lash clusters, four-pack bundle",
    retired: false,
  },

  // Orchid: Exotic Sophistication, fox-eye, high volume
  {
    sku: "orchid",
    displayName: "Orchid",
    productHandle: "orchid-exotic-sophistication",
    categoryKey: "single-black-tray",
    lashType: "clusters",
    lengthRange: "12-16mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Exotic sophistication — bold statement fox-eye glamour",
    retired: false,
  },
  {
    sku: "orchid-4pack",
    displayName: "Orchid 4-Pack",
    productHandle: "orchid-exotic-sophistication",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "12-16mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Orchid bold lash clusters, four-pack bundle",
    retired: false,
  },

  // Rose: Romantic Boldness, fox-eye, high volume
  {
    sku: "rose",
    displayName: "Rose",
    productHandle: "rose-romantic-boldness",
    categoryKey: "single-black-tray",
    lashType: "clusters",
    lengthRange: "12-16mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    lidType: "tray-lid",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Romantic boldness — dense glamorous fox-eye elegance",
    retired: false,
  },
  {
    sku: "rose-4pack",
    displayName: "Rose 4-Pack",
    productHandle: "rose-romantic-boldness",
    categoryKey: "multi-lash-book",
    lashType: "clusters",
    lengthRange: "12-16mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    lidType: "book",
    hasMirror: false,
    colorTone: "black",
    bestFor: "Rose bold lash clusters, four-pack bundle",
    retired: false,
  },

  // ========== ACTIVE KITS ==========

  // CocoLash Kit - Ultimate Lash Essentials (available in multiple lash styles).
  //
  // GROUND TRUTH, established 2026-09-10 by opening the eight photographs in
  // brand-assets/products/full-kit-box and looking at them
  // (docs/seedance-2.5/05-GROUNDING-FIX.md §1):
  //   exterior  tan / camel rigid board, black COCOLASH wordmark, side text
  //             "Experience the long lasting lash technology."
  //   lid       book-style, folds open, tan inner face, magnetic close
  //   mirror    REAL — a rectangular mirror is set into the inside of the lid
  //             and visibly reflects the tray contents
  //   interior  black rigid tray, tan die-cut insert with a fitted cut-out per
  //             tool, black base printed www.cocolash.com
  //   contents  SIX items (listed below), not the nine previously recorded here
  //   glass     DOES NOT EXIST anywhere on this product. The lashes in the round
  //             case sit under a clear PLASTIC inner cover, never glass.
  // All four kit SKUs are the SAME physical box; only the bundled lash style
  // differs, which is why they share one Shopify handle.
  {
    sku: "kit-daisy",
    displayName: "CocoLash Kit - Daisy",
    productHandle: "cocolash-kit-ultimate-lash-essentials",
    categoryKey: "full-kit-box",
    lashType: "kit",
    bandMaterial: "cotton",
    magneticClosure: true,
    packagingType: "rigid tan kit box with a book-style magnetic lid",
    kitContents: [
      "Bond + Sealant dual-ended black pen",
      "White lash remover pen",
      "Black tweezers",
      "Pink angled applicator",
      "Black scissors",
      "Round black lash case with rose-gold COCOLASH lettering, holding the Daisy lash clusters",
    ],
    lidType: "book",
    hasMirror: true,
    transparentWindow: false,
    exteriorColor: "tan",
    interiorColor: "black",
    boxMaterial: "rigid board",
    finish: "matte",
    colorTone: "black",
    bestFor: "Complete beginner kit with Daisy lashes, bond, tools, and a mirrored magnetic box",
    retired: false,
  },
  {
    sku: "kit-dahlia",
    displayName: "CocoLash Kit - Dahlia",
    productHandle: "cocolash-kit-ultimate-lash-essentials",
    categoryKey: "full-kit-box",
    lashType: "kit",
    bandMaterial: "cotton",
    magneticClosure: true,
    packagingType: "rigid tan kit box with a book-style magnetic lid",
    kitContents: [
      "Bond + Sealant dual-ended black pen",
      "White lash remover pen",
      "Black tweezers",
      "Pink angled applicator",
      "Black scissors",
      "Round black lash case with rose-gold COCOLASH lettering, holding the Dahlia lash clusters",
    ],
    lidType: "book",
    hasMirror: true,
    transparentWindow: false,
    exteriorColor: "tan",
    interiorColor: "black",
    boxMaterial: "rigid board",
    finish: "matte",
    colorTone: "black",
    bestFor: "Complete kit with Dahlia drama lashes, bond, tools, and a mirrored magnetic box",
    retired: false,
  },
  {
    sku: "kit-violet",
    displayName: "CocoLash Kit - Violet",
    productHandle: "cocolash-kit-ultimate-lash-essentials",
    categoryKey: "full-kit-box",
    lashType: "kit",
    bandMaterial: "cotton",
    magneticClosure: true,
    packagingType: "rigid tan kit box with a book-style magnetic lid",
    kitContents: [
      "Bond + Sealant dual-ended black pen",
      "White lash remover pen",
      "Black tweezers",
      "Pink angled applicator",
      "Black scissors",
      "Round black lash case with rose-gold COCOLASH lettering, holding the Violet lash clusters",
    ],
    lidType: "book",
    hasMirror: true,
    transparentWindow: false,
    exteriorColor: "tan",
    interiorColor: "black",
    boxMaterial: "rigid board",
    finish: "matte",
    colorTone: "black",
    bestFor: "Complete kit with Violet classic lashes, bond, tools, and a mirrored magnetic box",
    retired: false,
  },
  {
    sku: "kit-sorrel",
    displayName: "CocoLash Kit - Sorrel",
    productHandle: "cocolash-kit-ultimate-lash-essentials",
    categoryKey: "full-kit-box",
    lashType: "kit",
    bandMaterial: "cotton",
    magneticClosure: true,
    packagingType: "rigid tan kit box with a book-style magnetic lid",
    kitContents: [
      "Bond + Sealant dual-ended black pen",
      "White lash remover pen",
      "Black tweezers",
      "Pink angled applicator",
      "Black scissors",
      "Round black lash case with rose-gold COCOLASH lettering, holding the Sorrel lash clusters",
    ],
    lidType: "book",
    hasMirror: true,
    transparentWindow: false,
    exteriorColor: "tan",
    interiorColor: "black",
    boxMaterial: "rigid board",
    finish: "matte",
    colorTone: "dark warm brown",
    bestFor: "Complete kit with Sorrel brown lashes, bond, tools, and a mirrored magnetic box",
    retired: false,
  },

  // ========== ACTIVE TOOLS & ACCESSORIES ==========

  // The two entries below exist ONLY so that every live Shopify handle resolves
  // through getProductTruthByHandle() — the prompt validator needs a truth row
  // for any product a video can be made about. They do NOT make either product
  // recommendable: Coco's knowledge base is gated by handle in
  // lib/shopify/kb-exclusions.ts (KB_SKIP_PRODUCT_HANDLES), which is entirely
  // independent of this file. In particular "cocolash-bond-sealant-duo" is an
  // existing-customers-only refill — Coco must never surface, price, or link it
  // as a purchasable product; it appears here only as a physical object that
  // shows up on camera, and as a kit content above.
  {
    sku: "bond-sealant-duo",
    displayName: "CocoLash Bond + Sealant Duo",
    productHandle: "cocolash-bond-sealant-duo",
    lashType: "tools",
    bandMaterial: "none",
    magneticClosure: false,
    packagingType: "dual-ended pen",
    colorTone: "black",
    bestFor: "Bond on one end, sealant on the other — the pen bundled in every full kit",
    lidType: "none",
    hasMirror: false,
    exteriorColor: "black",
    retired: false,
  },

  // "fan" is a live Shopify handle with no reference imagery in this project,
  // so everything past its identity is deliberately left undefined rather than
  // invented. Add facts here only after looking at real photographs.
  {
    sku: "fan",
    displayName: "Fan",
    productHandle: "fan",
    lashType: "tools",
    bandMaterial: "none",
    magneticClosure: false,
    packagingType: "tool accessory",
    lidType: "none",
    hasMirror: false,
    retired: false,
  },

  {
    sku: "lash-wand",
    displayName: "Lash Wand",
    productHandle: "lash-wand",
    lashType: "tools",
    bandMaterial: "none",
    magneticClosure: false,
    packagingType: "tool accessory",
    lidType: "none",
    hasMirror: false,
    bestFor: "Precision lash applicator wand for cluster placement",
    retired: false,
  },

  {
    sku: "cosmetic-bag",
    displayName: "CocoLash Cosmetic Bag",
    productHandle: "bag",
    lashType: "tools",
    bandMaterial: "none",
    magneticClosure: false,
    packagingType: "accessory pouch",
    lidType: "none",
    hasMirror: false,
    bestFor: "Branded cosmetic storage for lashes and tools",
    retired: false,
  },

  // ========== RETIRED PRODUCTS ==========

  {
    sku: "lash_blooms",
    displayName: "Lash Blooms",
    productHandle: "lash-blooms-pre-glued-lash-cluster-kit",
    lashType: "kit",
    bandMaterial: "plastic",
    magneticClosure: false,
    packagingType: "pre-glued kit box",
    kitContents: ["Pre-glued lash clusters (4 lengths)"],
    hasMirror: false,
    colorTone: "black; pink accents",
    bestFor: "Pre-glued lash clusters — no bond needed",
    retired: true,
  },
];

/**
 * Retrieve a product truth entry by SKU (short ID).
 * Returns undefined if not found.
 */
export function getProductTruthBySku(
  sku: string
): ProductTruthEntry | undefined {
  return PRODUCT_TRUTH.find((p) => p.sku === sku);
}

/**
 * Retrieve all active (non-retired) products.
 * Used by Step1 mode selector, product context inference, etc.
 */
export function getActiveProducts(): ReadonlyArray<ProductTruthEntry> {
  return PRODUCT_TRUTH.filter((p) => !p.retired);
}

/**
 * Every product handle that exists on cocolash.com, verified 2026-09-10.
 *
 * Ten of these did not match `productHandle` before that date — the truth rows
 * said "violet", "daisy", "iris"… while Shopify says "violet-subtle-charm",
 * "daisy-lash-kit", "iris-striking-drama" — so `getProductTruthByHandle()`
 * resolved nothing and had zero callers. Keep this list and PRODUCT_TRUTH in
 * step; tests/brand/product-handles.test.ts fails if any handle stops
 * resolving.
 *
 * Note there is no separate handle for a four-pack: the 4-pack SKUs are
 * VARIANTS of their parent product and therefore share its handle, exactly as
 * the four kit SKUs share "cocolash-kit-ultimate-lash-essentials".
 */
export const LIVE_SHOPIFY_PRODUCT_HANDLES: ReadonlyArray<string> = [
  "violet-subtle-charm",
  "daisy-lash-kit",
  "dahlia-lash-extensions",
  "iris-striking-drama",
  "peony-soft-sophistication",
  "jasmine-delicate-beauty",
  "marigold-radiant-warmth",
  "orchid-exotic-sophistication",
  "poppy-dramatic-allure",
  "rose-romantic-boldness",
  "sorrel",
  "fern",
  "ivy",
  "cocolash-kit-ultimate-lash-essentials",
  "fan",
  "cocolash-bond-sealant-duo",
];

/**
 * Retrieve a product truth entry by Shopify product handle.
 *
 * A handle can cover several SKUs (variants of one Shopify product: the four
 * kits, and every 4-pack alongside its single). This returns the FIRST match in
 * PRODUCT_TRUTH order, which is always the base variant — the single pack, or
 * kit-daisy for the kit. Use getProductTruthEntriesByHandle() when you need all
 * of them. Returns undefined if the handle is unknown.
 */
export function getProductTruthByHandle(
  handle: string
): ProductTruthEntry | undefined {
  return PRODUCT_TRUTH.find((p) => p.productHandle === handle);
}

/**
 * Every truth entry sharing one Shopify handle, in PRODUCT_TRUTH order.
 * Empty array when the handle is unknown.
 */
export function getProductTruthEntriesByHandle(
  handle: string
): ReadonlyArray<ProductTruthEntry> {
  return PRODUCT_TRUTH.filter((p) => p.productHandle === handle);
}

/**
 * Library category → the SKU whose truth row describes what those photographs
 * actually show.
 *
 * Only categories that depict ONE physical product get an entry. The three
 * per-SKU categories are one-to-one. "full-kit-box" maps to kit-daisy because
 * all four kit SKUs are the same box — same tan board, same book lid, same
 * mirror, same tray, same six tools — and differ only in which lash style is
 * bundled, which the box photography does not show. That is the same base
 * variant getProductTruthByHandle() returns for the shared handle.
 *
 * Deliberately absent, because the photographs could be any of ten styles:
 * single-black-tray, single-nude-tray, multi-lash-book, full-kit-pouch,
 * storage-pouch, branding-flatlay. Picking from those leaves productSku unset,
 * which is correct — an unset SKU means "ground this in the images alone".
 */
export const CATEGORY_KEY_TO_SKU: Readonly<
  Partial<Record<ProductCategoryKey, string>>
> = {
  sorrel: "sorrel",
  fern: "fern",
  ivy: "ivy",
  "full-kit-box": "kit-daisy",
};

/**
 * Resolve a product-category key to the SKU it unambiguously identifies.
 * Returns undefined for an unknown key, or for a category that covers several
 * different products.
 */
export function resolveCategoryKeyToSku(
  key: string | null | undefined
): string | undefined {
  if (!key) return undefined;
  const sku = CATEGORY_KEY_TO_SKU[key as ProductCategoryKey];
  return sku && getProductTruthBySku(sku) ? sku : undefined;
}

/**
 * Patterns that flag a magnetic-closure claim — including leaky phrasings the
 * original single regex missed ("magnetic close", "clicks open with a magnet").
 * Tuned to avoid partial-word false positives like "magneticness".
 */
const MAGNETIC_PHANTOM_PATTERNS: RegExp[] = [
  // "magnetic <closure-word>": closure, lid, box, seal, case, clasp, snap, click, close, pack(aging)
  /\bmagnetic\s+(closure|lid|box|seal|case|clasp|snap|click|close|pack|packaging)\b/i,
  // "magnet" followed by a closing action within the same clause
  /\bmagnet(?:s|ic)?\b[^.!?]{0,40}\b(?:snap|snaps|snapped|click|clicks|clicked|close|closes|closed|closing|shut|seal|seals)\b/i,
  // a closing action followed by "magnet" ("clicks open with a magnet")
  /\b(?:snap|snaps|snapped|click|clicks|clicked|close|closes|closed|closing|shut)\b[^.!?]{0,40}\bmagnet(?:s|ic)?\b/i,
];

/**
 * Detect claims in a script that don't match the product's actual features.
 * Returns an array of warnings; empty array means no false claims detected.
 *
 * Per D-34-04 + BLOCKER 1 decision: Can be called with or without productSku.
 * SKU-aware magnetic guard: lash trays and multi-lash books have NO magnetic
 * closure (the vast majority of the line); only the full CocoLash KITS do. When
 * the SKU is a known kit, magnetic talk is legitimate; otherwise (non-kit, or no
 * SKU) it is treated as a phantom feature. If SKU provided, also checks
 * product-specific features (band material, packaging).
 *
 * Example: script says "magnetic closure" but the product is a single tray.
 * Returns: ["Script mentions a magnetic closure, but this product has none ..."]
 */
export function detectPhantomFeatures(
  script: string,
  productSku?: string
): string[] {
  const phantoms: string[] = [];

  // Resolve product truth up front (only if a known SKU is supplied).
  const truth = productSku ? getProductTruthBySku(productSku) : null;

  // ── Magnetic-closure guard (brand-wide, SKU-aware) ──
  // Allowed only when the resolved product is genuinely a magnetic kit.
  // Non-blocking backstop — the vision-grounded script is the real fix.
  const magneticAllowed = truth?.magneticClosure === true;
  if (!magneticAllowed && MAGNETIC_PHANTOM_PATTERNS.some((p) => p.test(script))) {
    phantoms.push(
      "Script mentions a magnetic closure, but this product has none (only CocoLash kits are magnetic)"
    );
  }

  // ── Product-specific checks (only when SKU resolves to known truth) ──
  if (productSku) {
    if (!truth) {
      // Unknown SKU; can't validate product-specific features.
      // Don't block — return only brand-wide violations.
      return phantoms;
    }

    const productSpecificChecks = [
      {
        pattern: /plastic\s+band/i,
        allowed: truth.bandMaterial === "plastic",
        message: `Script mentions "plastic band" but ${truth.displayName} uses ${truth.bandMaterial} band`,
      },
      {
        pattern: /cotton\s+band/i,
        allowed: truth.bandMaterial === "cotton",
        message: `Script mentions "cotton band" but ${truth.displayName} uses ${truth.bandMaterial} band`,
      },
      {
        pattern: /leather\s+(case|box|pouch|packaging)/i,
        allowed: (truth.packagingType || "").toLowerCase().includes("leather"),
        message: `Script mentions "leather" but ${truth.displayName} packaging is ${truth.packagingType}`,
      },
    ];

    productSpecificChecks.forEach(({ pattern, allowed, message }) => {
      if (pattern.test(script) && !allowed) {
        phantoms.push(message);
      }
    });
  }

  return phantoms;
}

/**
 * Validates a script against product truth.
 * Returns { valid: boolean, warnings: string[] }.
 * valid = true if no phantom features detected; warnings lists any issues.
 *
 * Per D-34-04: Works with or without productSku. Brand-wide checks apply
 * regardless; product-specific checks only if SKU is provided.
 */
export function validateScriptAgainstProductTruth(
  script: string,
  productSku?: string
): { valid: boolean; warnings: string[] } {
  const warnings = detectPhantomFeatures(script, productSku);
  return {
    valid: warnings.length === 0,
    warnings,
  };
}
