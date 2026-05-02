# Phase 4: Shopify Storefront integration — Context

**Phase boundary:** Bot answers product questions with real-time data and renders product cards inline; nightly Shopify webhook syncs the catalog into `knowledge_chunks` (tier 3). Stage 1 deep-link add-to-cart only — App Proxy server-side cart mutation lands in Phase 8.

**Reqs covered:** SHOP-01, SHOP-02, SHOP-03, SHOP-06, SHOP-07, SHOP-08.

## Decisions

- **D-01 — Storefront API version:** `2025-01` (latest stable). Endpoint:
  `https://{shop_domain}/api/{version}/graphql.json`. GraphQL only.
- **D-02 — `lib/shopify/storefront.ts`** exposes typed methods:
  `searchProducts`, `getProductByHandle`, `getProductsByIds`, `cartPermalink`.
  Errors throw `ShopifyError` (mirrors `ChatError` pattern).
- **D-03 — Cache:** in-memory LRU (50 entries, 15 min TTL) + Supabase
  `knowledge_chunks` (tier=3, `source_type='storefront_api'`) as the
  durable layer. Memory cache is per process; webhook updates invalidate
  the durable layer.
- **D-04 — Rate limit (429) fallback:** serve from cache if available;
  otherwise return `null` and the bot says "live data unavailable, here's
  what I know from the catalog…" — relies on tier-2 product chunks.
- **D-05 — Stage 1 add-to-cart** uses Shopify's universal `cart/{variantId}:1`
  permalink. Stage 2 (Phase 8) replaces with App Proxy + Storefront
  `cart.linesAdd` mutation so discounts can be applied server-side.
- **D-06 — `event: products` SSE frame** is emitted by `/api/chat` after
  the assistant finishes streaming when at least one product was selected.
  Frame data: `{ products: [{ handle, title, price, image, available }] }`.
  The widget renders cards under the assistant bubble.
- **D-07 — OOS alternative:** when a recommended product has all variants
  out of stock, `lib/chat/product-context.ts` calls `searchProducts` for
  similar attributes (curl, length, shape, volume — matched against the
  knowledge_chunks metadata) and substitutes the first in-stock match.
- **D-08 — Nightly webhook** at `POST /api/shopify/products-webhook` —
  HMAC-verified using `crypto.timingSafeEqual` (no URL-token fallback;
  fixes the pattern flagged in CONCERNS.md). On `products/update` and
  `products/create`, upserts into `knowledge_chunks` with `tier=3`. On
  `products/delete`, removes the chunk.
- **D-09 — Product context selection:** consult retrieved chunks; if any
  chunk has `source_id` matching a known product handle, fetch live data
  for at most 3 products per turn. Cap controls cost + payload.

## Canonical refs

- `.planning/codebase/INTEGRATIONS.md` — existing Shopify environment in product CSV (none yet — this phase introduces the API client)
- `public/brand/products_export_1 (1).csv` — handles + variant IDs
- `lib/seedance/client.ts` — error class + retry pattern to mirror
- `app/api/seedance/webhook/route.ts` — HMAC pattern to **improve on**: drop URL-token fallback (CONCERNS.md HIGH item)

---

*Phase 4 — 2026-05-02*
