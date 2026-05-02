# Phase 5: Discount + Leads — Verification

**Date:** 2026-05-02
**Outcome:** ✅ Code complete, 88/88 tests, all routes registered.

## Success criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Volume-lash purchase intent → configured volume code | ⚠ Live test pending discount-import + Phase 4 product cards |
| 2 | Bot never offers expired or out-of-window codes | ✅ `isWithinWindow` unit-tested |
| 3 | Combinability honored | ✅ `combinability` jsonb mirrors CSV; bot only ever offers ONE code (Stage 1) |
| 4 | Lead-capture flow end-to-end | ✅ Code path; `/api/chat/lead` registered |
| 5 | After-hours messaging | ✅ Already wired in Phase 2; verified via `composeSystemPrompt` test |
| 6 | Non-combinable code on existing cart → polite apology | ⚠ Stage 2 (App Proxy applies codes server-side; Stage 1 just suggests) |

## Tests

```
npm test → 88/88 pass (added 17 discount + 6 lead-validation = 30 new)
build    → /api/chat/lead registered alongside chat, config, shopify
```

## Files

```
lib/chat/discount.ts                 selector + filters + describeRule
lib/chat/discount.test.ts            17 tests
lib/chat/lead-validation.ts          Zod schema for POST /api/chat/lead
lib/chat/lead-validation.test.ts     6 tests
lib/chat/notify.ts                   Resend send (no SDK; raw fetch) + dry-run fallback
app/api/chat/lead/route.ts           POST handler + CORS
scripts/discount-import.ts           idempotent CSV → discount_rules upsert
.env.example (edit)                  RESEND_API_KEY, LEAD_EMAIL_FROM, LEAD_EMAIL_DRY_RUN
app/api/chat/route.ts (edit)         fetchActiveDiscounts + selectDiscountForTurn → composeSystemPrompt
```

## What the user must do

1. **Apply Phase 1+2 migrations**, then **run `npx tsx scripts/discount-import.ts`** to seed discount_rules from `public/brand/discounts_export.csv`.
2. (Optional) Set `RESEND_API_KEY` + `LEAD_EMAIL_FROM` in `.env.local`. Without them, leads are persisted to Supabase but emails are logged to stdout (`LEAD_EMAIL_DRY_RUN=true` works the same way).
3. Set `CHATBOT_SUPPORT_EMAIL` to the inbox Faith wants leads delivered to (default `support@cocolash.com`).

---

*Phase 5 closed: 2026-05-02. Proceeding to Phase 6.*
