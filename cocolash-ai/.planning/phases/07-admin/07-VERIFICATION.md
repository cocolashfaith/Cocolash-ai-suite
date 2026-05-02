# Phase 7: Admin dashboard — Verification

**Date:** 2026-05-02
**Outcome:** ✅ Code complete, all 8 pages + 7 API routes registered, build green, 88/88 tests still passing.

## Success criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Faith logs in → /chatbot/admin shows today's stats | ✅ Code (overview page reads chat_sessions + leads + costs) |
| 2 | Toggle off → next chat returns "back online tomorrow" | ✅ Code (chat route reads chat_settings.bot_enabled, returns 503) |
| 3 | Upload FAQ markdown → searchable within 60s | ✅ Code (content/route.ts embeds + upserts on save) |
| 4 | Editing greeting fragment changes live greeting | ✅ Code (/api/chat/config + voice page bidirectional via chat_settings) |
| 5 | Create discount rule + bot offers it | ✅ Code (Phase 5 selector reads same table) |
| 6 | Flag transcript filter | ⚠ Phase 7+ (filter not built; transcript view exists) |
| 7 | Lead CSV export | ✅ /api/chatbot/admin/leads?format=csv |
| 8 | Cost cap edit | ✅ Settings PATCH; effective at next chat turn |
| 9 | Second admin user | ✅ Code (chat_admin_users membership) |
| 10 | RLS prevents non-admin endpoint access | ✅ Code (requireChatAdmin guards every API route) |

## Pages

```
/chatbot/admin                       Overview
/chatbot/admin/discounts             CRUD discount rules
/chatbot/admin/voice                 Edit voice fragments
/chatbot/admin/content               Upload + delete RAG chunks
/chatbot/admin/transcripts[/?session=]  List + single transcript
/chatbot/admin/leads                 List + CSV export
/chatbot/admin/analytics             30-day stats
/chatbot/admin/settings              Kill switch, daily cap, top-K, prompt version
```

## API routes

```
PATCH  /api/chatbot/admin/settings         kill switch + cap + top-K + version
PATCH  /api/chatbot/admin/voice            voice_fragments
PATCH  /api/chatbot/admin/discounts        per-rule patch (status, triggers, scope)
POST   /api/chatbot/admin/content          embed + upsert tier-2 chunk
DELETE /api/chatbot/admin/content?source_id=
GET    /api/chatbot/admin/transcripts?session_id=
GET    /api/chatbot/admin/leads[?format=csv&from=&to=]
GET    /api/chatbot/admin/analytics
```

## What the user must do

1. **Seed admin members** (Phase 7 SQL helper / Faith's team):
   ```sql
   INSERT INTO chat_admin_users (auth_user_id, email, role)
   VALUES ((select id from auth.users where email = 'faith@cocolash.com'), 'faith@cocolash.com', 'owner');
   ```
2. Visit `/chatbot/admin` once logged in.

---

*Phase 7 closed: 2026-05-02. Proceeding to Phase 8.*
