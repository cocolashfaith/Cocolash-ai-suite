# Phase 5: Discount + Leads — Plan

| # | Task | Files | Commit |
|---|---|---|---|
| 1 | Discount selector | `lib/chat/discount.ts` | A |
| 2 | Lead validation + notify | `lib/chat/lead-validation.ts`, `lib/chat/notify.ts` | A |
| 3 | POST `/api/chat/lead` | `app/api/chat/lead/route.ts` | B |
| 4 | Wire discount + business hours into `/api/chat` | `app/api/chat/route.ts` (edit) | B |
| 5 | CSV import script | `scripts/discount-import.ts` | C |
| 6 | Update `.env.example` (Resend) | `.env.example` | C |
| 7 | Tests | `lib/chat/discount.test.ts`, `lib/chat/lead-validation.test.ts` | D |
| 8 | Verify | — | E |

**Cannot verify autonomously:** live email send (Resend key), discount rule activation against real conversations.

---

*Phase 5 plan: 2026-05-02*
