# Phase 5: Discount engine + lead capture + escalation — Context

**Phase boundary:** Bot offers a code at the right moment, captures leads with explicit email consent, escalates politely after-hours. Stage 1 — rules seeded from CSV; admin UI for editing rules lands in Phase 7.

**Reqs covered:** CHAT-06, CHAT-07, SHOP-04, LEAD-01, LEAD-02, LEAD-03, LEAD-04.

## Decisions

- **D-01 — Discount selection:** `lib/chat/discount.ts:selectDiscountForTurn(intent, productHandles, currentTime)` returns the highest-priority active rule whose:
  - `status='active'`
  - `campaign_window` contains now (or window is null = always active)
  - `usage_limit_per_code` not exceeded (read `times_used`)
  - `intent_triggers` includes the current intent OR is empty
  - `product_line_scope` matches at least one product handle (or empty)
  Tie-breaker: highest `value` for percentage codes; first-by-id otherwise.
- **D-02 — Combinability:** the bot is only ever told ONE code per turn. Stacking multiple is a Stage 2 feature when App Proxy can apply codes server-side. For Phase 5 a single code is offered and the user applies it at checkout.
- **D-03 — Lead-capture flow:**
  1. Visitor types something like "I'm not ready yet" / asks for a discount / says they want to think → intent classifier flags `lead_capture`.
  2. Bot uses the `lead_capture` voice fragment + the discount code (if available) and asks for an email.
  3. Visitor types an email; client posts to `POST /api/chat/lead`.
  4. Server validates, persists into `lead_captures`, sends email to `support@cocolash.com`.
- **D-04 — Email transport:** Resend SDK if Faith provides a key; otherwise stub that just logs. Resend is the lowest-friction Vercel-native option. Fallback flag: `LEAD_EMAIL_DRY_RUN=true` keeps everything except the actual send.
- **D-05 — Email validation:** RFC-light regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) plus a length cap of 254. We don't attempt deliverability validation — Resend handles bouncing.
- **D-06 — After-hours messaging** is already wired: when `isBusinessHours()` is false, the after-hours suffix is appended to the escalation fragment by `composeSystemPrompt`. Phase 5 verifies the contract.
- **D-07 — CSV import script** at `scripts/discount-import.ts`. Reads `public/brand/discounts_export.csv`, mirrors the `Combines with *` columns into the `combinability` jsonb, copies `Times Used`, `Applies Once Per Customer`, `Usage Limit Per Code`, `Status`, `Start`, `End`, and the `Customer Selection` field. Idempotent via UNIQUE(code).
- **D-08 — Admin UI deferred to Phase 7.** Phase 5 ships the schema + rule selector + import script + lead route + email transport.

## Files

```
lib/chat/discount.ts            — selectDiscountForTurn + types
lib/chat/notify.ts              — sendLeadEmail (Resend or stub)
lib/chat/lead-validation.ts     — email + payload schema (Zod)
app/api/chat/lead/route.ts      — POST handler for lead capture
scripts/discount-import.ts      — one-shot CSV → discount_rules
app/api/chat/route.ts (edit)    — call selectDiscountForTurn, pass to composeSystemPrompt
.env.example (edit)             — RESEND_API_KEY, LEAD_EMAIL_FROM, LEAD_EMAIL_DRY_RUN
```

## Canonical refs
- `public/brand/discounts_export.csv` — 154 rows of canonical codes
- `supabase/migrations/20260502_chatbot_foundation.sql` — discount_rules schema

---

*Phase 5 — 2026-05-02*
