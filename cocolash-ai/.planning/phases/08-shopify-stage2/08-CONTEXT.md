# Phase 8: Stage 2 Shopify deployment — Context

**Phase boundary:** Convert from Stage-1 `theme.liquid` snippet to a one-click Shopify Custom App install with a Theme App Extension that injects the widget loader and an App Proxy that routes customer-aware actions through HMAC-signed requests.

**Reqs:** SHOP-05, DEPLOY-02, DEPLOY-03, DEPLOY-04, OPS-07.

## Decisions

- **D-01 — Custom App, not App Store.** Faith owns one Shopify store; we install our app privately. No public review.
- **D-02 — App Proxy at `/apps/cocolash-chat`.** Shopify forwards `/apps/cocolash-chat/*` to `<our deployed app>/api/shopify/proxy/*`, signing the request via a `signature` query parameter (HMAC-SHA256 hex of the *sorted query string* without the signature itself).
- **D-03 — App Proxy HMAC verifier:** new `lib/shopify/app-proxy-hmac.ts` (different from `lib/shopify/hmac.ts` which handles webhook HMAC; webhooks sign the body, App Proxy signs the query). Uses `crypto.timingSafeEqual` and `SHOPIFY_APP_API_SECRET`.
- **D-04 — App Proxy entry route:** `app/api/shopify/proxy/[...path]/route.ts` accepts GET/POST, verifies the HMAC, then dispatches:
  - `chat` → forward to `/api/chat` (preserving body + adding `x-shop-domain` + `logged_in_customer_id`)
  - `chat/lead` → `/api/chat/lead`
  - `chat/tryon` → `/api/chat/tryon`
  - other paths return 404
- **D-05 — TAE block:** a single Liquid block at `extensions/cocolash-chat-block/blocks/widget.liquid` that emits the same boot snippet as `public/widget/embed.html` but reads settings from app-block schema (Faith can override the API base URL from the theme editor).
- **D-06 — Customer recognition:** App Proxy auto-injects `logged_in_customer_id` into the query string when the visitor is logged in. The proxy route extracts it and passes through the existing `customerId` body field to `/api/chat`.
- **D-07 — Settings UI in TAE:** schema fields for `api_base_url`, `enabled` toggle. Faith manages these in Online Store → Customize → App embeds.
- **D-08 — Cutover:** Stage 1 keeps running until Stage 2 is live; the user removes the `theme.liquid` snippet AFTER enabling the TAE block. No code change needed in `widget.js`.

## Files

```
lib/shopify/app-proxy-hmac.ts
lib/shopify/app-proxy-hmac.test.ts
app/api/shopify/proxy/[...path]/route.ts
extensions/cocolash-chat-block/shopify.extension.toml
extensions/cocolash-chat-block/blocks/widget.liquid
extensions/cocolash-chat-block/locales/en.default.json
docs/SHOPIFY-DEPLOY.md
```

## Canonical refs

- `public/widget/embed.html` — Stage 1 snippet (parallel structure)
- `lib/shopify/hmac.ts` — webhook HMAC (different scheme; for reference)
- Shopify docs: App Proxy HMAC = HMAC-SHA256-hex over sorted query string with `signature` removed; payload concat as `key=value&key=value` (NO url encoding); secret = app's API secret.

---

*Phase 8 context: 2026-05-02*
