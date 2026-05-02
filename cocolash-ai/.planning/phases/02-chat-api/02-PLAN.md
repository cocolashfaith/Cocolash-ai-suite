# Phase 2: Core chat API — Plan

**Phase:** 02-chat-api
**Goal:** Make `/api/chat` answer KB-grounded questions in Faith's voice with streaming, intent, and a measurable eval.
**Depends on:** Phase 1 (schema + chunks + voice).
**Blocks:** Phase 3 (widget consumes SSE).

## Tasks (atomic-commit boundaries)

| # | Task | Files | Commit |
|---|---|---|---|
| 1 | Add `zod` dep | `package.json`, `package-lock.json` | A |
| 2 | Streaming Claude wrapper | `lib/openrouter/chat.ts` | A |
| 3 | Retrieval + tier-aware ranking | `lib/chat/retrieve.ts` | A |
| 4 | Intent classifier (Haiku) | `lib/chat/intent.ts` | B |
| 5 | Business-hours helper | `lib/chat/hours.ts` | B |
| 6 | `POST /api/chat` route w/ SSE | `app/api/chat/route.ts` | C |
| 7 | Gold set (50 Qs) + eval runner | `lib/chat/eval/gold-questions.ts`, `scripts/chat-eval.ts` | D |
| 8 | Unit tests for retrieve + intent + hours | `lib/chat/*.test.ts` | E |
| 9 | Verify: tests + lint + build | — | F (only if needed) |

## What I CAN'T verify autonomously

- The streaming endpoint against the live model — needs `OPENROUTER_API_KEY`
  in `.env.local` (already present per .env.example) plus Phase 1 deploy
  for `chat_messages` writes.
- The 50-question eval — needs Phase 1 deploy + ingest + OpenAI key.
- The retrieval@K metric — same.

These will run successfully once Phase 1's deploy steps are done.

## Phase 2 Definition of Done

- 8 tasks complete; build green; lint clean on Phase 2 files.
- Unit tests for hour/intent/retrieve logic pass without hitting the network
  (mocked dependencies).
- `npx tsx scripts/chat-eval.ts --dry-run` parses the gold set and reports
  the question count + would-be cost.

---

*Plan: 2026-05-02 — autonomous execution.*
