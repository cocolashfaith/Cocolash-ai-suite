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

/**
 * Keyword → real Shopify handle. Lazy, populated on first miss via
 * Storefront search. Persists for the process lifetime so Faith can
 * rename products without a redeploy. `null` records a confirmed miss
 * to avoid re-searching for words that aren't products.
 */
const STYLE_HANDLE_CACHE = new Map<string, string | null>();

const STYLE_KEYWORDS = [
  "violet", "peony", "jasmine", "iris", "daisy",
  "dahlia", "poppy", "marigold", "orchid", "rose", "sorrel",
] as const;

export interface ProductContextResult {
  /** Compact cards for SSE; rendered inline by the widget. */
  cards: ProductCard[];
  /** Free-text block injected into the system prompt under "Live product context". */
  promptText: string;
}

export async function buildProductContext(
  message: string,
  chunks: ReadonlyArray<KnowledgeChunk>,
  recentAssistantText: string = "",
  discountCode: string | null = null
): Promise<ProductContextResult> {
  const handles = extractHandles(message, chunks, recentAssistantText);
  if (handles.length === 0) return { cards: [], promptText: "" };

  // Phase 11 fix #2: when the user's message names exactly ONE product, only
  // surface that one card. Asking "tell me about Dahlia" should NOT pad the
  // result with two unrelated retrieval-derived candidates.
  const userKeywords = (STYLE_KEYWORDS as ReadonlyArray<string>).filter(
    (s) => message.toLowerCase().includes(s)
  );
  const isSingleProductRequest = userKeywords.length === 1;

  // 1. Fetch the candidates by direct handle.
  let candidates: ProductCard[] = [];
  try {
    const products = await getProductsByHandles(handles);
    candidates = products.map((p) => productToCard(p, discountCode));
  } catch {
    return { cards: [], promptText: "" };
  }

  // 1b. For any short style keyword that didn't resolve directly (e.g.
  // "dahlia" → store handle is `dahlia-lash-extensions`), fall back to
  // Storefront search. Cached per process so we hit Shopify at most once
  // per keyword.
  const resolvedHandles = new Set(candidates.map((c) => c.handle));
  const unresolvedKeywords = handles.filter(
    (h) =>
      (STYLE_KEYWORDS as ReadonlyArray<string>).includes(h) &&
      !resolvedHandles.has(h)
  );
  if (unresolvedKeywords.length > 0) {
    const found = await Promise.all(
      unresolvedKeywords.map((kw) => resolveStyleHandle(kw))
    );
    const realHandles = found.filter((h): h is string => h !== null && !resolvedHandles.has(h));
    if (realHandles.length > 0) {
      try {
        const extra = await getProductsByHandles(realHandles);
        for (const p of extra) {
          const card = productToCard(p, discountCode);
          if (!resolvedHandles.has(card.handle)) {
            candidates.push(card);
            resolvedHandles.add(card.handle);
          }
        }
      } catch {
        // best-effort; ignore
      }
    }
  }

  // 2. Substitute OOS primaries with in-stock alternatives.
  // When the user asked about exactly one product, prioritize that product
  // in the candidate ordering so it lands in the cards array even if other
  // chunk-derived candidates were collected first.
  if (isSingleProductRequest) {
    const targetKw = userKeywords[0];
    candidates.sort((a, b) => {
      const aMatches = a.handle.toLowerCase().startsWith(targetKw) || a.title.toLowerCase().startsWith(targetKw);
      const bMatches = b.handle.toLowerCase().startsWith(targetKw) || b.title.toLowerCase().startsWith(targetKw);
      if (aMatches && !bMatches) return -1;
      if (bMatches && !aMatches) return 1;
      return 0;
    });
  }

  const turnCap = isSingleProductRequest ? 1 : MAX_PRODUCTS_PER_TURN;
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
    if (cards.length >= turnCap) break;
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
function extractHandles(
  message: string,
  chunks: ReadonlyArray<KnowledgeChunk>,
  recentAssistantText: string = ""
): string[] {
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

  // Lightweight keyword sweep across the System 3 product names. Scan the
  // user message AND the prior assistant turn, so a generic "yes, try it
  // on" still maps to whichever product Coco just recommended. The keywords
  // are short style names; buildProductContext resolves them to real
  // Shopify handles via search.
  const userLower = message.toLowerCase();
  for (const s of STYLE_KEYWORDS) {
    if (userLower.includes(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  if (recentAssistantText) {
    const assistantLower = recentAssistantText.toLowerCase();
    for (const s of STYLE_KEYWORDS) {
      if (assistantLower.includes(s) && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }

  return out.slice(0, MAX_PRODUCTS_PER_TURN * 2); // candidate pool
}

/**
 * Resolve a short style keyword (e.g. "dahlia") to its real Shopify handle
 * (e.g. "dahlia-lash-extensions") via Storefront search. Cached for the
 * process lifetime; returns `null` if no product matches.
 */
async function resolveStyleHandle(keyword: string): Promise<string | null> {
  if (STYLE_HANDLE_CACHE.has(keyword)) {
    return STYLE_HANDLE_CACHE.get(keyword) ?? null;
  }
  try {
    const results = await searchProducts(keyword, 5);
    const lower = keyword.toLowerCase();
    // Prefer a product whose handle or title actually starts with the
    // keyword, so "rose" doesn't match "Rose-gold sealant" or similar.
    const match = results.find((p) => {
      const h = p.handle?.toLowerCase() ?? "";
      const t = p.title?.toLowerCase() ?? "";
      return h.startsWith(lower) || t.startsWith(lower);
    });
    const resolved = match?.handle ?? null;
    STYLE_HANDLE_CACHE.set(keyword, resolved);
    return resolved;
  } catch {
    // Don't cache transient failures; let the next request retry.
    return null;
  }
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
