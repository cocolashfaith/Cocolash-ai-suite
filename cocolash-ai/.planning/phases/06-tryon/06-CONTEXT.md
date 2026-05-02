# Phase 6: Virtual Try-On — Context

**Phase boundary:** Visitor uploads/captures a selfie with explicit consent, server runs `composePersonWithProduct` on selfie + product image, result renders inline in chat. Selfies expire 24h after upload.

**Reqs:** TRYON-01..08, OPS-05.

## Decisions

- **D-01 — Reuse `composePersonWithProduct`** (lib/gemini/composition.ts) with `pose='selfie'`. Treat it as a stable primitive shipped in M2.
- **D-02 — Selfie upload:** `POST /api/chat/tryon/upload` accepts multipart (max 8 MB JPEG/PNG), writes to the `chat-selfies` Supabase bucket, inserts a `selfie_uploads` row with `expires_at = now + 24h`. Returns `{ url, expiresAt }`.
- **D-03 — Consent gate** is enforced server-side: the upload route requires `consent: true` form field and writes `consent_given_at`. The widget gates the upload UI behind a confirmation step.
- **D-04 — Compose route:** `POST /api/chat/tryon` accepts `{ sessionId, productHandle, selfieUrl }`. Looks up the product image from the KB chunk (or Storefront API), runs the composer, persists the result as a special `chat_messages` row with `tryon_image_url` set, returns `{ composedUrl, messageId }`.
- **D-05 — Trigger logic:** widget shows a "Try it on" CTA on every product card. The bot's prompt (Phase 1's `tryon_offer` fragment) suggests it organically; the CTA is the explicit fallback.
- **D-06 — Storage cleanup:** the migration's `selfie_uploads.expires_at` is leveraged by a Phase 9 cron; for now the column is set so a manual sweep is straightforward. Source selfies are bucket-private + `expires_at`; generated try-ons live in `generated-images` bucket and are referenced from `chat_messages.tryon_image_url`.
- **D-07 — Cost tracking:** records a `tryon_compose` cost event with rough Gemini cost (~$0.02/image — order of magnitude; refine in Phase 9).
- **D-08 — Out-of-scope this phase:** auto-purge cron (Phase 9), saved-try-ons in customer account (v2).

## Files

```
lib/chat/tryon.ts                  Orchestrates selfie + product → compose
app/api/chat/tryon/upload/route.ts Multipart selfie upload + TTL
app/api/chat/tryon/route.ts        POST run try-on
widget/src/components/TryOnButton.tsx
widget/src/components/TryOnDialog.tsx
widget/src/lib/tryon.ts            client-side flow
widget/src/styles/widget.css       (edit)
```

---

*Phase 6 context: 2026-05-02*
