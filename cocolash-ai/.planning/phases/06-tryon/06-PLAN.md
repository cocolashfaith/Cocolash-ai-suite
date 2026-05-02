# Phase 6: Virtual Try-On — Plan

| # | Task | Files | Commit |
|---|---|---|---|
| 1 | tryon orchestrator + lookup of product image | `lib/chat/tryon.ts` | A |
| 2 | upload route (multipart + bucket + expires_at) | `app/api/chat/tryon/upload/route.ts` | A |
| 3 | run-tryon route (calls composePersonWithProduct) | `app/api/chat/tryon/route.ts` | B |
| 4 | widget: TryOnButton + dialog + flow | `widget/src/components/TryOnButton.tsx`, `widget/src/components/TryOnDialog.tsx`, `widget/src/lib/tryon.ts`, CSS | C |
| 5 | wire ProductCards → TryOnButton | `widget/src/components/ProductCards.tsx` (edit), state.ts (edit) | C |
| 6 | tests + verify | — | D |

**Cannot verify autonomously:** live Gemini call (needs `GEMINI_API_KEY`), bucket upload (needs Supabase + bucket creation).

---

*Phase 6 plan: 2026-05-02*
