# Phase 2: Core chat API + streaming + intent + eval — Context

**Gathered:** 2026-05-02
**Status:** Ready for planning (decisions locked from 01-CONTEXT.md + roadmap success criteria)

<domain>
## Phase Boundary

Make `POST /api/chat` work end-to-end: a question goes in, a streaming Claude
response grounded in retrieved chunks comes out, with per-turn intent
classification and a measurable retrieval-quality eval.

Out of this phase: widget UI (Phase 3), Shopify Storefront integration
(Phase 4), discount engine (Phase 5), virtual try-on (Phase 6), admin UI
(Phase 7), Stage 2 Shopify deploy (Phase 8), production hardening (Phase 9).

**Requirements covered:** CHAT-01, CHAT-02, CHAT-04, CHAT-05, CHAT-08,
RAG-03, RAG-05, RAG-06, OPS-02.

</domain>

<decisions>
## Implementation Decisions

### LLM stack
- **D-01 — Chat completions: Claude Sonnet 4.6 via OpenRouter.** Reuses the
  existing `lib/openrouter/client.ts` pattern. New `lib/openrouter/chat.ts`
  exports a streaming helper that returns `AsyncIterable<string>` of
  delta tokens. Model id: `anthropic/claude-sonnet-4.6`.
- **D-02 — Intent classification: Claude Haiku 4.5 via OpenRouter.** Cheaper,
  faster, sufficient for a 6-class label. Single non-streaming call per turn.
  Model id: `anthropic/claude-haiku-4.5`.
- **D-03 — Embeddings: OpenAI `text-embedding-3-small`** (locked in Phase 1).

### Retrieval
- **D-04 — Top-K = 6** by default (read from `chat_settings.default_top_k`).
- **D-05 — Similarity threshold:** chunks with cosine distance > 0.6 are
  considered "no match" — triggers the don't-know flow if all candidates
  exceed the threshold. (Cosine distance = 1 − cosine_similarity; lower is
  closer.)
- **D-06 — Tier weighting:** retrieve top-`(K * 2)` by raw distance, then
  re-rank by `effective_score = (1 − distance) - (tier - 1) * 0.05` and take
  top K. This biases ties toward higher-authority sources without rejecting
  high-confidence lower-tier hits.
- **D-07 — Source citations:** every assistant response carries a
  `_sources` SSE event (or response header `x-chat-sources`) listing the
  chunk IDs used. Phase 7 admin UI surfaces these per transcript.

### Streaming protocol
- **D-08 — Server-Sent Events (SSE)** over plain `text/event-stream`. We do
  not adopt the Vercel AI SDK on the server side — it adds ~30 KB and is not
  needed. The widget (Phase 3) consumes the same SSE format.
- **D-09 — Event types** in the SSE stream:
  - `event: token` — each delta chunk of assistant text
  - `event: sources` — chunk IDs used for grounding
  - `event: products` — Shopify product handles to render as cards (Phase 4)
  - `event: tryon` — try-on result URL (Phase 6)
  - `event: done` — terminal event with token-usage stats
  - `event: error` — terminal error event with code + message
- **D-10 — Request schema:** `{ sessionId?: string, message: string,
  customerId?: string }`. If `sessionId` is omitted, a new session is created.
  Response carries `x-chat-session-id` and `x-chat-request-id` headers.

### Intent classification
- **D-11 — Labels:** `product`, `tryon`, `order`, `support`, `lead_capture`,
  `other`. Single-call classification with a short rubric in the system
  prompt. Output: a single line containing one of the labels, parsed via
  regex; defaults to `other` on parse failure (graceful, never blocks the
  reply).
- **D-12 — Cost:** Haiku 4.5 input < 1k tokens, output ~10 tokens. ~$0.0001
  per classification. Tracked in `chat_cost_events` with `pipeline =
  intent_classify`.

### Don't-know handling
- **D-13** When retrieval returns zero chunks with similarity ≥ threshold,
  the system prompt is augmented with a directive to use the `dont_know`
  voice fragment and ask for an email. The user message is also tagged with
  `intent = lead_capture` regardless of what the classifier returns. This
  is the deterministic guardrail behind RAG-05.

### Hours
- **D-14** `lib/chat/hours.ts:isBusinessHours()` returns true for Mon–Fri
  09:00–17:00 EST. Uses `Intl.DateTimeFormat` to derive the EST hour from
  `new Date()`. Drives the `after_hours_suffix` toggle in the system prompt.

### Eval harness
- **D-15 — Gold set:** 50 questions in `lib/chat/eval/gold-questions.ts`,
  drawn from the System 3 KB §1 with paraphrases. Each row:
  ```ts
  {
    id: string;
    question: string;
    expected_topic: string;        // e.g. 'application'
    expected_chunk_ids: string[];  // chunks that MUST appear in retrieval
    must_contain: string[];        // tokens the answer should include
    must_not_contain: string[];    // brand-voice violations to grep for
    expected_intent?: IntentLabel;
  }
  ```
- **D-16 — Metrics emitted:**
  - `retrieval@K` — fraction of gold rows where ALL expected chunk IDs
    appear in the top-K retrieved set.
  - `must_contain_pass_rate` — fraction of answers containing every
    `must_contain` token (case-insensitive substring).
  - `must_not_contain_pass_rate` — fraction of answers with NONE of the
    `must_not_contain` tokens.
  - `intent_accuracy` — exact-match against `expected_intent` (when set).
  - `latency_ms_p50/p95` — observed across the run.
- **D-17 — Output:** writes to `eval/results/eval-YYYY-MM-DD-HHMMSS.json`
  and prints a one-line summary. Exit non-zero if any aggregate metric falls
  below the ROADMAP thresholds (retrieval@6 ≥ 0.9, must_contain ≥ 0.85,
  must_not_contain == 1.0).

### Logging (OPS-02 scaffolding)
- **D-18 — `lib/log.ts` is deferred to Phase 9.** For Phase 2, the chat
  route emits a single structured `console.log` JSON line per request with
  `request_id, session_id, intent, retrieved_chunk_ids, tokens_in,
  tokens_out, latency_ms`. This is replaced wholesale in Phase 9.

### Error handling
- **D-19** All errors from service modules surface as `ChatError`. The
  route catches and returns SSE `event: error` with `{ status, code,
  message }`. Internal errors (`internal_error`) return a generic message
  externally; the request_id is logged so we can trace.

### Validation
- **D-20 — Zod for request validation.** Add `zod` as a dep (already
  recommended by the project coding-style memory). Schema:
  ```ts
  const ChatRequestSchema = z.object({
    sessionId: z.string().uuid().optional(),
    message: z.string().min(1).max(2000),
    customerId: z.string().min(1).max(100).optional(),
  });
  ```

### Module layout
- **D-21**
  - `lib/chat/retrieve.ts` — vector search + ranking + threshold gate
  - `lib/chat/intent.ts` — Haiku classifier
  - `lib/chat/hours.ts` — business hours
  - `lib/openrouter/chat.ts` — streaming Claude wrapper
  - `lib/chat/eval/gold-questions.ts` — gold set
  - `app/api/chat/route.ts` — POST handler + SSE stream
  - `scripts/chat-eval.ts` — runner

</decisions>

<canonical_refs>
## Canonical References

### Phase 1 outputs (consume from)
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-09 (authority tiers),
  D-10 (voice fragments), D-11 (locked rules), D-18 (embedding model)
- `.planning/phases/01-foundation/01-VERIFICATION.md` — what's deployed
  vs what's pending

### Brand context
- `public/brand/CocoLash-System3-Knowledge-Base-for-Harry.md` — gold set source
- `lib/chat/voice.ts:composeSystemPrompt` — single entrypoint for prompts
- `lib/chat/voice-rules.ts:VOICE_RULES` — non-negotiable rules (already
  enforced via composer; eval also greps responses for forbidden phrases)

### Existing service patterns to mirror
- `lib/openrouter/client.ts` — OpenAI SDK pointed at OpenRouter
- `lib/openrouter/captions.ts` — non-streaming Claude call w/ system prompt;
  the new `lib/openrouter/chat.ts` mirrors this style + adds streaming
- `lib/seedance/client.ts` — error handling + retry pattern
- `app/api/seedance/webhook/route.ts` — long-handler pattern, request-id logging

### Codebase conventions
- `.planning/codebase/CONVENTIONS.md` — error handling, response format
- `.planning/codebase/CONCERNS.md` — "no console.log in lib code"; chat code
  uses one structured stdout line per request, replaced in Phase 9

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable
- `lib/openrouter/client.ts` — instantiates the OpenAI SDK pointed at
  OpenRouter. New chat helper imports the same client factory.
- `lib/chat/embeddings.ts:embed()` — query embedding for retrieval.
- `lib/chat/voice.ts:composeSystemPrompt()` — already locked.
- `lib/chat/db.ts` — sessions, messages, costs, chunks all wired.

### Patterns
- `maxDuration = 60` on `/api/chat` (faster than 300; we want quick failure
  if the model stalls). Long generations (try-on at 300s) live on different
  routes.
- Service-role client (`createAdminClient`) for chat reads/writes since the
  visitor is anon and RLS denies anon by design.

### Integration points
- `lib/chat/retrieve.ts` is the single entry point for retrieval and is
  consumed by `/api/chat` in Phase 2 and the admin "test query" feature in
  Phase 7.

</code_context>

<deferred>
## Deferred Ideas

- Streaming product cards inline (`event: products`) — Phase 4 emits these.
- Try-on offer when intent=tryon — Phase 6.
- Discount injection in the system prompt — Phase 5.
- Customer-aware greeting via App Proxy — Phase 8.
- Rate-limiting middleware on `/api/chat` — Phase 9.
- Replacing the inline `console.log` audit line with structured `lib/log.ts` — Phase 9.

</deferred>

---

*Phase: 02-chat-api*
*Context gathered: 2026-05-02*
