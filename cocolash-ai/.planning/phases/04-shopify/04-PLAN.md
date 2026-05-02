# Phase 4: Shopify Storefront — Plan

| # | Task | Files | Commit |
|---|---|---|---|
| 1 | Storefront client + types + LRU cache | `lib/shopify/{storefront,types,cache}.ts` | A |
| 2 | Product context helper | `lib/chat/product-context.ts` | B |
| 3 | `/api/chat` emits `event: products` | `app/api/chat/route.ts` (edit) | B |
| 4 | Widget product card component + style + render | `widget/src/components/ProductCard.tsx`, CSS, useChat handler | C |
| 5 | Webhook handler (HMAC verified) | `app/api/shopify/products-webhook/route.ts` | D |
| 6 | Unit tests for cache + context selection + HMAC verifier | `lib/shopify/*.test.ts`, `lib/chat/product-context.test.ts` | E |
| 7 | Verify: tests + build + widget bundle | — | F (only if needed) |

**Cannot verify autonomously:** live API calls (need `SHOPIFY_STOREFRONT_API_TOKEN`); webhook delivery (needs Faith's store admin to configure); add-to-cart deep links (need a real variant ID).

---

*Plan: 2026-05-02*
