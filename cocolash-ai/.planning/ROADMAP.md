# Roadmap: CocoLash AI Suite — Milestone v3.0

**Milestone:** v3.0 — AI Sales Assistant + Virtual Try-On
**Defined:** 2026-05-02
**Phases:** 9
**Requirements mapped:** 57 / 57 ✓
**Numbering:** Starts at Phase 1 (M1 and M2 predate GSD phase tracking; this is the first GSD roadmap for the project)

---

## Phase Overview

| # | Phase | Goal | Requirements | Success criteria |
|---|---|---|---|---|
| 1 | **Foundation: Schema, RAG ingest, brand voice** | Stand up the data layer and the locked brand-voice prompt; ingest the System 3 Knowledge Base | CHAT-03, RAG-01, RAG-02, RAG-04, OPS-03, OPS-06 | 6 |
| 2 | **Core chat API + streaming + intent + eval** | Make `/api/chat` answer KB-grounded questions in Faith's voice with streaming and per-turn intent classification | CHAT-01, CHAT-02, CHAT-04, CHAT-05, CHAT-08, RAG-03, RAG-05, RAG-06, OPS-02 | 9 |
| 3 | **Widget v1 + Stage 1 deployment** | Ship a Preact widget that loads on cocolash.com via `theme.liquid` snippet, renders streaming chat, fits the brand | CHAT-01 (UI verification), DEPLOY-01, DEPLOY-05, DEPLOY-06, OPS-04 | 5 |
| 4 | **Shopify Storefront integration + product cards** | Bot returns real-time product data, renders product cards, deep-links / add-to-carts (Stage 1, no App Proxy yet), and degrades gracefully under rate-limits | SHOP-01, SHOP-02, SHOP-03, SHOP-06, SHOP-07, SHOP-08 | 6 |
| 5 | **Discount engine + lead capture + escalation** | Bot offers discount codes per admin-configured rules, captures leads with email handoff, escalates after-hours messaging | CHAT-06, CHAT-07, SHOP-04, LEAD-01, LEAD-02, LEAD-03, LEAD-04 | 7 |
| 6 | **Virtual Try-On** | Bot proactively offers try-on, customer uploads/captures selfie with consent, reuse `composePersonWithProduct`, inline render with TTL purge | TRYON-01–08, OPS-05 | 9 |
| 7 | **Admin dashboard** | Faith and her team manage discount rules, RAG content, voice prompts, transcripts, analytics, leads, cost cap from `/chatbot/admin` | ADMIN-01–09, LEAD-05 | 10 |
| 8 | **Stage 2 deployment: Shopify Custom App + TAE + App Proxy** | Convert from `theme.liquid` snippet to one-click install via Shopify Custom App + Theme App Extension; route customer-aware actions through HMAC-signed App Proxy | SHOP-05, DEPLOY-02, DEPLOY-03, DEPLOY-04, OPS-07 | 5 |
| 9 | **Production hardening: cost guardrails + logging + perf** | Cost kill-switch, structured logging, rate-limiting, eval regression, performance budgets, handoff documentation | OPS-01, plus verification of CHAT-04, OPS-02 | 5 |

---

## Phase Details

### Phase 1 — Foundation: Schema, RAG ingest, brand voice

**Goal:** Establish the data layer (Supabase tables + pgvector index + storage buckets) and the locked brand-voice system prompt. Ingest the System 3 Knowledge Base and the products CSV so retrieval has something to retrieve.

**Scope:**
- New Supabase migration adding: `chat_sessions`, `chat_messages`, `knowledge_chunks` (with `pgvector` extension), `lead_captures`, `discount_rules`, `chat_admin_users`, `chat_settings` (single-row config table for kill-switch + cost cap + voice fragments). All tables get `ENABLE ROW LEVEL SECURITY` and policies from day one.
- New Supabase Storage buckets: `chat-kb-uploads` (private, admin-only), `chat-selfies` (private, 24h TTL).
- `lib/chat/db.ts` typed CRUD wrappers per table.
- `lib/chat/voice.ts` — exports the locked v1 brand-voice system prompt (compiled from `public/brand/CocoLash-System3-Knowledge-Base-for-Harry.md` §3 and the rules in PROJECT.md).
- Ingest script: `scripts/chat-ingest.ts` — reads `public/brand/CocoLash-System3-Knowledge-Base-for-Harry.md` and `public/brand/products_export_1 (1).csv`, chunks intelligently (FAQ Q+A pair as one chunk; product = one chunk per product), generates embeddings, writes to `knowledge_chunks` with `(source_type, source_id, tier)` metadata.
- Embedding choice: OpenAI `text-embedding-3-small` (1536-dim, cheap, fast). Stored as `vector(1536)`.
- Authority tier enforced at retrieval time via `tier` column ordering: `faq_kb` (1) > `product_csv` (2) > `storefront_api` (3, populated in Phase 4) > `generic` (4, from Claude only).

**Success criteria:**
1. Migration applied; all 7 tables exist with RLS policies that scope by `session_id` (visitor) or `admin_user_id` (Faith's team).
2. `pgvector` extension is enabled and there is a HNSW index on `knowledge_chunks.embedding`.
3. Running `tsx scripts/chat-ingest.ts` populates ≥ 60 chunks (FAQ Q+A pairs + product entries) with embeddings; no row has a NULL embedding.
4. `lib/chat/voice.ts` exports a system prompt that contains every "What we never say" rule from the KB doc; a unit smoke test asserts the forbidden strings are present in the rules section.
5. Re-running the ingest script is idempotent (no duplicate chunks).
6. Storage buckets exist with the documented retention policies (`chat-selfies` has a 24h purge job stub).

**Risk mitigations:** RLS-from-day-one prevents the `generated_videos`-style scoping miss flagged in `CONCERNS.md`. Chunking strategy is documented in code comments so Phase 2's eval results can attribute regressions to either chunking or retrieval.

---

### Phase 2 — Core chat API + streaming + intent classifier + eval harness

**Goal:** Make `/api/chat` work end-to-end: a question goes in, a streaming Claude response grounded in retrieved chunks comes out, with per-turn intent classification and a measurable retrieval-quality eval.

**Scope:**
- `app/api/chat/route.ts` — POST handler with `maxDuration = 60`, accepts `{ sessionId, message, customerId? }`, returns SSE stream.
- `lib/chat/retrieve.ts` — embeds query, vector-searches `knowledge_chunks`, returns top-K (default 6) ranked by similarity × tier weight.
- `lib/chat/compose.ts` — assembles system prompt: voice fragments + retrieved chunks + (in Phase 4) live product context + (in Phase 5) discount-rule fragment.
- `lib/openrouter/chat.ts` — streaming wrapper around the existing OpenRouter client, returns an `AsyncIterable<string>`.
- `lib/chat/intent.ts` — single Claude Haiku call per turn returning one of: `product`, `tryon`, `order`, `support`, `lead_capture`, `other`. Persisted on `chat_messages.intent`.
- "Don't know" handling (RAG-05): when retrieval returns nothing above a similarity threshold, Claude is instructed to say *"Let me check with the team and follow up — what's the best email to reach you at?"* Lead-capture intent is set automatically.
- `scripts/chat-eval.ts` — 50-question gold set built from the System 3 Knowledge Base. Each gold row: `{ question, expected_topic, expected_chunk_ids, must_contain[], must_not_contain[] }`. Eval reports retrieval@K hit-rate, answer presence-of-required-facts, and brand-voice rule violations (regex on output).
- Source citation: response includes a `_sources` SSE event with the chunk IDs used.

**Success criteria:**
1. `curl -N POST /api/chat` with the question *"Will Violet work with my glasses?"* streams a token-by-token answer that includes the words "natural", "shorter", or "lighter curl" (verifiable from the KB) within 3 seconds to first token.
2. The 50-question eval reports retrieval@6 ≥ 0.9 and answer-fact-coverage ≥ 0.85.
3. No eval response contains any of: "limited time", "selling out", "babe", "hun", "hurry".
4. Per-turn intent classification matches Faith's manual labels on a 20-question check set ≥ 0.8 accuracy.
5. When the question is out-of-scope (e.g. *"Can you book me a salon appointment?"*), the bot says it'll have the team follow up and triggers lead-capture intent.
6. Every response carries a request ID surfaced in the response headers and in Supabase logs (OPS-02 verification path).

**Risk mitigations:** The 50-question eval set is the contract Faith approves. We don't move to Phase 3 (UI) until the brain works.

---

### Phase 3 — Widget v1 (Preact + Shadow DOM, Stage 1 deployment)

**Goal:** Ship a beautiful, on-brand widget that loads on cocolash.com via a `theme.liquid` snippet, renders the chat experience built in Phase 2, fits the CocoLash brand identity (use `public/brand/cocolash-brand_guidelines.pdf` palette), and is mobile-first.

**Scope:**
- `widget/` directory — Vite + Preact + TypeScript build pipeline that outputs `widget.js` (single bundle, < 50KB gzipped) deployed to `/widget.js` via Next.js public asset.
- Shadow DOM mount; bundled CSS does not leak.
- Mobile-first layout: bubble FAB → expanded panel → fullscreen on mobile.
- Streaming text rendering (typewriter feel from SSE).
- Cookie consent banner ("By chatting you agree to our [Terms]") on first load.
- `app/api/widget-config/route.ts` — returns the live brand-voice config + on/off state so widget shows correct status.
- `theme.liquid` snippet template at `public/widget/embed.html` (shareable doc Faith pastes).
- Brand-aligned visual: Coco's color palette from the brand guidelines PDF, Geist fonts (already loaded by the app), warm beige/coffee accents.
- Greeting persona: *"Hey gorgeous! I'm Coco — what can I help you find today?"*

**Success criteria:**
1. Local dev: pasting the embed snippet into a vanilla HTML page renders a fully styled widget that doesn't pick up any of the host page's CSS.
2. `widget.js` bundle size ≤ 50KB gzipped (CI check).
3. Widget renders correctly on iOS Safari, Chrome Android, Chrome/Safari/Firefox/Edge desktop (manual screenshot pass).
4. Streaming chat from Phase 2 plays smoothly (no jank, no flicker, scroll follows the latest token).
5. Cookie banner state persists in localStorage; dismissal doesn't re-prompt.
6. Faith's actual cocolash.com page (or a staging clone) can host the widget without breaking her existing theme.

**Risk mitigations:** Shadow DOM + scoped CSS = the only safe way to inject UI into a Shopify theme. Bundle size budget is enforced in CI.

---

### Phase 4 — Shopify Storefront integration + product cards

**Goal:** Bot answers product questions with real-time data — current price, current stock, current image — and renders attractive product cards in chat with a working "Add to cart" CTA. Stage 1 only (App Proxy comes in Phase 8).

**Scope:**
- `lib/shopify/storefront.ts` — Storefront API client; uses `STOREFRONT_API_TOKEN` env. Methods: `searchProducts`, `getProductByHandle`, `getProductsByIds`, `addToCartLink`.
- `lib/shopify/cache.ts` — in-memory + Supabase-backed cache with 15-min TTL. Falls back to cache on rate-limit (429).
- `lib/chat/product-context.ts` — given a chat turn's intent + retrieved chunks, decides whether to fetch live product data and which products to fetch.
- Stage 1 add-to-cart: deep-link to `cocolash.com/cart/{variantId}:1` (Shopify's universal add-to-cart URL); upgraded to App Proxy mutation in Phase 8.
- Product card SSE event (`_products`): widget renders cards with image, title, price, "View" + "Add" buttons.
- Out-of-stock alternative: when a recommended product is OOS, bot calls `searchProducts` with similar attributes (curl, length, shape, volume) from `lib/types/index.ts` style metadata.
- Nightly Shopify webhook handler `app/api/shopify/products-webhook/route.ts` — verifies HMAC, upserts changed products into `knowledge_chunks` (deduplicating).
- Storefront data is written into `knowledge_chunks` with `tier=storefront_api` (tier 3) — refreshes the catalog without losing the FAQ tier-1 priority.

**Success criteria:**
1. Asking *"What's in stock right now in volume lashes under $40?"* returns a list backed by live Storefront API data, not the CSV alone.
2. Clicking "Add to cart" on a product card opens cocolash.com with that product in the cart (Stage 1 deep link).
3. Asking about an OOS product gets the bot to recommend a real, in-stock alternative with reasoning grounded in product attributes.
4. Forcibly returning 429 from the Storefront API client surfaces "live data temporarily unavailable" only when the cache is empty; otherwise serves cached data silently.
5. Triggering a fake Shopify product-update webhook updates the corresponding `knowledge_chunks` row within 5s and HMAC-fails for a bad signature.
6. The catalog is queryable in the eval harness from Phase 2 with retrieval@6 ≥ 0.9 maintained.

**Risk mitigations:** Cache + tier separation means Storefront downtime degrades gracefully. HMAC verification on the webhook (`crypto.timingSafeEqual`, no URL-token fallback — addresses the issue flagged in `.planning/codebase/CONCERNS.md`).

---

### Phase 5 — Discount engine + lead capture + escalation

**Goal:** Bot offers a discount code at the right moment per admin-configurable rules, captures leads with explicit consent, and escalates politely outside business hours.

**Scope:**
- `discount_rules` data model (campaign window, intent triggers, product-line scope, combinability honoring the discounts CSV `Combines with` columns).
- `scripts/discount-import.ts` — one-shot import of `public/brand/discounts_export.csv` into `discount_rules` as defaults.
- `lib/chat/discount.ts` — given current conversation state (intent, products discussed, customer state), returns the applicable discount code or null.
- Discount injection into the system prompt only when a rule matches; bot is told *the* code, never invents codes.
- Lead capture flow: bot asks for email with explicit consent; visitor types email → validated → stored in `lead_captures` with conversation context.
- `lib/chat/notify.ts` — sends email to `support@cocolash.com` with a transcript link via Supabase email or a transactional provider (decision in phase plan).
- After-hours detection: `lib/chat/hours.ts` returns business-hours boolean (Mon–Fri 9–5 EST per the KB doc); bot says *"Faith's team will reach out soon"* outside hours.
- Stage 1: no admin UI yet — rules are seeded from CSV + a hand-edited Supabase row. Admin CRUD comes in Phase 7.

**Success criteria:**
1. A user expressing purchase intent on a Volume lash product receives the configured volume-lash code (per imported CSV defaults) inside the conversation.
2. The bot never offers a code that has expired or is outside its `Start`/`End` window.
3. Combinability is honored: when an order discount is already active, the bot doesn't offer a non-combinable additional order discount.
4. A test lead-capture flow from "I'm interested but not ready" → email submission → row in `lead_captures` + email arrives at the test inbox within 60s.
5. Querying outside business hours triggers the after-hours line in the response.
6. Adding a non-combinable code to an existing cart is detected and the bot apologizes politely.

**Risk mitigations:** Discount rules live in a typed table from day one so the Phase 7 admin UI is just CRUD over an existing schema. CSV import is idempotent so re-running doesn't duplicate.

---

### Phase 6 — Virtual Try-On

**Goal:** Reuse the existing Gemini composition pipeline so a visitor can see how a chosen lash style looks on them, inline in the chat, with a clean consent gate and short retention window.

**Scope:**
- Trigger logic in `lib/chat/tryon-trigger.ts`: bot proactively offers try-on when the conversation focuses on a specific product for ≥ 2 turns ("Want to see Dahlia on you?").
- Selfie upload UI in widget: file picker (gallery on both mobile + desktop) and camera capture (`getUserMedia` with explicit permission prompt).
- Consent screen: bot displays *"Your photo goes to our AI to generate a preview. We'll keep it for 24 hours then delete. OK?"* with explicit "Yes" / "No" — no auto-accept.
- Selfie storage: private Supabase bucket `chat-selfies` with row-level expiry timestamp; nightly cron deletes expired rows.
- `app/api/chat/tryon/route.ts` — accepts `{ sessionId, selfieUrl, productId }`, calls `composePersonWithProduct` from `lib/gemini/composition.ts`, writes the result back into `chat_messages` as a special message type.
- During generation: bot sends a "give me a sec, I'm putting Dahlia on you" message + a streaming progress placeholder; final image arrives as a `_image` SSE event.
- After successful try-on: bot offers add-to-cart CTA for the previewed style.
- Generated try-ons retained for the chat session, deleted with transcript at 180-day cutoff.

**Success criteria:**
1. A complete try-on flow on mobile (camera capture → consent → generation → result) and desktop (gallery upload → consent → generation → result).
2. Median time-to-result < 35s; bot's "give me a sec" placeholder appears within 1s of consent.
3. A try-on selfie uploaded yesterday is gone by the next morning's cron run; the row is also gone from `chat-selfies` metadata.
4. After a try-on, asking *"Can I see Poppy too?"* triggers a second try-on cleanly without re-asking for consent in the same session.
5. Declining consent gracefully resumes the conversation without bombarding the visitor.
6. Add-to-cart CTA after a successful try-on works (deep-link Stage 1, upgraded by Phase 8).

**Risk mitigations:** Reuses the proven `composePersonWithProduct` (already shipped in M2). Hard 24h TTL plus consent gate keeps the privacy story simple.

---

### Phase 7 — Admin dashboard

**Goal:** Give Faith and her team a single screen to control the bot — toggle on/off, manage discount rules, upload/replace KB content, edit voice fragments, browse transcripts, view analytics, export leads, set the cost cap.

**Scope:**
- New admin routes under `app/(protected)/chatbot/admin/` reusing the existing Supabase-Auth + admin-email pattern (already in `app/api/admin/users/route.ts`). Faith + named team members are added to `chat_admin_users`.
- Pages: `/chatbot/admin` (overview), `/discounts`, `/voice`, `/content`, `/transcripts`, `/analytics`, `/leads`, `/settings`.
- Admin API routes: `app/api/chatbot/admin/{discounts,voice,content,transcripts,analytics,leads,settings}/route.ts` — each guarded by `isChatAdmin()`.
- RAG content uploader: drag-and-drop file (markdown, txt, csv) → server-side chunk + embed → upsert into `knowledge_chunks` with `tier=admin_upload`. Re-index button triggers full re-embed.
- Voice fragment editor: WYSIWYG-ish for the editable parts (greeting, escalation, after-hours, etc.) — rules section is read-only and lives in code.
- Discount rules CRUD over the schema from Phase 5.
- Transcript viewer: paginated list, search by keyword + intent + flagged, single-transcript view with the customer's IP/UA hashed for privacy.
- Analytics dashboard: charts for daily sessions, conversation length distribution, intent breakdown, funnel (chart lib: lightweight, prefer existing Tailwind + a small SVG sparkline lib over Recharts to stay light).
- Lead export: CSV download of `lead_captures` rows in the selected date range.
- Cost cap UI: numeric input for daily cap; current month-to-date spend per pipeline displayed.

**Success criteria:**
1. Faith logs in with her existing Supabase account and lands on `/chatbot/admin` showing today's session count, latest 5 leads, MTD cost.
2. Toggling the bot off causes the next widget request to receive a graceful "back online tomorrow" response and the widget shows a "we're updating, check back soon" state.
3. Uploading a new FAQ markdown via the admin page produces searchable chunks that the bot can retrieve within 60s of "Re-index".
4. Editing the greeting prompt fragment changes the live greeting on the next widget reload.
5. Creating a new discount rule and assigning it to a campaign window + product line causes the bot to offer that code in matching conversations.
6. A flagged transcript appears in a "Flagged for review" filter; transcript content is searchable by free text.
7. Lead CSV export downloads with the right rows for the selected range.
8. Cost cap edited from $50 → $30 fires the kill-switch when MTD daily spend reaches $30.
9. A second admin user (added to `chat_admin_users`) can log in and see the same data.
10. RLS prevents a non-admin from hitting any `/api/chatbot/admin/*` endpoint.

**Risk mitigations:** Reusing existing auth means no new login surface. Strict RLS + `isChatAdmin()` guard on every admin route. Charts are intentionally lightweight to keep the bundle reasonable.

---

### Phase 8 — Stage 2 deployment: Shopify Custom App + Theme App Extension + App Proxy

**Goal:** Convert the deployment from Stage 1 (`theme.liquid` snippet) to Stage 2 — a clean Shopify-native install via a Custom App, a Theme App Extension that Faith enables in one click, and an App Proxy that handles HMAC-signed customer-aware requests (cart mutations, customer recognition).

**Scope:**
- Shopify Partner account + Custom App registration on Faith's store. App scopes: `read_products`, `read_customers` (logged-in customer recognition only — no PII export), `write_orders`/`write_draft_orders` if needed for richer cart actions; final scope list locked during phase planning.
- Theme App Extension (block) that injects the widget loader. Loader script is small and inline-allowed; main bundle is fetched from Vercel.
- App Proxy: configure `/apps/cocolash-chat` route in the Shopify Custom App; backend handler at `app/api/shopify/proxy/[...path]/route.ts` verifies HMAC on every request.
- Migrate add-to-cart from Phase 4's deep link to a Storefront API mutation through App Proxy (server-side `cart.linesAdd`) so codes can be applied in the same call.
- Customer recognition: when a logged-in Shopify customer hits the widget via the proxy, request includes `logged_in_customer_id`; the bot calls Storefront API to fetch first name and last order, and personalizes the greeting accordingly.
- Migrate the nightly product webhook to be an authenticated webhook from the Custom App (instead of a raw Shopify webhook).
- HMAC verified using `crypto.timingSafeEqual`; never accepts secrets in URL query strings (corrects the pattern flagged in `CONCERNS.md`).
- Cross-browser QA pass.

**Success criteria:**
1. A fresh Shopify dev-store install of the Custom App is one-click: open Faith's admin → Online Store → Customize → App embeds → toggle Coco → save. Widget appears on the storefront immediately.
2. Removing the `theme.liquid` snippet does not affect the production widget (the TAE is the source).
3. Logged-in customer arriving at cocolash.com is greeted by name (e.g. *"Hey, Naomi! Welcome back. Last time you ordered Violet — want to grab a fresh set or try something new?"*).
4. Add-to-cart from the bot now applies the offered discount code in the *same* request via the App Proxy / Storefront mutation; the cart on cocolash.com reflects both immediately.
5. App Proxy requests with bad HMAC are rejected with 401 and never reach business logic.
6. Cross-browser screenshot pass shows the widget rendering correctly on the matrix (iOS Safari, Chrome Android, Chrome/Safari/Firefox/Edge desktop).
7. Final demo to Faith on her real store, captured as a Loom (or comparable) for handoff.

**Risk mitigations:** Stage 1 is the running production until Stage 2 is verified end-to-end. Switchover is a single config change in Shopify admin. App Proxy isolates the customer-aware code paths so Stage 1 can keep running in parallel during the cutover.

---

### Phase 9 — Production hardening: cost guardrails, structured logging, perf

**Goal:** Make sure the bot can run unattended without surprise cost spikes, and leave Faith's team with the operational tools they need to maintain it.

**Scope:**
- `lib/chat/preflight.ts` — daily kill-switch. Reads `chat_settings.daily_cap_usd`, sums today's `cost_events` for chat + tryon, returns `(canProceed, reason)`. Called at the top of `app/api/chat/route.ts`.
- `lib/log.ts` — structured logger (JSON, level-controlled by `LOG_LEVEL` env). Replaces `console.*` in chat code paths first; backfilling M1/M2 is a separate refactor (not in scope).
- Rate-limit middleware on `/api/chat` — token bucket per session ID + per IP, default 30 messages / 5 minutes / session.
- Performance audit: bundle analyzer report (CI), time-to-first-token p95 < 1500ms (synthetic), end-to-end response p95 < 6s, RAG retrieval p95 < 200ms.
- Eval re-run + regression report against Phase 2's gold set (retrieval@6 ≥ 0.9 maintained, no brand-voice violations).
- Production smoke test script that walks the canonical "browse → product Q → try-on → add-to-cart → leave with email" flow.
- `docs/CHATBOT-OPS.md` — handoff doc for Faith's team: how to add an admin, how to upload new content, how to interpret analytics, what each kill-switch path looks like.

**Success criteria:**
1. Setting `daily_cap_usd = 0.01` and triggering a chat request gets a graceful kill-switch response on the second message; widget shows the maintenance state.
2. Structured log lines from `/api/chat` carry: `request_id`, `session_id`, `intent`, `retrieved_chunk_ids`, `tokens_in`, `tokens_out`, `latency_ms`. No bare `console.log` in `app/api/chat/**` or `lib/chat/**`.
3. Burst-testing 50 messages in 30 seconds from the same session yields `429` after the bucket is exhausted.
4. Bundle analyzer confirms widget bundle ≤ 50KB gzipped; CI fails the build above the threshold.
5. p95 latencies meet the documented targets on a 100-call synthetic load run.
6. The 50-question eval set re-runs from CI on every PR touching `lib/chat/**` and reports a delta vs. baseline.
7. `docs/CHATBOT-OPS.md` includes screenshots of every admin screen and a runbook for the most common ops tasks (rotate Storefront token, re-index after a content change, investigate a flagged transcript, recover from a hit kill-switch).

**Risk mitigations:** This phase is where we close the loop on the concerns from `.planning/codebase/CONCERNS.md` that touch new code. Faith's team gets a documented system, not a black box.

---

## Detailed Traceability

| REQ-ID | Phase |
|---|---|
| CHAT-01 | 2, 3 |
| CHAT-02 | 2 |
| CHAT-03 | 1 |
| CHAT-04 | 2, 9 (verification) |
| CHAT-05 | 2 |
| CHAT-06 | 5 |
| CHAT-07 | 5 |
| CHAT-08 | 2 |
| RAG-01 | 1 |
| RAG-02 | 1 |
| RAG-03 | 2 |
| RAG-04 | 1 |
| RAG-05 | 2 |
| RAG-06 | 2 |
| SHOP-01 | 4 |
| SHOP-02 | 4 |
| SHOP-03 | 4 |
| SHOP-04 | 5 |
| SHOP-05 | 8 |
| SHOP-06 | 4 |
| SHOP-07 | 4 |
| SHOP-08 | 4 |
| TRYON-01 | 6 |
| TRYON-02 | 6 |
| TRYON-03 | 6 |
| TRYON-04 | 6 |
| TRYON-05 | 6 |
| TRYON-06 | 6 |
| TRYON-07 | 6 |
| TRYON-08 | 6 |
| LEAD-01 | 5 |
| LEAD-02 | 5 |
| LEAD-03 | 5 |
| LEAD-04 | 5 |
| LEAD-05 | 7 |
| ADMIN-01 | 7 |
| ADMIN-02 | 7 |
| ADMIN-03 | 7 |
| ADMIN-04 | 7 |
| ADMIN-05 | 7 |
| ADMIN-06 | 7 |
| ADMIN-07 | 7 |
| ADMIN-08 | 7 |
| ADMIN-09 | 7 |
| DEPLOY-01 | 3 |
| DEPLOY-02 | 8 |
| DEPLOY-03 | 8 |
| DEPLOY-04 | 8 |
| DEPLOY-05 | 3 |
| DEPLOY-06 | 3 |
| OPS-01 | 9 |
| OPS-02 | 2, 9 (verification) |
| OPS-03 | 1 |
| OPS-04 | 3 |
| OPS-05 | 6 |
| OPS-06 | 1 |
| OPS-07 | 4, 8 |

**Coverage:** 57 / 57 ✓ (every v1 requirement is mapped to at least one phase; some appear in two phases when verification work is split between an implementation phase and a hardening phase)

---

## Build Order Rationale

- **Phase 1 first** — the brand voice + KB + RLS schema are the foundation; everything else compounds on these.
- **Phase 2 before any UI** — the bot's brain has to work and be measurable before we wrap a widget around it. This is why eval comes in Phase 2, not at the end.
- **Phase 3 before Phase 4** — Faith can see and feel the bot the moment the widget renders, even with a basic "no Shopify yet" answer. Maximizes feedback time.
- **Phase 4 then 5** — products before discounts, because discount rules need real product handles to scope to.
- **Phase 6 sits between commerce and admin** — try-on is the marquee feature; we want it tested in production with real visitors before we hand the admin to Faith.
- **Phase 7 (admin) before Phase 8 (Stage 2 deployment)** — Faith needs to be operating the bot through the dashboard *during* Stage 2 cutover so she's the first user to verify nothing broke.
- **Phase 8 after admin** — Stage 2 is a deployment migration; doing it last means we know Stage 1 is solid before we touch Shopify-side install.
- **Phase 9 last** — production hardening + handoff docs are the last phase because they finalize ops behavior the rest of the system depends on.

---

## Out of Scope Reminder

See `REQUIREMENTS.md` Out of Scope table. Notable items deferred to v4 or later: live human chat, multi-language, persistent anonymous memory, native app, voice input, GDPR/CCPA pipeline. None will be added back during v3.0 without an explicit milestone-scope amendment.

---

*Roadmap defined: 2026-05-02 — initial draft for milestone v3.0. Spawned inline (not via gsd-roadmapper) due to subagent permission failures observed during the 2026-05-01 codebase-mapping run; will revert to the agent for future roadmaps once that's resolved.*
