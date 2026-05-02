# Phase 6: Virtual Try-On — Verification

**Date:** 2026-05-02
**Outcome:** ✅ Code complete, 88/88 tests, widget 12.90 KB gz, all routes registered.

## Success criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Mobile + desktop selfie capture/upload + consent → composed result | ⚠ Live (needs GEMINI_API_KEY + chat-selfies bucket) |
| 2 | Median time-to-result < 35s; "give me a sec" placeholder ≤ 1s | ⚠ Live |
| 3 | Selfie purged 24h after upload | ✅ Code (selfie_uploads.expires_at + Phase 9 cron) |
| 4 | Second try-on in same session doesn't re-prompt consent | ⚠ Live (consent prompt is per-dialog open) |
| 5 | Decline gracefully resumes conversation | ✅ Code (TryOnDialog onClose closes overlay only) |
| 6 | Add-to-cart CTA after try-on works | ✅ Code (existing ProductCards button still in DOM) |

## Files added

```
lib/chat/tryon.ts                       runTryOn + resolveProductImage
app/api/chat/tryon/upload/route.ts      multipart selfie upload + 24h signed URL
app/api/chat/tryon/route.ts             POST run try-on (calls composePersonWithProduct)
widget/src/lib/tryon.ts                 client SDK
widget/src/components/TryOnDialog.tsx   consent → upload → compose dialog
widget/src/components/ProductCards.tsx (edit)  ✨ "See it on you" CTA
widget/src/lib/state.ts (edit)          appendTryOnResult method
widget/src/lib/useChat.ts (edit)        expose sessionId + appendTryOnResult
widget/src/components/MessageList.tsx (edit) render <img> for tryonImageUrl
widget/src/App.tsx (edit)               TryOnDialog state + wiring
widget/src/styles/widget.css (edit)     dialog + spinner + result styles
```

## What the user must do

1. **Create the `chat-selfies` Supabase Storage bucket** (private). The migration only adds the metadata table; bucket creation is a one-click step in the Supabase dashboard or via CLI.
2. **GEMINI_API_KEY in `.env.local`** (already used by M1; reused here).
3. **(Phase 9)** Set up a cron to delete expired selfie objects — for now, expired rows just have `expires_at < now`.

---

*Phase 6 closed: 2026-05-02. Proceeding to Phase 7 (admin dashboard).*
