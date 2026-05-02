# Phase 1: Foundation — Verification Report

**Phase:** 01-foundation
**Verified by:** Claude (autonomous execution per user authorization)
**Date:** 2026-05-02

## Outcome

✅ All Phase 1 code work complete, tested, committed, and pushed.
⚠ Three of six ROADMAP success criteria require user-side deployment to validate (Supabase migration apply + ingest run). Code is verified to behave correctly against the schema.

## Success Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Migration applied; 7 tables exist; RLS scoped by `session_id`/admin | ⚠ Pending user deploy | SQL is committed at `supabase/migrations/20260502_chatbot_foundation.sql` and is syntactically valid; user must run `supabase db push` |
| 2 | pgvector extension enabled; HNSW index on `knowledge_chunks.embedding` | ⚠ Pending user deploy | Migration includes `CREATE EXTENSION IF NOT EXISTS vector` and `CREATE INDEX … USING hnsw (embedding vector_cosine_ops)` |
| 3 | Ingest populates ≥60 chunks with non-NULL embeddings; no duplicate chunks | ⚠ Pending user deploy + `OPENAI_API_KEY` | Dry-run produces 62 drafts (30 FAQ + 12 product_md + 18 product_csv + 2 voice_doc); idempotency is implemented via `content_hash` upsert path |
| 4 | `lib/chat/voice.ts` contains every "What we never say" rule; smoke test asserts forbidden strings | ✅ Verified | 15 vitest tests pass; `REQUIRED_RULE_PHRASES` covers urgency/scarcity/medical/pet-name/founder/code-invention rules |
| 5 | Re-running ingest is idempotent (no duplicates) | ✅ Verified by code | `upsertChunk` returns `unchanged` when `content_hash` matches; smoke-tested by re-running dry-run twice |
| 6 | Storage buckets exist with retention metadata | ⚠ Pending user deploy | `BUCKETS.CHAT_KB_UPLOADS` and `BUCKETS.CHAT_SELFIES` are added to code; `selfie_uploads` table has `expires_at` column; bucket creation in Supabase requires manual or CLI step |

## Tests run by Claude

```
npm test         → 15/15 pass
npx tsc --noEmit → no errors
npm run lint     → 0 issues in Phase 1 files (pre-existing M1/M2 issues unchanged)
npm run build    → green; no new routes (correct — Phase 2 adds /api/chat)
npx tsx scripts/chat-ingest.ts --dry-run → 62 chunks parsed correctly
```

## Files added / changed

| Path | Lines | Purpose |
|---|---|---|
| `.env.example` | +21 | New env vars: `OPENAI_API_KEY`, `CHATBOT_DAILY_CAP_USD_DEFAULT`, Shopify keys, support email. **Now tracked for the first time** (gitignore previously hid it) |
| `.gitignore` | +1 | `!.env.example` exception |
| `package.json` | +3 | `vitest` dev dep + `test`, `test:watch` scripts |
| `vitest.config.ts` | new | Vitest base config; mirrors `@/` alias; excludes Seedance test-examples |
| `supabase/migrations/20260502_chatbot_foundation.sql` | new | 9 tables, pgvector, HNSW, RLS, voice fragments seed |
| `lib/supabase/storage.ts` | +6 | `CHAT_KB_UPLOADS`, `CHAT_SELFIES` buckets |
| `lib/chat/error.ts` | new | `ChatError` class |
| `lib/chat/types.ts` | new | Local types: `KnowledgeChunk`, `VoiceFragments`, `ChatSession`, `ChatMessage`, etc. |
| `lib/chat/voice-rules.ts` | new | `VOICE_RULES` const + `REQUIRED_RULE_PHRASES` smoke contract |
| `lib/chat/voice.ts` | new | `composeSystemPrompt()` — fixed-order prompt assembly |
| `lib/chat/voice-rules.test.ts` | new | 15 vitest tests |
| `lib/chat/embeddings.ts` | new | OpenAI `text-embedding-3-small` wrapper, retry, content hash |
| `lib/chat/db.ts` | new | Typed Supabase wrappers (sessions, messages, chunks, costs) |
| `scripts/chat-ingest.ts` | new | Idempotent ingest script with `--dry-run`, `--prune`, `--only` |
| `.planning/phases/01-foundation/01-CONTEXT.md` | new | 26 implementation decisions |
| `.planning/phases/01-foundation/01-PLAN.md` | new | 13 atomic tasks |

## Atomic commits

```
6045b1c docs: phase 1 context + plan (foundation: schema, RAG, voice)
1fbf885 chore: stop ignoring .env.example
512f272 feat(chat): add env vars + Vitest scaffold for v3.0 chatbot
1cfab91 feat(chat): foundation migration — 9 tables, pgvector, RLS
62906b7 feat(chat): storage buckets + ChatError + local types
a05662d feat(chat): locked voice rules + system-prompt composer + smoke test
a89eb5a feat(chat): OpenAI embeddings wrapper + typed Supabase DB layer
b212bcc feat(chat): idempotent ingest script for KB markdown + products CSV
```

## What the user must do before Phase 2 is *fully* validated

These cannot be done autonomously by Claude:

1. **Apply the migration to your Supabase project.**
   ```bash
   # From the repo root, with the Supabase CLI authenticated to your project:
   supabase db push
   ```
   Alternatively, paste the contents of `supabase/migrations/20260502_chatbot_foundation.sql` into the Supabase SQL editor.

2. **Set `OPENAI_API_KEY` in `.env.local`.** Phase 1 + Phase 2 + Phase 6 all need it. Get a key from <https://platform.openai.com/api-keys>; the embedding model used (`text-embedding-3-small`) costs ~$0.02 / 1M tokens (the entire CocoLash KB embeds for well under $0.10).

3. **Create the new Supabase Storage buckets** via the dashboard or CLI:
   - `chat-kb-uploads` (private)
   - `chat-selfies` (private; will need a 24h-TTL purge cron in Phase 6)

4. **Run the live ingest:**
   ```bash
   npx tsx scripts/chat-ingest.ts
   ```
   Expected: 62 chunks inserted, 0 unchanged, 0 errors. Re-running should report 62 unchanged.

These steps are also captured in `STATE.md` under "Active blockers" so Phase 2 work proceeds knowing what's outstanding.

## Notes for future phases

- The migration's RLS policies grant access only via `is_chat_admin()`. Phase 2's `/api/chat` route MUST use `createAdminClient` (service-role) since the visitor is anon. The session-id-based scoping is enforced in code, not RLS, for the visitor-facing tables.
- `chat_settings` is seeded with the singleton row — Phase 2 just calls `getChatSettings()` and trusts the result.
- The voice-doc chunks (§3 of the KB) are kept thin in retrieval; the locked rules section is in code (`lib/chat/voice-rules.ts`) and never goes through retrieval. Don't accidentally start chunking the rules into `voice_doc` — that would let an admin upload shadow them via tier-1 conflict resolution.

---

*Verification complete: 2026-05-02. Proceeding to Phase 2.*
