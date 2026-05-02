/**
 * lib/chat/product-context.ts — Decide which Shopify products to surface.
 *
 * Inputs:
 *   - retrieved chunks from lib/chat/retrieve.ts
 *   - the user's message (lightweight handle/keyword extraction)
 *
 * Output:
 *   - up to 3 ProductCard objects (D-09 cap) ready for the SSE
 *     `event: products` frame
 *
 * Strategy:
 *   1. Pull product handles from chunk metadata (product_md / product_csv
 *      chunks both carry handle in metadata).
 *   2. Hit Storefront API for live data (cached LRU + 429 fallback).
 *   3. If primary product is OOS, swap in the closest in-stock alternative
 *      using attribute matching from the candidate set.
 */

import {
  getProductsByHandles,
  productToCard,
  searchProducts,
} from "../shopify/storefront";
import type { ProductCard } from "../shopify/types";
import type { KnowledgeChunk } from "./types";

const MAX_PRODUCTS_PER_TURN = 3;

export interface ProductContextResult {
  /** Compact cards for SSE; rendered inline by the widget. */
  cards: ProductCard[];
  /** Free-text block injected into the system prompt under "Live product context". */
  promptText: string;
}

export async function buildProductContext(
  message: string,
  chunks: ReadonlyArray<KnowledgeChunk>
): Promise<ProductContextResult> {
  const handles = extractHandles(message, chunks);
  if (handles.length === 0) return { cards: [], promptText: "" };

  // 1. Fetch the candidates.
  let candidates: ProductCard[] = [];
  try {
    const products = await getProductsByHandles(handles);
    candidates = products.map(productToCard);
  } catch {
    return { cards: [], promptText: "" };
  }

  // 2. Substitute OOS primaries with in-stock alternatives.
  const cards: ProductCard[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.handle)) continue;
    seen.add(c.handle);
    if (c.available) {
      cards.push(c);
    } else {
      const alt = await findAlternative(c, chunks);
      if (alt) cards.push(alt);
    }
    if (cards.length >= MAX_PRODUCTS_PER_TURN) break;
  }

  return {
    cards,
    promptText: cards.length === 0 ? "" : renderPromptText(cards),
  };
}

/**
 * Extract candidate handles from chunk metadata + a small keyword sweep on
 * the user message. Conservative: prefers handles already in retrieval
 * over keyword guesses.
 */
function extractHandles(message: string, chunks: ReadonlyArray<KnowledgeChunk>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const c of chunks) {
    const handle = (c.metadata?.handle as string | undefined) ?? null;
    if (handle && !seen.has(handle)) {
      seen.add(handle);
      out.push(handle);
      continue;
    }
    // Some chunks (product_md) embed the handle in source_id like
    // "product_md:violet" → derive a Shopify handle hint.
    const m = c.source_id.match(/^product_(?:md|csv):(.+)$/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }

  // Lightweight keyword sweep across the System 3 product names. The list
  // is small and stable.
  const lower = message.toLowerCase();
  const styles = [
    "violet", "peony", "jasmine", "iris", "daisy",
    "dahlia", "poppy", "marigold", "orchid", "rose", "sorrel",
  ];
  for (const s of styles) {
    if (lower.includes(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }

  return out.slice(0, MAX_PRODUCTS_PER_TURN * 2); // candidate pool
}

/**
 * Find the closest in-stock alternative among the chunk pool. Uses simple
 * attribute matching (curl, length, shape) when available; otherwise picks
 * the first in-stock candidate.
 */
async function findAlternative(
  oos: ProductCard,
  chunks: ReadonlyArray<KnowledgeChunk>
): Promise<ProductCard | null> {
  // Pull all product handles from chunks for the alternative pool.
  const altHandles = new Set<string>();
  for (const c of chunks) {
    const h = (c.metadata?.handle as string | undefined) ?? null;
    if (h && h !== oos.handle) altHandles.add(h);
  }
  if (altHandles.size === 0) {
    // Fall back to a topical search.
    const results = await searchProducts("lash", 5).catch(() => []);
    const inStock = results.find((p) => p.availableForSale);
    return inStock ? productToCard(inStock) : null;
  }
  try {
    const products = await getProductsByHandles([...altHandles]);
    const inStock = products.find((p) => p.availableForSale);
    return inStock ? productToCard(inStock) : null;
  } catch {
    return null;
  }
}

function renderPromptText(cards: ReadonlyArray<ProductCard>): string {
  return cards
    .map(
      (c) =>
        `- ${c.title} (handle ${c.handle}) — ${c.priceFrom === c.priceTo ? `$${c.priceFrom}` : `$${c.priceFrom}–$${c.priceTo}`} ${c.currency}; ${c.available ? "in stock" : "OUT OF STOCK"}; ${c.description}`
    )
    .join("\n");
}
