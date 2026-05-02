/**
 * lib/shopify/storefront.ts — Storefront API client.
 *
 * GraphQL POST to https://{shop}/api/{version}/graphql.json with the
 * X-Shopify-Storefront-Access-Token header. Reads SHOPIFY_STORE_DOMAIN,
 * SHOPIFY_STOREFRONT_API_TOKEN, SHOPIFY_STOREFRONT_API_VERSION at call
 * time so unit tests can stub via process.env.
 *
 * Cache: in-memory LRU per process. 429 responses fall back to cached
 * data; cache miss + 429 returns null.
 */

import { LruCache } from "./cache";
import {
  ShopifyError,
  type ShopifyProduct,
  type ProductCard,
} from "./types";

interface StorefrontConfig {
  storeDomain: string;
  token: string;
  apiVersion: string;
}

function readConfig(): StorefrontConfig {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_API_TOKEN;
  if (!storeDomain) {
    throw new ShopifyError(
      "SHOPIFY_STORE_DOMAIN not configured",
      500,
      "missing_api_key"
    );
  }
  if (!token) {
    throw new ShopifyError(
      "SHOPIFY_STOREFRONT_API_TOKEN not configured",
      500,
      "missing_api_key"
    );
  }
  return {
    storeDomain,
    token,
    apiVersion: process.env.SHOPIFY_STOREFRONT_API_VERSION ?? "2025-01",
  };
}

const cache = new LruCache<ShopifyProduct>(50, 15 * 60 * 1000);

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

/**
 * Storefront API supports two token types with different headers:
 *   - Public access token  → `X-Shopify-Storefront-Access-Token`
 *     (safe in browsers; rate-limited per IP)
 *   - Private access token → `Shopify-Storefront-Private-Token`
 *     (server-side only; better rate limits; never expose to clients)
 *
 * We auto-detect by the `shpat_` prefix Shopify uses for private tokens
 * generated via the Headless channel. Either token works; private is
 * preferred since /api/chat runs server-side.
 */
function tokenHeader(token: string): Record<string, string> {
  if (token.startsWith("shpat_")) {
    return { "Shopify-Storefront-Private-Token": token };
  }
  return { "X-Shopify-Storefront-Access-Token": token };
}

async function gqlFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const cfg = readConfig();
  const url = `https://${cfg.storeDomain}/api/${cfg.apiVersion}/graphql.json`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...tokenHeader(cfg.token),
        accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    throw new ShopifyError(
      `Storefront network error: ${err instanceof Error ? err.message : String(err)}`,
      502,
      "network_error"
    );
  }

  if (res.status === 429) {
    throw new ShopifyError("Storefront rate limit", 429, "rate_limited");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ShopifyError(
      `Storefront HTTP ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      "graphql_error"
    );
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors && json.errors.length > 0) {
    throw new ShopifyError(
      `Storefront GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
      502,
      "graphql_error"
    );
  }
  if (!json.data) {
    throw new ShopifyError("Storefront returned no data", 502, "graphql_error");
  }
  return json.data;
}

// ── GraphQL queries ───────────────────────────────────────────

const PRODUCT_FRAGMENT = `
fragment Product on Product {
  id
  handle
  title
  description
  productType
  tags
  totalInventory
  availableForSale
  featuredImage { url altText }
  priceRange {
    minVariantPrice { amount currencyCode }
    maxVariantPrice { amount currencyCode }
  }
  variants(first: 10) {
    nodes {
      id
      title
      availableForSale
      price { amount currencyCode }
    }
  }
}
`.trim();

const SEARCH_QUERY = `
${PRODUCT_FRAGMENT}
query Search($query: String!, $first: Int!) {
  products(first: $first, query: $query) {
    nodes { ...Product }
  }
}
`.trim();

const BY_HANDLE_QUERY = `
${PRODUCT_FRAGMENT}
query ByHandle($handle: String!) {
  product(handle: $handle) { ...Product }
}
`.trim();

/**
 * Build an aliased multi-handle query at runtime. Shopify Storefront's
 * `products(query: "handle:foo")` is a fuzzy keyword search and can
 * return false matches; the only reliable way to batch-fetch by exact
 * handle is N aliased `productByHandle` calls in one request.
 */
function buildByHandlesQuery(count: number): string {
  const aliases = Array.from({ length: count }, (_, i) =>
    `p${i}: product(handle: $h${i}) { ...Product }`
  ).join("\n  ");
  const params = Array.from({ length: count }, (_, i) => `$h${i}: String!`).join(", ");
  return `${PRODUCT_FRAGMENT}
query ByHandles(${params}) {
  ${aliases}
}`.trim();
}

// ── Public API ────────────────────────────────────────────────

export async function searchProducts(query: string, first: number = 5): Promise<ShopifyProduct[]> {
  const cacheKey = `search:${query}:${first}`;
  const cached = cache.get(cacheKey);
  if (cached) return [cached];

  try {
    const data = await gqlFetch<{ products: { nodes: ShopifyProduct[] } }>(SEARCH_QUERY, {
      query,
      first,
    });
    const products = (data.products?.nodes ?? []).map(normalizeProduct);
    return products;
  } catch (err) {
    if (err instanceof ShopifyError && err.code === "rate_limited") {
      // best-effort fallback: nothing in the shared `cacheKey` cache by query
      return [];
    }
    throw err;
  }
}

export async function getProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const cacheKey = `handle:${handle}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await gqlFetch<{ product: ShopifyProduct | null }>(BY_HANDLE_QUERY, {
      handle,
    });
    if (!data.product) return null;
    const normalized = normalizeProduct(data.product);
    cache.set(cacheKey, normalized);
    return normalized;
  } catch (err) {
    if (err instanceof ShopifyError && err.code === "rate_limited") {
      return cache.get(cacheKey);
    }
    throw err;
  }
}

export async function getProductsByHandles(handles: ReadonlyArray<string>): Promise<ShopifyProduct[]> {
  if (handles.length === 0) return [];
  const cached: ShopifyProduct[] = [];
  const missing: string[] = [];
  for (const h of handles) {
    const c = cache.get(`handle:${h}`);
    if (c) cached.push(c);
    else missing.push(h);
  }
  if (missing.length === 0) return cached;

  try {
    const query = buildByHandlesQuery(missing.length);
    const variables: Record<string, string> = {};
    missing.forEach((h, i) => { variables[`h${i}`] = h; });
    const data = await gqlFetch<Record<string, ShopifyProduct | null>>(query, variables);
    const fetched: ShopifyProduct[] = [];
    for (let i = 0; i < missing.length; i++) {
      const node = data[`p${i}`];
      if (node) fetched.push(normalizeProduct(node));
    }
    for (const p of fetched) cache.set(`handle:${p.handle}`, p);
    return [...cached, ...fetched];
  } catch (err) {
    if (err instanceof ShopifyError && err.code === "rate_limited") {
      return cached;
    }
    throw err;
  }
}

function normalizeProduct(p: ShopifyProduct & { variants: { nodes?: ShopifyProduct["variants"] } | unknown }): ShopifyProduct {
  // Shopify's GraphQL returns connections with .nodes; flatten for simpler downstream.
  const variantsRaw =
    (p as { variants: { nodes?: ShopifyProduct["variants"] } | ShopifyProduct["variants"] }).variants;
  const variants =
    variantsRaw && typeof variantsRaw === "object" && "nodes" in variantsRaw
      ? (variantsRaw as { nodes: ShopifyProduct["variants"] }).nodes ?? []
      : (variantsRaw as ShopifyProduct["variants"]) ?? [];
  return {
    ...(p as ShopifyProduct),
    variants,
  };
}

export function cartPermalink(
  variantId: string,
  quantity: number = 1,
  storeDomain?: string,
  discountCode?: string | null
): string {
  // Shopify supports the "online store" /cart/{numericVariantId}:{qty} permalink
  // with optional ?discount=CODE; we extract the numeric ID from the gid string.
  const numericId = variantId.match(/\/(\d+)$/)?.[1] ?? variantId;
  const domain = storeDomain ?? process.env.SHOPIFY_STORE_DOMAIN ?? "cocolash.com";
  const publicDomain = domain.endsWith(".myshopify.com")
    ? domain
    : domain.replace(/^https?:\/\//, "");
  const base = `https://${publicDomain}/cart/${numericId}:${quantity}`;
  return discountCode ? `${base}?discount=${encodeURIComponent(discountCode)}` : base;
}

/** Convert a ShopifyProduct into the compact ProductCard shape. */
export function productToCard(
  p: ShopifyProduct,
  discountCode?: string | null
): ProductCard {
  const firstAvailable = p.variants.find((v) => v.availableForSale) ?? p.variants[0];
  const variantId = firstAvailable?.id ?? "";
  return {
    handle: p.handle,
    title: p.title,
    description: shortDescription(p.description),
    image: p.featuredImage
      ? { url: p.featuredImage.url, alt: p.featuredImage.altText ?? p.title }
      : null,
    priceFrom: formatPrice(p.priceRange.minVariantPrice.amount),
    priceTo: formatPrice(p.priceRange.maxVariantPrice.amount),
    currency: p.priceRange.minVariantPrice.currencyCode,
    available: p.availableForSale,
    productUrl: `https://${process.env.SHOPIFY_STORE_DOMAIN ?? "cocolash.com"}/products/${p.handle}`.replace(/(\.myshopify)\.com/, "$1.com"),
    addToCartUrl: variantId ? cartPermalink(variantId, 1, undefined, discountCode) : "",
  };
}

function shortDescription(input: string): string {
  if (!input) return "";
  const trimmed = input.replace(/\s+/g, " ").trim();
  return trimmed.length > 200 ? trimmed.slice(0, 197) + "…" : trimmed;
}

function formatPrice(amount: string): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return amount;
  return n.toFixed(2);
}

/** Exported for tests. Caller resets cross-test state. */
export function _resetCache(): void {
  cache.clear();
}
