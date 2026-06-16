/**
 * lib/shopify/kb-exclusions.ts — single source of truth for which Shopify
 * products are kept OUT of Coco's knowledge base.
 *
 * Used by BOTH ingest paths so they can't drift:
 *   - scripts/chat-ingest.ts (bulk CSV ingest)
 *   - app/api/shopify/products-webhook (live create/update/delete sync)
 *
 * A product is excluded when it is not meant for public, in-stock sale via
 * Coco: pure tools/accessories with no KB value, anything the store hides
 * (`hidden`) or restricts to existing customers (`existing-customers-only`,
 * e.g. the Bond + Sealant refill), or anything not in `active` status.
 */

/** Whole-tag tokens (case-insensitive) that exclude a product from the KB. */
export const KB_EXCLUDED_PRODUCT_TAGS = ["hidden", "existing-customers-only"] as const;

/**
 * Handles that never belong in the KB. `cocolash-bond-sealant-duo` is an
 * existing-customers-only refill SKU — Coco must never surface, price, or link
 * it. The others are pure tools/accessories with no recommendation value.
 */
export const KB_SKIP_PRODUCT_HANDLES: ReadonlySet<string> = new Set([
  "bag",
  "fan",
  "lash-wand",
  "cocolash-bond-sealant-duo",
]);

export interface KbProductLike {
  handle?: string | null;
  /** Comma-separated string (CSV/webhook) or already-split array. */
  tags?: string | ReadonlyArray<string> | null;
  /** Shopify product status; only `active` products belong in the KB. */
  status?: string | null;
}

/**
 * True when a Shopify product must be excluded from Coco's knowledge base.
 * Keeping this in one place means a tag/status change in Shopify (e.g. hiding a
 * product) automatically removes it from Coco without a code change.
 */
export function isExcludedFromKb(p: KbProductLike): boolean {
  if (p.handle && KB_SKIP_PRODUCT_HANDLES.has(p.handle)) return true;

  const tokens = (Array.isArray(p.tags) ? p.tags : String(p.tags ?? "").split(","))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (KB_EXCLUDED_PRODUCT_TAGS.some((t) => tokens.includes(t))) return true;

  // Only active products belong in the KB (skip draft/archived).
  if (p.status && p.status.toLowerCase() !== "active") return true;

  return false;
}
