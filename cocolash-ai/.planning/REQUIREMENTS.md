# Requirements: CocoLash AI Suite — Milestone v3.0

**Defined:** 2026-05-02
**Core Value:** Every customer-facing CocoLash asset — image, video, or chatbot reply — sounds like Faith and converts like Faith.

> **Scope note.** This file lists requirements for **milestone v3.0 only** — the AI Sales Assistant + Virtual Try-On. Validated requirements from v1.0 (image generation) and v2.0 (video generation) are recorded in `PROJECT.md`. Changes to those validated systems are out of scope unless flagged here.

---

## v1 Requirements (v3.0 release)

Requirements for the initial milestone release. Each maps to exactly one roadmap phase. Atomic, testable, user-centric.

### CHAT — Conversational Engine

- [ ] **CHAT-01**: Visitor can open the chat widget on cocolash.com and see a warm, on-brand greeting (*"Hey gorgeous! Welcome to CocoLash. What can I help you find today?"*)
- [ ] **CHAT-02**: Visitor can type a question and receive a token-streamed response from Claude Sonnet 4.6 grounded in CocoLash's knowledge base
- [ ] **CHAT-03**: Bot enforces brand voice rules: no urgency tactics, no fake scarcity, no "limited time only", no medical claims, no pet names, 70% educational / 30% promo
- [ ] **CHAT-04**: Bot responds within 3 seconds (first token) under normal load
- [ ] **CHAT-05**: Conversation persists for the visitor across page navigations within the same session (sessionId in localStorage)
- [ ] **CHAT-06**: Bot escalates to `support@cocolash.com` when it can't help, when the customer is frustrated, or when topic is outside its competence (returns/refunds beyond policy, custom orders, complaints)
- [ ] **CHAT-07**: Bot offers a discount code in exchange for an email when a visitor is leaving without purchasing (lead capture)
- [ ] **CHAT-08**: Bot identifies user intent on each message (product / try-on / order / support / lead-capture / other) and stores the classification

### RAG — Knowledge Base

- [ ] **RAG-01**: System ingests the System 3 Knowledge Base (FAQ + product catalog + brand voice doc) into Supabase pgvector with structured chunks
- [ ] **RAG-02**: System ingests the products CSV (Shopify export) into the knowledge base, deduplicating against existing chunks
- [ ] **RAG-03**: Bot retrieves top-K relevant chunks for each query and includes them in the Claude system prompt
- [ ] **RAG-04**: Authority tier is enforced: FAQ KB > product CSV > Storefront API > generic Claude knowledge; on conflict, the higher tier wins
- [ ] **RAG-05**: Bot says *"Let me check with the team and follow up"* (with optional email capture) when no source covers the question
- [ ] **RAG-06**: Retrieval quality is measured against a 50-question evaluation set built with Faith (or with curated proxies if Faith unavailable) before launch

### SHOP — Shopify Storefront Integration

- [ ] **SHOP-01**: Bot returns real-time product data (title, price, inventory, image, PDP URL) from the Shopify Storefront API for matched recommendations
- [ ] **SHOP-02**: Bot renders product cards inline in the chat with a clear CTA
- [ ] **SHOP-03**: Customer can add a product to their Shopify cart from inside the chat without leaving cocolash.com
- [ ] **SHOP-04**: Bot honors the customer's currently-applied discount code and stacks new codes only when business rules allow (per the discounts CSV `Combines with` columns)
- [ ] **SHOP-05**: When a logged-in Shopify customer is recognized via App Proxy, bot greets them by first name and references their last order
- [ ] **SHOP-06**: When a product is out of stock, bot says so and recommends the closest in-stock alternative based on style attributes (curl, length, shape, volume)
- [ ] **SHOP-07**: Bot caches product data with a TTL and degrades gracefully under Storefront API rate-limits (serves cached results, surfaces "live data temporarily unavailable" only when cache is empty)
- [ ] **SHOP-08**: Nightly Shopify webhook syncs product/inventory updates into the knowledge base

### TRYON — Virtual Try-On

- [ ] **TRYON-01**: Bot proactively offers virtual try-on when a specific product is being discussed (*"Want to see Dahlia on you?"*)
- [ ] **TRYON-02**: Visitor can upload a selfie from their gallery (mobile + desktop) or capture from camera (mobile + desktop with webcam)
- [ ] **TRYON-03**: Visitor must explicitly consent before the selfie is sent for AI processing
- [ ] **TRYON-04**: System runs `composePersonWithProduct` (existing `lib/gemini/composition.ts`) to generate a try-on image
- [ ] **TRYON-05**: Bot shows a friendly "give me a sec" message and a progress indicator during the 10–30s generation
- [ ] **TRYON-06**: Generated try-on images render inline in the chat history and persist for the session
- [ ] **TRYON-07**: Source selfies are deleted after 24 hours; generated try-on images persist for the session and are deleted with the transcript
- [ ] **TRYON-08**: After a successful try-on, bot offers an add-to-cart CTA for the previewed style

### LEAD — Lead Capture & Escalation

- [ ] **LEAD-01**: Bot can collect email address with explicit consent for follow-up
- [ ] **LEAD-02**: Captured leads are stored in Supabase with: email, conversation context, intent, optional discount code offered, timestamp
- [ ] **LEAD-03**: Captured leads trigger a notification email to `support@cocolash.com` with a transcript link
- [ ] **LEAD-04**: Bot says *"Faith's team will reach out soon"* when escalating outside Mon–Fri 9 AM–5 PM EST hours
- [ ] **LEAD-05**: Faith and her team can export leads as CSV from the admin dashboard

### ADMIN — Admin Dashboard

- [ ] **ADMIN-01**: Faith and named team members can log in to `/chatbot/admin` using the existing Supabase Auth (no new login system)
- [ ] **ADMIN-02**: Admin can toggle the chatbot on/off globally (kill switch)
- [ ] **ADMIN-03**: Admin can upload, replace, and delete RAG content (FAQ docs, brand voice fragments, product info) and trigger a re-index
- [ ] **ADMIN-04**: Admin can edit brand-voice prompt fragments (greeting, tone modifiers, escalation messaging) without a code deploy
- [ ] **ADMIN-05**: Admin can manage discount codes: create, edit, expire; configure when each code is offered (intent triggers, product-line scope, campaign window)
- [ ] **ADMIN-06**: Admin can browse, search, and read full chat transcripts; flag transcripts for review
- [ ] **ADMIN-07**: Admin can view analytics: daily session count, average conversation length, intent distribution, full event funnel (impression → open → first message → product card click → add-to-cart → lead-captured)
- [ ] **ADMIN-08**: Admin can export captured leads as CSV
- [ ] **ADMIN-09**: Admin can configure the daily cost cap (default $50) and see current month-to-date spend per pipeline (Claude, embeddings, Gemini try-on)

### DEPLOY — Shopify Deployment

- [ ] **DEPLOY-01**: Stage 1: Widget loads on cocolash.com via a `theme.liquid` snippet (single `<script>` tag) for fast iteration during development
- [ ] **DEPLOY-02**: Stage 2: Shopify Custom App is registered for Faith's store (private, not App Store)
- [ ] **DEPLOY-03**: Stage 2: Theme App Extension delivers the widget loader so Faith installs / enables it from Online Store → Customize → App embeds
- [ ] **DEPLOY-04**: Stage 2: Shopify App Proxy at `/apps/cocolash-chat` is configured for HMAC-signed customer-aware requests (cart mutation, customer recognition)
- [ ] **DEPLOY-05**: Widget bundle is < 50 KB gzipped, mounts in Shadow DOM, and does not break Faith's existing theme styles or scripts
- [ ] **DEPLOY-06**: Widget is mobile-first; renders correctly on iOS Safari, Chrome Android, and the major desktop browsers (Chrome, Safari, Firefox, Edge)

### OPS — Reliability, Cost, Privacy

- [ ] **OPS-01**: Daily cost guardrail kills the bot (returns a graceful "back online tomorrow" message) when the configured cap is exceeded
- [ ] **OPS-02**: Per-route observability: every chat request emits a structured log with a request ID, intent classification, retrieval-source IDs, token usage, and latency
- [ ] **OPS-03**: New chat tables (`chat_sessions`, `chat_messages`, `lead_captures`, `knowledge_chunks`, `discount_rules`) have RLS enabled with policies that scope rows by session/admin user from day one
- [ ] **OPS-04**: Cookie consent banner is shown on the first widget load; visitor can dismiss/accept and the choice is remembered
- [ ] **OPS-05**: Selfies are stored in a private Supabase Storage bucket and purged 24 hours after upload
- [ ] **OPS-06**: Chat transcripts are retained 180 days, then archived to cold storage (or deleted, per Faith's choice in admin)
- [ ] **OPS-07**: All new Shopify-incoming routes (webhook, App Proxy) verify HMAC via `crypto.timingSafeEqual` and never accept secrets via URL query string

---

## v2 Requirements (deferred)

Acknowledged for future releases. Not in the v3.0 roadmap.

### CHAT (v2)

- **CHAT-V2-01**: Voice input (speech-to-text) for accessibility
- **CHAT-V2-02**: Multi-language support (Spanish, French) once international shipping launches
- **CHAT-V2-03**: Persistent anonymous-customer memory across sessions

### TRYON (v2)

- **TRYON-V2-01**: Side-by-side comparison of multiple lash styles in one composite
- **TRYON-V2-02**: Saved try-ons in the customer account ("My Looks")

### LEAD (v2)

- **LEAD-V2-01**: Live human chat handoff (Intercom-style)
- **LEAD-V2-02**: SMS notification channel for high-intent leads
- **LEAD-V2-03**: Klaviyo / Mailchimp list sync

### ADMIN (v2)

- **ADMIN-V2-01**: Multi-store / multi-tenant admin (if CocoLash spawns sub-brands)
- **ADMIN-V2-02**: A/B testing of greeting and prompt variants from the admin

### OPS (v2)

- **OPS-V2-01**: GDPR / CCPA-grade consent flow + data subject request pipeline (when international shipping launches)
- **OPS-V2-02**: SOC2-aligned audit logging across the Suite

---

## Out of Scope

Explicitly excluded from milestone v3.0. Documented to prevent scope creep.

| Feature | Reason |
|---|---|
| Live human-agent chat handoff | Email handoff is sufficient for v3.0; live chat is staffing-cost intensive and a v4 decision |
| Multi-language UI / responses | CocoLash currently ships US-only; English-only keeps prompt evaluation and KB curation tractable |
| Persistent customer memory across anonymous sessions | Privacy-sensitive and complex; v3.0 personalizes for *logged-in* Shopify customers within a session only |
| Native mobile app | Widget is browser-only; no native app is on the CocoLash roadmap |
| Voice input / audio chat | Text-only widget; voice is a v4+ exploration |
| GDPR / CCPA-grade consent + DSR pipeline | Faith ships US-only; minimal cookie banner is sufficient. Re-evaluate when international shipping launches |
| Bot autonomously making medical or safety claims | Bot must not say "safe for sensitive eyes"; instead it states the ingredient profile (latex-free, formaldehyde-free, hypoallergenic) and recommends a patch test, per the brand-voice rules |
| Replacing or modifying the existing M1 image-generation or M2 video-generation systems | M1/M2 are validated and in production. M3 is additive. Refactors to M1/M2 are out of scope unless they unblock an M3 requirement |
| Bot making proactive outbound DMs / emails to customers | Inbound-only. Outbound campaigns are Faith's marketing team's domain |
| Bot taking refund / return / cancel actions | Bot escalates these to `support@cocolash.com`; doesn't have permission to mutate orders |
| Faith's team beyond named admins logging in | Admin access is gated to a named list; widening access is admin work outside this milestone |

---

## Traceability

Maps each v1 requirement to its roadmap phase. See `.planning/ROADMAP.md` for full phase details.

| Requirement | Phase | Status |
|---|---|---|
| CHAT-01 | 2, 3 | Pending |
| CHAT-02 | 2 | Pending |
| CHAT-03 | 1 | Pending |
| CHAT-04 | 2, 9 (verification) | Pending |
| CHAT-05 | 2 | Pending |
| CHAT-06 | 5 | Pending |
| CHAT-07 | 5 | Pending |
| CHAT-08 | 2 | Pending |
| RAG-01 | 1 | Pending |
| RAG-02 | 1 | Pending |
| RAG-03 | 2 | Pending |
| RAG-04 | 1 | Pending |
| RAG-05 | 2 | Pending |
| RAG-06 | 2 | Pending |
| SHOP-01 | 4 | Pending |
| SHOP-02 | 4 | Pending |
| SHOP-03 | 4 | Pending |
| SHOP-04 | 5 | Pending |
| SHOP-05 | 8 | Pending |
| SHOP-06 | 4 | Pending |
| SHOP-07 | 4 | Pending |
| SHOP-08 | 4 | Pending |
| TRYON-01 | 6 | Pending |
| TRYON-02 | 6 | Pending |
| TRYON-03 | 6 | Pending |
| TRYON-04 | 6 | Pending |
| TRYON-05 | 6 | Pending |
| TRYON-06 | 6 | Pending |
| TRYON-07 | 6 | Pending |
| TRYON-08 | 6 | Pending |
| LEAD-01 | 5 | Pending |
| LEAD-02 | 5 | Pending |
| LEAD-03 | 5 | Pending |
| LEAD-04 | 5 | Pending |
| LEAD-05 | 7 | Pending |
| ADMIN-01 | 7 | Pending |
| ADMIN-02 | 7 | Pending |
| ADMIN-03 | 7 | Pending |
| ADMIN-04 | 7 | Pending |
| ADMIN-05 | 7 | Pending |
| ADMIN-06 | 7 | Pending |
| ADMIN-07 | 7 | Pending |
| ADMIN-08 | 7 | Pending |
| ADMIN-09 | 7 | Pending |
| DEPLOY-01 | 3 | Pending |
| DEPLOY-02 | 8 | Pending |
| DEPLOY-03 | 8 | Pending |
| DEPLOY-04 | 8 | Pending |
| DEPLOY-05 | 3 | Pending |
| DEPLOY-06 | 3 | Pending |
| OPS-01 | 9 | Pending |
| OPS-02 | 2, 9 (verification) | Pending |
| OPS-03 | 1 | Pending |
| OPS-04 | 3 | Pending |
| OPS-05 | 6 | Pending |
| OPS-06 | 1 | Pending |
| OPS-07 | 4, 8 | Pending |

**Coverage:**
- v1 requirements: 57 total
- Mapped to phases: 57
- Unmapped: 0 ✓

---

*Requirements defined: 2026-05-02 — initial scoping for milestone v3.0 (AI Sales Assistant + Virtual Try-On).*
*Last updated: 2026-05-02 — initial draft.*
