# Phase 1: Foundation — Plan

**Phase:** 01-foundation
**Goal:** Stand up data layer + RAG ingest + locked brand-voice prompt.
**Requirements:** CHAT-03, RAG-01, RAG-02, RAG-04, OPS-03, OPS-06.
**Depends on:** None (first phase).
**Blocks:** Phase 2 (chat API needs schema + chunks).

## Tasks (atomic-commit boundaries)

| # | Task | Files | Verifies |
|---|---|---|---|
| 1 | Extend `.env.example` with new env vars | `.env.example` | New keys documented |
| 2 | Add Vitest as dev dep + base config + npm script | `package.json`, `vitest.config.ts` | `npm run test` runs |
| 3 | Author the foundation migration | `supabase/migrations/20260502_chatbot_foundation.sql` | SQL is valid; `supabase db lint` passes locally if available |
| 4 | Update `lib/supabase/storage.ts` with new buckets | `lib/supabase/storage.ts` | TypeScript builds |
| 5 | Add `lib/chat/error.ts` (ChatError class) | new file | TS builds |
| 6 | Add `lib/chat/types.ts` (local types: KnowledgeChunk, VoiceFragments, ChatSession, etc.) | new file | TS builds |
| 7 | Add `lib/chat/voice-rules.ts` (locked rules string) | new file | TS builds |
| 8 | Add `lib/chat/voice.ts` (system-prompt composer + fragment loader) | new file | TS builds |
| 9 | Add `lib/chat/voice-rules.test.ts` (smoke test for forbidden rules) | new file | `npm run test` passes |
| 10 | Add `lib/chat/embeddings.ts` (OpenAI embedding wrapper) | new file | TS builds |
| 11 | Add `lib/chat/db.ts` (typed accessors) | new file | TS builds |
| 12 | Add `scripts/chat-ingest.ts` (idempotent ingest from KB markdown + products CSV) | new file | TS builds; runnable with `--dry-run` |
| 13 | `npm run build` + `npm run lint` clean across all changes | — | Build green; lint clean |

## Atomic-commit grouping

To keep each commit reviewable:

- **Commit A** — Env + Vitest scaffold (tasks 1, 2)
- **Commit B** — Migration (task 3)
- **Commit C** — Storage buckets + error class + types (tasks 4, 5, 6)
- **Commit D** — Voice rules + composer + smoke test (tasks 7, 8, 9)
- **Commit E** — Embeddings + DB wrappers (tasks 10, 11)
- **Commit F** — Ingest script (task 12)
- **Commit G** — Build/lint fixes if any (task 13, only if needed)

## What I CAN'T do (handoff to user)

- Apply the migration to the live Supabase project — requires `supabase db push` from your machine.
- Run `npx tsx scripts/chat-ingest.ts` against the live DB — requires `OPENAI_API_KEY` in `.env.local` and the migration to be applied.
- Verify Phase 1 success criteria 1, 3, 5, 6 (all involve running against live Supabase).

I will run: `npm install`, `npm run test`, `npm run build`, `npm run lint`, `npm run lint --fix` if needed, and `npx tsx scripts/chat-ingest.ts --dry-run` (no DB writes, validates parsing).

## Phase 1 Definition of Done

- All 13 tasks complete.
- Smoke test (`npm run test`) green: rules constant contains every forbidden-pattern string.
- Build green; lint clean.
- All atomic commits pushed to `main`.
- A follow-up note in STATE.md flags the two manual deploy steps (apply migration, run ingest).

---

*Plan written: 2026-05-02. Executes autonomously per user authorization to work continuously.*
