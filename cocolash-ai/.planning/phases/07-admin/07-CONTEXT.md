# Phase 7: Admin dashboard — Context

**Phase boundary:** Faith and her named team manage the bot from `/chatbot/admin` — kill-switch, discount rules, voice fragments, RAG content, transcripts, leads, analytics, cost cap.

**Reqs:** ADMIN-01..09, LEAD-05.

## Decisions

- **D-01 — Auth:** reuse existing Supabase Auth (`lib/supabase/server.ts:createClient` + `getCurrentUserId`). Allow if `chat_admin_users` row exists OR the user's email matches `ADMIN_EMAIL` (the existing `app/api/admin/users/route.ts` constant — covers Faith on day one before her team is seeded).
- **D-02 — Auth helper:** `lib/chat/admin-auth.ts:requireChatAdmin(supabase)` returns the auth user or throws `ChatError(403, 'forbidden')`. Each admin route + page uses it.
- **D-03 — UI:** plain Next.js App Router pages under `app/(protected)/chatbot/admin/`. Reuse existing shadcn primitives in `components/ui/` (button, input, card, dialog, table). Light Tailwind styling matching the existing admin pages.
- **D-04 — API routes:** one folder per concern under `app/api/chatbot/admin/`. Each guards with `requireChatAdmin`.
- **D-05 — Analytics:** plain SQL aggregates from `chat_messages` + `chat_sessions` + `lead_captures` + `chat_cost_events`. Numeric panels, no chart library — keeps the bundle clean and the admin fast.
- **D-06 — Leads export:** server-rendered CSV download with date-range filter.
- **D-07 — Content (RAG):** uploads land in `chat-kb-uploads` bucket; admin can trigger a re-index by hitting an "ingest now" button that streams the script's stdout. For Phase 7 we ship the UI + endpoint; the actual re-embed happens in-process via the same logic as `scripts/chat-ingest.ts`. Skipping a separate worker for v1.
- **D-08 — Settings:** edit `chat_settings` (kill switch, daily cap, voice fragments, system_prompt_version bump).
- **D-09 — Voice editor:** monospace textareas, one per fragment. Save updates `chat_settings.voice_fragments` jsonb. NOT the locked rules section.
- **D-10 — Discounts:** CRUD over `discount_rules`. Tables + a single edit form. Run/import button just calls `scripts/discount-import.ts` (in-process via the parsing helpers, not a child process).

## Files

```
lib/chat/admin-auth.ts                       requireChatAdmin helper
app/(protected)/chatbot/admin/layout.tsx     nav + auth gate
app/(protected)/chatbot/admin/page.tsx       overview
app/(protected)/chatbot/admin/{discounts,voice,content,transcripts,analytics,leads,settings}/page.tsx
app/api/chatbot/admin/{discounts,voice,content,transcripts,analytics,leads,settings}/route.ts
```

---

*Phase 7: 2026-05-02*
