# Phase 1: Foundation — Schema, RAG ingest, brand voice — Context

**Gathered:** 2026-05-02
**Status:** Awaiting user confirmation on gray areas before planning

<domain>
## Phase Boundary

Stand up the data layer for the AI Sales Assistant and load it with knowledge so retrieval has something to retrieve. Specifically:

- New Supabase tables for chat sessions, messages, knowledge chunks, lead captures, discount rules, chat admins, and chat settings. All with RLS policies enabled from day one.
- The `pgvector` extension and a HNSW index on `knowledge_chunks.embedding`.
- New private Supabase Storage buckets for admin KB uploads and chat selfies (with retention metadata).
- A locked v1 brand-voice system prompt assembled from composable fragments. The non-negotiable rules section (from System 3 KB §3) lives in code; editable fragments (greeting, escalation, after-hours, etc.) live in `chat_settings`.
- An idempotent ingest script that reads the System 3 Knowledge Base markdown and the products CSV, chunks them, embeds with OpenAI `text-embedding-3-small`, and writes to `knowledge_chunks` with authority-tier metadata.
- A minimal Vitest setup so we can lock the brand-voice rules behind an automated check ("forbidden strings ARE present in the rules section").

**Out of this phase:** The chat API itself, retrieval logic, the widget, intent classification, the admin UI, eval harness. All those land in later phases.

**Requirements covered:** CHAT-03, RAG-01, RAG-02, RAG-04, OPS-03, OPS-06.

</domain>

<decisions>
## Implementation Decisions

### Database tables and ownership

- **D-01 — `chat_sessions`** keyed by client-generated `session_id` (UUID, not auth-bound; visitor may be anonymous). Columns: `id`, `shopify_customer_id` (nullable), `created_at`, `last_active_at`, `intent_summary`, `consent` (jsonb: cookie + selfie), `status` (`active` | `archived`).
- **D-02 — `chat_messages`** belongs to a session. Columns: `id`, `session_id`, `role` (`user` | `assistant` | `system`), `content` (text), `intent` (nullable, populated in Phase 2), `retrieved_chunk_ids` (uuid[] nullable), `tokens_in`, `tokens_out`, `latency_ms`, `created_at`. Append-only.
- **D-03 — `knowledge_chunks`** is the RAG corpus. Columns: `id`, `source_type` (`faq_kb` | `product_csv` | `product_md` | `voice_doc` | `storefront_api` | `admin_upload`), `source_id` (free-form per source — e.g. product handle, FAQ Q ID), `tier` (smallint, 1 = highest authority — see D-09), `title`, `content` (text), `metadata` (jsonb), `content_hash` (text — for incremental re-embed; see D-13), `embedding` (vector(1536)), `created_at`, `updated_at`. Unique on `(source_type, source_id)`.
- **D-04 — `lead_captures`** rows: `id`, `session_id`, `email`, `consent` (boolean), `intent_at_capture`, `discount_offered` (nullable), `transcript_link`, `created_at`. RLS: admin-readable only.
- **D-05 — `discount_rules`** rows (full schema in Phase 5; Phase 1 ships the table empty + columns): `id`, `code`, `value`, `value_type`, `combinability` (jsonb mirroring CSV), `customer_selection`, `times_used`, `applies_once_per_customer`, `usage_limit_per_code`, `intent_triggers` (text[]), `product_line_scope` (text[]), `start`, `end`, `status`, `created_at`, `updated_at`.
- **D-06 — `chat_admin_users`** rows: `id`, `auth_user_id` (FK to `auth.users`), `email`, `role` (`owner` | `team`), `created_at`. Faith and her team are seeded here in a follow-up commit during Phase 1.
- **D-07 — `chat_settings`** is a single-row config table (`id` is fixed UUID): `bot_enabled`, `daily_cap_usd`, `voice_fragments` (jsonb — greeting, escalation, after-hours, tone modifiers; see D-10), `default_top_k`, `embedding_model`, `system_prompt_version`, `updated_at`, `updated_by`.
- **D-08 — RLS policies** enabled on every new table. Visitor-scoped tables (`chat_sessions`, `chat_messages`, `lead_captures`) use a policy keyed on `session_id` passed via a request-time custom JWT claim or, for the API route, the service role hits them directly using session validation in code. Admin-only tables (`discount_rules`, `chat_admin_users`, `chat_settings`, `knowledge_chunks` for write) require membership in `chat_admin_users`. Read of `knowledge_chunks` is allowed for the API role only (not the anon role).

### Authority tiers (RAG-04)

- **D-09** — `tier` column ordering used at retrieval time:
  - 1 = `faq_kb` (Faith's curated System 3 Knowledge Base — ground truth)
  - 1 = `voice_doc` (treated as ground truth for tone, not facts)
  - 2 = `product_csv` (Shopify export — canonical catalog)
  - 2 = `admin_upload` (Faith uploads override unless they conflict with `faq_kb`)
  - 3 = `storefront_api` (live signal — populated in Phase 4)
  - 4 = generic Claude knowledge (no chunk; only used when retrieval returns nothing above similarity threshold)
  Tied tiers are broken by similarity score. Conflict is resolved by the higher tier.

### Voice prompt architecture (CHAT-03)

- **D-10 — Composable fragments** in `chat_settings.voice_fragments` (jsonb), seeded in Phase 1 with the values below. Phase 7 makes them editable in the admin UI; the rules section is *not* in this jsonb — it's compiled into code.
  - `persona_name`: `"Coco"`
  - `greeting`: `"Hey gorgeous! I'm Coco — what can I help you find today?"` (verbatim from KB §3)
  - `recommend_intro`: `"Tell me a little about your look — natural and everyday, or bold for a moment? And are you new to lash extensions or a regular?"` (compiled from KB §3 conversation guidelines)
  - `escalation`: `"Let me get this to Faith's team — they'll reach out at the email you give me. What's the best one to use?"` (US-only, uses support@cocolash.com)
  - `after_hours_suffix`: `"They're online Mon–Fri, 9 AM–5 PM EST and aim to reply within 24h."`
  - `lead_capture`: `"If you're not ready to commit, no pressure — drop your email and I'll send a little something to make your first set easier on the wallet."` (no urgency, in-voice)
  - `tryon_offer`: `"Want to see {product} on you? I can put it on a quick selfie if you'd like."`
  - `dont_know`: `"I want to get this right. Let me check with the team — what email should I send the answer to?"`
- **D-11 — Locked rules in code** (`lib/chat/voice-rules.ts`): A const string compiled from KB §3 "What we never say" verbatim. Includes:
  - Never use urgency or fake scarcity language ("limited time", "selling out", "hurry").
  - Never make medical or safety claims like "safe for sensitive eyes". Always reference the ingredient profile (latex-free, formaldehyde-free, hypoallergenic) and recommend a patch test for new users.
  - Never use pet names like "babe" or "hun".
  - Educational, not salesy. 70% value content / 30% promo.
  - Never spotlight the founder; brand spotlights customers.
  - Never invent product details. If unsure, escalate via the `dont_know` flow.
  - Never invent or guess discount codes. Only use codes Coco is told about by the system in the current turn.
- **D-12 — Final system prompt** is composed at request time as: `[BRAND_PERSONA] + [voice_fragments.* relevant to this turn] + [LOCKED_RULES] + [retrieved chunks] + [conversation history]`. The composition function lives in `lib/chat/voice.ts` and is the single entrypoint for building the prompt. Order is fixed; rules can never be moved or shadowed by editable fragments.

### Chunking strategy

- **D-13 — FAQ KB** is chunked **one Q+A pair = one chunk**. Title = the question; content = question + answer; metadata = `{category}` (Product Information / Application & Care / Orders & Shipping / Returns & Support); `source_id = faq:{slugified-question}`.
- **D-14 — Product entries from the KB markdown §2** are chunked **one product = one chunk** (whole entry: name, tagline, description, specs, price). Title = product name; metadata = `{volume_class, retail_single, retail_4pack, length_mm, curl, shape, lash_volume, wear_days}`; `source_id = product_md:{slug}`.
- **D-15 — Products CSV** is chunked **one product = one chunk** matching the KB entries by handle. Title = `Title` column; content = `Title + Body (HTML stripped) + Variant Price + key metafields (curl, length, shape, volume)`. CSV chunks land at `tier=2` and dedupe with KB-md chunks at `tier=1` by handle (the KB-md wins on conflict via tier ordering).
- **D-16 — Brand voice doc (KB §3)** is loaded as a small set of `voice_doc` chunks for context, but the *rules* are in code (D-11), not retrieval. We only chunk the conversational style guidance so the model has it on hand without having to enforce it from retrieval.
- **D-17 — Idempotency** uses `content_hash = sha256(content)` on each chunk. Re-running the ingest only re-embeds chunks whose hash changed; new chunks are inserted; missing chunks (deleted from source) are flagged in a report and require an explicit `--prune` flag to delete from `knowledge_chunks`.

### Embeddings and pgvector

- **D-18 — Embedding model: OpenAI `text-embedding-3-small`** (1536-dim, $0.02 / 1M tokens, fast). Stored as `vector(1536)`. Reasoning: cheap, English-only is acceptable (US-only product), and the existing `openai` SDK is already a dependency. The `chat_settings.embedding_model` column records the model used so a future re-embed across chunks can be detected.
- **D-19 — Index: HNSW** on `knowledge_chunks.embedding` with `vector_cosine_ops` (m=16, ef_construction=64 — pgvector defaults are fine for ≤ 100k chunks; the corpus will be < 1k). Use `<=>` cosine distance at query time.
- **D-20 — Embedding wrapper** at `lib/chat/embeddings.ts`. Single function `embed(text: string): Promise<number[]>`. Adds retry-on-rate-limit. Reuses the existing OpenAI client pattern (`lib/openrouter/client.ts` is OpenRouter; we add a separate OpenAI client for embeddings since OpenRouter doesn't expose that endpoint).

### Storage buckets

- **D-21 — `chat-kb-uploads`** private bucket. Only the service role and admins can write; only the service role reads. Used in Phase 7 for admin uploads. Created in Phase 1 with no objects.
- **D-22 — `chat-selfies`** private bucket. Used in Phase 6. Has a Postgres-side metadata table (`selfie_uploads`) with `expires_at`; a Supabase Edge Function (or pg_cron job) deletes objects whose `expires_at < now()`. The cron stub is created in Phase 1; the actual upload flow ships in Phase 6.

### Test framework

- **D-23 — Vitest** added as a dev dependency. Configuration: `vitest.config.ts` at repo root, test discovery in `**/*.test.ts` (excluding `node_modules` and `lib/seedance/ugc-image-prompt.test-examples.ts` which is sample data, not a test). Smoke test in Phase 1 asserts the locked rules from D-11 contain every required forbidden-pattern string. This is the first proper test in the repo (per `TESTING.md` we have none today).

### Migrations and naming

- **D-24** — A single migration file `supabase/migrations/20260502_chatbot_foundation.sql` adds the extension, all 7 tables, the HNSW index, RLS policies, and a stub for the `selfie_uploads` purge job. One commit.
- **D-25 — Code module layout** under `lib/chat/`:
  - `lib/chat/db.ts` — typed accessors for the new tables (Supabase typed wrappers)
  - `lib/chat/voice.ts` — system-prompt composer + voice-fragment loader
  - `lib/chat/voice-rules.ts` — locked rules string + smoke-tested
  - `lib/chat/embeddings.ts` — OpenAI embedding wrapper
  - `lib/chat/types.ts` — local types (e.g. `KnowledgeChunk`, `VoiceFragments`); cross-cutting types stay in `lib/types/index.ts`
- **D-26 — Ingest script** at `scripts/chat-ingest.ts`. Run via `npx tsx scripts/chat-ingest.ts [--prune] [--dry-run]`. Loads `.env.local` via `dotenv`. Writes a small report (chunks added/updated/deleted) to stdout.

### Claude's Discretion

The following are flexible during implementation; I'll choose sensible defaults and call out anything surprising:
- Exact RLS policy SQL syntax and whether to use Supabase RLS helper functions vs raw policies
- HNSW index parameters beyond defaults (only revisit if the eval in Phase 2 shows recall issues)
- Whether `voice_fragments` jsonb is stored as a single row in `chat_settings` or normalised into a `voice_fragments` table — single jsonb is fine for v1
- The exact CSV → chunk mapping for products that aren't lashes (e.g. `bag`, `fan`, `lash-wand` rows in the export); I'll skip those at the chunker (they're accessories without enough KB content) and log a "skipped" report. If Faith later wants the bot to discuss them, we add a one-paragraph entry to the KB upload area
- Migration formatting style (matching existing `supabase/migrations/*` patterns)

</decisions>

<specifics>
## Specific Ideas

- **Voice tone source of truth is the System 3 Knowledge Base markdown**, specifically §3. Verbatim quotes are preferred over paraphrase.
- **Persona = "Coco"** — confirmed by the user as a good fit; matches the brand. Open to renaming via voice fragment edit if Faith wants something else.
- **No urgency or scarcity, ever.** This is the strongest brand-voice rule and is enforced both by the prompt and by an automated regex check in the Phase 2 eval.
- **Greeting is locked verbatim** to *"Hey gorgeous! I'm Coco — what can I help you find today?"* and its variations are *the only* allowable greetings until Faith says otherwise. The smoke test asserts the greeting fragment contains "Hey gorgeous".
- **The bot never invents discount codes.** This rule is in `lib/chat/voice-rules.ts` and the system prompt in Phase 5 will only inject codes the discount engine has matched.
- **The brand spotlights customers, not the founder.** The bot doesn't reference Faith by name; it says "the team" or "Faith's team".

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning or implementing.**

### Brand voice and product knowledge
- `public/brand/CocoLash-System3-Knowledge-Base-for-Harry.md` §1 — Complete FAQ knowledge base (Product, Application & Care, Orders & Shipping, Returns & Support). Source of truth for FAQ chunks (D-13).
- `public/brand/CocoLash-System3-Knowledge-Base-for-Harry.md` §2 — Product catalog with full specs and pricing. Source of truth for product chunks (D-14).
- `public/brand/CocoLash-System3-Knowledge-Base-for-Harry.md` §3 — Brand voice + chatbot personality + conversation guidelines. Source of voice fragments (D-10) and locked rules (D-11).
- `public/brand/cocolash-brand_guidelines (1).pdf` — Visual identity guidelines (informs widget palette in Phase 3, not Phase 1; listed for context).
- `public/brand/products_export_1 (1).csv` — Shopify product catalog export. Source for CSV chunks (D-15).

### Project context
- `.planning/PROJECT.md` — Brand voice rules, technical constraints, key decisions table.
- `.planning/REQUIREMENTS.md` — Full v1 REQ-IDs; this phase covers CHAT-03, RAG-01, RAG-02, RAG-04, OPS-03, OPS-06.
- `.planning/ROADMAP.md` — Phase 1 success criteria (must be met to move to Phase 2).

### Codebase patterns to mirror
- `.planning/codebase/STRUCTURE.md` — "Where to add new code" matrix; confirms `lib/chat/` is the right home and migrations go in `supabase/migrations/`.
- `.planning/codebase/ARCHITECTURE.md` — Layered-monolith conventions; `lib/**` must not import `app/**` or `components/**`.
- `.planning/codebase/CONVENTIONS.md` — Code style, error class patterns (`ChatError` to follow `GeminiError` / `HeyGenError` / `SeedanceError`).
- `.planning/codebase/CONCERNS.md` — RLS-from-day-one, HMAC-verified webhooks, `lib/log.ts` deferred to Phase 9 (we keep `console.*` in Phase 1 ingest script only since it's a one-shot operational tool).
- `lib/openrouter/client.ts` — Pattern for service-layer client wrappers; embeddings module mirrors this style.
- `lib/seedance/types.ts` (or `lib/heygen/types.ts`) — Custom error class pattern; `ChatError(message, status, code)`.
- `lib/supabase/server.ts` — `createClient` (anon, RLS-respecting) and `createAdminClient` (service-role) patterns; new chat code uses `createClient` for visitor reads/writes and `createAdminClient` only for ingest and admin operations.
- `supabase/migrations/20260321_upgrade_one_system_two.sql` — Migration formatting and `CREATE TABLE IF NOT EXISTS` pattern to mirror.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/openrouter/client.ts`** — Pattern for OpenAI-style SDK wrappers; `lib/chat/embeddings.ts` follows this style.
- **`lib/supabase/server.ts:createAdminClient`** — Used by ingest script for service-role writes to `knowledge_chunks`.
- **`lib/supabase/server.ts:createClient`** — Used by future chat API for RLS-respecting visitor session reads/writes.
- **`lib/types/index.ts`** — Cross-cutting types live here; `KnowledgeChunk`, `VoiceFragments`, `IntentLabel` will be exported from there.

### Established Patterns
- **Service-layer pattern**: `lib/<service>/{client,types}.ts`. New `lib/chat/` follows the same pattern.
- **Custom error class**: `class ChatError extends Error { constructor(message, status, code) }` mirrors `GeminiError` / `HeyGenError` / `SeedanceError`.
- **Migration naming**: `supabase/migrations/YYYYMMDD_<short_description>.sql`. Phase 1 migration is `20260502_chatbot_foundation.sql`.
- **Bucket naming**: existing buckets are kebab-case in `BUCKETS` const in `lib/supabase/storage.ts`. New buckets `CHAT_KB_UPLOADS = "chat-kb-uploads"` and `CHAT_SELFIES = "chat-selfies"` added there.
- **`maxDuration = 300`** on long-running routes. Phase 1 has no routes; first chat route comes in Phase 2.

### Integration Points
- New `knowledge_chunks` table integrates with `lib/chat/embeddings.ts` (write path) and (later, Phase 2) `lib/chat/retrieve.ts` (read path).
- `chat_settings.voice_fragments` is read by `lib/chat/voice.ts` at request time and (Phase 7) written by the admin UI.
- Migrations apply via the standard Supabase CLI workflow already used by the project (`supabase/migrations/` is the source of truth).

</code_context>

<deferred>
## Deferred Ideas

Captured here so they're not lost; explicitly out of scope for Phase 1.

- **Storefront API live product chunks** — Phase 4 populates `tier=storefront_api` rows in `knowledge_chunks` from a nightly Shopify webhook.
- **Admin UI for KB upload / re-index button** — Phase 7. Phase 1 ships only the script and the storage bucket; admins re-index by running `npx tsx scripts/chat-ingest.ts` until then.
- **Faith's team admin seeding** — Will be done by a small follow-up script during Phase 7 once the named list is provided. Phase 1 just creates the table.
- **`lib/log.ts` structured logger** — Phase 9. Phase 1's ingest script uses `console.*` since it's a one-shot operational tool, not a hot-path library.
- **Selfie purge cron implementation** — Phase 6. Phase 1 only ships the metadata table + bucket, not the cron worker.
- **Eval harness (50-question gold set)** — Phase 2. Phase 1's only test is the smoke test on `voice-rules.ts`.
- **Re-embed on model change** — Logic exists in the script but actually swapping `text-embedding-3-small → gemini-embedding-001` (or whatever) is a future-Faith decision, not a Phase 1 task.
- **Product CSV chunks for non-lash accessories** (`bag`, `fan`, `lash-wand`, `4-pairs-eyelashes-package-brown`, `cocolash-bond-sealant-duo`) — Skipped at ingest with a logged report. Faith can opt them in via admin upload in Phase 7.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-05-02*
