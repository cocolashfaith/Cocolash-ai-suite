/**
 * lib/brand/product-truth.ts — Single canonical source of truth for every
 * CocoLash SKU's physical properties. Consumed by the Seedance Director, image
 * generators, and chatbot product recommendation engine.
 *
 * Fields:
 *   - sku: canonical short ID (e.g. "jasmine")
 *   - displayName: human-readable title (e.g. "Jasmine")
 *   - productHandle?: Shopify handle if known
 *   - categoryId?: Foreign key into product_reference_images.category_id
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
 * Sourced from:
 *   - public/brand/products_export_1 (1).csv (Shopify export)
 *   - CocoLash-System3-Knowledge-Base-for-Harry.md (product details)
 *   - Faith's 2026-05-07 email feedback (Sorrel needs adding, Lash Blooms retired)
 */

export interface ProductTruthEntry {
  sku: string;
  displayName: string;
  productHandle?: string;
  categoryId?: string;
  lashType: "clusters" | "strips" | "kit" | "tools";
  lengthRange?: string;
  volumeProfile?: "natural" | "soft" | "medium" | "bold" | "dramatic";
  bandMaterial: "cotton" | "plastic" | "none";
  magneticClosure: boolean;
  packagingType: string;
  kitContents?: ReadonlyArray<string>;
  colorTone?: string;
  bestFor?: string;
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
    productHandle: "violet",
    lashType: "clusters",
    lengthRange: "6-14mm",
    volumeProfile: "natural",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "black",
    bestFor: "Subtle charm — everyday elegance with cat-eye definition",
    retired: false,
  },
  {
    sku: "violet-4pack",
    displayName: "Violet 4-Pack",
    productHandle: "violet-4pack",
    lashType: "clusters",
    lengthRange: "6-14mm",
    volumeProfile: "natural",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "black",
    bestFor: "Violet classic lash clusters, four-pack bundle",
    retired: false,
  },

  // Peony: Soft Sophistication, doll-eye, light volume
  {
    sku: "peony",
    displayName: "Peony",
    productHandle: "peony",
    lashType: "clusters",
    lengthRange: "14mm",
    volumeProfile: "soft",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "black",
    bestFor: "Soft sophistication — delicate doll-eye with romantic appeal",
    retired: false,
  },
  {
    sku: "peony-4pack",
    displayName: "Peony 4-Pack",
    productHandle: "peony-4pack",
    lashType: "clusters",
    lengthRange: "14mm",
    volumeProfile: "soft",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "black",
    bestFor: "Peony soft lash clusters, four-pack bundle",
    retired: false,
  },

  // Jasmine: Delicate Beauty, doll-eye, light to medium
  {
    sku: "jasmine",
    displayName: "Jasmine",
    productHandle: "jasmine",
    lashType: "clusters",
    lengthRange: "4-12mm",
    volumeProfile: "soft",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "black",
    bestFor: "Delicate beauty — feathery natural look for everyday wear",
    retired: false,
  },
  {
    sku: "jasmine-4pack",
    displayName: "Jasmine 4-Pack",
    productHandle: "jasmine-4pack",
    lashType: "clusters",
    lengthRange: "4-12mm",
    volumeProfile: "soft",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "black",
    bestFor: "Jasmine natural lash clusters, four-pack bundle",
    retired: false,
  },

  // Daisy: Fresh Elegance, doll-eye, natural
  {
    sku: "daisy",
    displayName: "Daisy",
    productHandle: "daisy",
    lashType: "clusters",
    lengthRange: "9-14mm",
    volumeProfile: "natural",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "black",
    bestFor: "Fresh elegance — soft natural look for spring-ready eyes",
    retired: false,
  },
  {
    sku: "daisy-4pack",
    displayName: "Daisy 4-Pack",
    productHandle: "daisy-4pack",
    lashType: "clusters",
    lengthRange: "9-14mm",
    volumeProfile: "natural",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "black",
    bestFor: "Daisy natural lash clusters, four-pack bundle",
    retired: false,
  },

  // Sorrel: Warm Radiance, dark brown, light-to-medium, versatile
  // CSV indicates: 10-16mm custom-map availability, dark brown shade
  {
    sku: "sorrel",
    displayName: "Sorrel",
    productHandle: "sorrel",
    lashType: "clusters",
    lengthRange: "10-16mm",
    volumeProfile: "medium",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "dark warm brown",
    bestFor: "Warm radiance — versatile dark brown for inclusive beauty",
    retired: false,
  },
  {
    sku: "sorrel-4pack",
    displayName: "Sorrel 4-Pack",
    productHandle: "sorrel-4pack",
    lashType: "clusters",
    lengthRange: "10-16mm",
    volumeProfile: "medium",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "dark warm brown",
    bestFor: "Sorrel warm-brown lash clusters, four-pack bundle",
    retired: false,
  },

  // ========== ACTIVE VOLUME CLUSTER STYLES ==========

  // Iris: Striking Drama, fox-eye, high volume
  {
    sku: "iris",
    displayName: "Iris",
    productHandle: "iris",
    lashType: "clusters",
    lengthRange: "14mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "black",
    bestFor: "Striking drama — bold fox-eye for glamorous impact",
    retired: false,
  },
  {
    sku: "iris-4pack",
    displayName: "Iris 4-Pack",
    productHandle: "iris-4pack",
    lashType: "clusters",
    lengthRange: "14mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "black",
    bestFor: "Iris bold lash clusters, four-pack bundle",
    retired: false,
  },

  // Dahlia: Bold Glamour, fox-eye, maximum drama
  {
    sku: "dahlia",
    displayName: "Dahlia",
    productHandle: "dahlia",
    lashType: "clusters",
    lengthRange: "8-14mm",
    volumeProfile: "dramatic",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "black",
    bestFor: "Bold glamour — maximum drama fox-eye for special occasions",
    retired: false,
  },
  {
    sku: "dahlia-4pack",
    displayName: "Dahlia 4-Pack",
    productHandle: "dahlia-4pack",
    lashType: "clusters",
    lengthRange: "8-14mm",
    volumeProfile: "dramatic",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "black",
    bestFor: "Dahlia dramatic lash clusters, four-pack bundle",
    retired: false,
  },

  // Poppy: Dramatic Allure, fox-eye, glamorous impact
  {
    sku: "poppy",
    displayName: "Poppy",
    productHandle: "poppy",
    lashType: "clusters",
    lengthRange: "5-12mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "black",
    bestFor: "Dramatic allure — glamorous fox-eye impact",
    retired: false,
  },
  {
    sku: "poppy-4pack",
    displayName: "Poppy 4-Pack",
    productHandle: "poppy-4pack",
    lashType: "clusters",
    lengthRange: "5-12mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "black",
    bestFor: "Poppy dramatic lash clusters, four-pack bundle",
    retired: false,
  },

  // Marigold: Radiant Warmth, doll-eye, medium wispy
  {
    sku: "marigold",
    displayName: "Marigold",
    productHandle: "marigold",
    lashType: "clusters",
    lengthRange: "4-10mm",
    volumeProfile: "medium",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "black",
    bestFor: "Radiant warmth — wispy medium volume for playful flair",
    retired: false,
  },
  {
    sku: "marigold-4pack",
    displayName: "Marigold 4-Pack",
    productHandle: "marigold-4pack",
    lashType: "clusters",
    lengthRange: "4-10mm",
    volumeProfile: "medium",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "black",
    bestFor: "Marigold wispy lash clusters, four-pack bundle",
    retired: false,
  },

  // Orchid: Exotic Sophistication, fox-eye, high volume
  {
    sku: "orchid",
    displayName: "Orchid",
    productHandle: "orchid",
    lashType: "clusters",
    lengthRange: "12-16mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "black",
    bestFor: "Exotic sophistication — bold statement fox-eye glamour",
    retired: false,
  },
  {
    sku: "orchid-4pack",
    displayName: "Orchid 4-Pack",
    productHandle: "orchid-4pack",
    lashType: "clusters",
    lengthRange: "12-16mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "black",
    bestFor: "Orchid bold lash clusters, four-pack bundle",
    retired: false,
  },

  // Rose: Romantic Boldness, fox-eye, high volume
  {
    sku: "rose",
    displayName: "Rose",
    productHandle: "rose",
    lashType: "clusters",
    lengthRange: "12-16mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "single-pack lash tray",
    colorTone: "black",
    bestFor: "Romantic boldness — dense glamorous fox-eye elegance",
    retired: false,
  },
  {
    sku: "rose-4pack",
    displayName: "Rose 4-Pack",
    productHandle: "rose-4pack",
    lashType: "clusters",
    lengthRange: "12-16mm",
    volumeProfile: "bold",
    bandMaterial: "cotton",
    magneticClosure: false,
    packagingType: "four-pack box",
    colorTone: "black",
    bestFor: "Rose bold lash clusters, four-pack bundle",
    retired: false,
  },

  // ========== ACTIVE KITS ==========

  // CocoLash Kit - Ultimate Lash Essentials (available in multiple lash styles)
  // Magnetic closure, includes full toolkit for DIY application
  {
    sku: "kit-daisy",
    displayName: "CocoLash Kit - Daisy",
    productHandle: "cocolash-kit-ultimate-lash-essentials",
    lashType: "kit",
    bandMaterial: "cotton",
    magneticClosure: true,
    packagingType: "kit box (magnetic)",
    kitContents: [
      "Daisy lash clusters",
      "Bond adhesive",
      "Bond sealant",
      "Lash remover",
      "Precision applicator",
      "Tweezers (classic)",
      "Tweezers (curved)",
      "Scissors",
      "Spoolie brush",
    ],
    colorTone: "black",
    bestFor: "Complete beginner kit with Daisy lashes, bond, tools, and magnetic box",
    retired: false,
  },
  {
    sku: "kit-dahlia",
    displayName: "CocoLash Kit - Dahlia",
    productHandle: "cocolash-kit-ultimate-lash-essentials",
    lashType: "kit",
    bandMaterial: "cotton",
    magneticClosure: true,
    packagingType: "kit box (magnetic)",
    kitContents: [
      "Dahlia lash clusters",
      "Bond adhesive",
      "Bond sealant",
      "Lash remover",
      "Precision applicator",
      "Tweezers (classic)",
      "Tweezers (curved)",
      "Scissors",
      "Spoolie brush",
    ],
    colorTone: "black",
    bestFor: "Complete kit with Dahlia drama lashes, bond, tools, and magnetic box",
    retired: false,
  },
  {
    sku: "kit-violet",
    displayName: "CocoLash Kit - Violet",
    productHandle: "cocolash-kit-ultimate-lash-essentials",
    lashType: "kit",
    bandMaterial: "cotton",
    magneticClosure: true,
    packagingType: "kit box (magnetic)",
    kitContents: [
      "Violet lash clusters",
      "Bond adhesive",
      "Bond sealant",
      "Lash remover",
      "Precision applicator",
      "Tweezers (classic)",
      "Tweezers (curved)",
      "Scissors",
      "Spoolie brush",
    ],
    colorTone: "black",
    bestFor: "Complete kit with Violet classic lashes, bond, tools, and magnetic box",
    retired: false,
  },
  {
    sku: "kit-sorrel",
    displayName: "CocoLash Kit - Sorrel",
    productHandle: "cocolash-kit-ultimate-lash-essentials",
    lashType: "kit",
    bandMaterial: "cotton",
    magneticClosure: true,
    packagingType: "kit box (magnetic)",
    kitContents: [
      "Sorrel lash clusters",
      "Bond adhesive",
      "Bond sealant",
      "Lash remover",
      "Precision applicator",
      "Tweezers (classic)",
      "Tweezers (curved)",
      "Scissors",
      "Spoolie brush",
    ],
    colorTone: "dark warm brown",
    bestFor: "Complete kit with Sorrel brown lashes, bond, tools, and magnetic box",
    retired: false,
  },

  // ========== ACTIVE TOOLS & ACCESSORIES ==========

  {
    sku: "bond-sealant-duo",
    displayName: "Bond + Sealant Duo",
    productHandle: "cocolash-bond-sealant-duo",
    lashType: "tools",
    bandMaterial: "none",
    magneticClosure: false,
    packagingType: "dual-bottle set",
    kitContents: ["Bond adhesive (latex-free)", "Bond sealant"],
    bestFor: "Dual-ended application bottles for 7-day lash wear hold",
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
 * Retrieve a product truth entry by Shopify product handle.
 * Returns undefined if not found.
 */
export function getProductTruthByHandle(
  handle: string
): ProductTruthEntry | undefined {
  return PRODUCT_TRUTH.find((p) => p.productHandle === handle);
}
