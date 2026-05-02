# Phase 4: Shopify Storefront — Verification

**Date:** 2026-05-02
**Outcome:** ✅ Code complete, 58/58 tests, build green, widget bundle 11.51 KB gz.

## Success criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Asking for in-stock volume lashes returns live data | ⚠ Pending live (needs `SHOPIFY_STOREFRONT_API_TOKEN`) |
| 2 | Add to cart from card opens cart with the variant | ⚠ Pending live (deep link valid pattern) |
| 3 | OOS product → in-stock alternative recommended | ✅ Code path verified in `findAlternative` |
| 4 | 429 → cache fallback / "live data unavailable" | ✅ Code path verified in `gqlFetch` |
| 5 | Webhook updates `knowledge_chunks` within 5s + HMAC fail = 401 | ✅ Code path; live test requires Faith's store admin |
| 6 | Eval retrieval@6 ≥ 0.9 maintained | ⚠ Re-runs after deploy |

## Tests

```
npm test    → 58/58 pass (added 11 cache + 6 hmac)
npm run build → /api/chat, /api/chat/config, /api/shopify/products-webhook all registered
widget build  → 11.51 KB gz (budget 50 KB)
```

## Files

```
lib/shopify/{types,cache,storefront,hmac}.ts
lib/shopify/{hmac,cache}.test.ts
lib/chat/product-context.ts
app/api/shopify/products-webhook/route.ts
widget/src/components/ProductCards.tsx
widget/src/styles/widget.css (product-card styles)
widget/src/lib/state.ts + useChat.ts (products attach)
widget/src/components/MessageList.tsx (renders ProductCards)
app/api/chat/route.ts (emits SSE products event)
middleware.ts (publicPaths += webhook + chat + widget.js)
```

## Commits

```
8ffb2d8 docs: phase 4 context + plan
f4c9b03 feat(shopify): Storefront API client + LRU cache + types
06cda80 feat(chat): live Shopify product context + SSE products event
30c9f05 feat(widget): product cards rendered inline in chat
(this) feat(shopify): HMAC-verified products webhook + tests + middleware
```

## What the user must do

1. **Apply the second Phase 1 migration** (Phase 2's `match_knowledge_chunks` RPC).
2. **Set the Shopify env vars** in `.env.local`:
   - `SHOPIFY_STORE_DOMAIN=cocolash.myshopify.com`
   - `SHOPIFY_STOREFRONT_API_TOKEN=...` (Storefront API access token from Faith/Aqsa)
   - `SHOPIFY_WEBHOOK_SECRET=...` (any random 32-char string; configure same in Shopify admin)
3. **Configure webhooks** in Shopify Admin → Settings → Notifications → Webhooks:
   - `products/create` → `https://<deployed>/api/shopify/products-webhook`
   - `products/update` → same
   - `products/delete` → same
   - All using the `SHOPIFY_WEBHOOK_SECRET` shared secret.
4. Verify a manual product save in Shopify produces a row in `knowledge_chunks` with `source_type='storefront_api'`.

---

*Phase 4 closed: 2026-05-02. Proceeding to Phase 5.*
