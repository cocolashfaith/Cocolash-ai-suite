# CocoLash AI Suite

## What This Is

A custom AI content + commerce stack for CocoLash, a DIY luxury lash brand. The Suite is a single Next.js application on Vercel + Supabase that powers three integrated systems for the founder Faith and her team: (1) brand-consistent **image generation** for marketing assets, (2) **UGC-style video generation** via HeyGen and Seedance/Enhancor pipelines, and (3) — starting now — an on-site **AI Sales Assistant** with virtual try-on that lives on cocolash.com via a Shopify Theme App Extension.

## Core Value

Every customer-facing CocoLash asset — image, video, or chatbot reply — sounds like Faith and converts like Faith. The Suite is the only place those three voices stay in sync because the brand DNA, prompt engine, and product knowledge are shared across all three systems.

## Current Milestone: v3.0 — AI Sales Assistant + Virtual Try-On

**Goal:** Ship a custom AI sales assistant that lives as a widget on cocolash.com, answers product and ordering questions in Faith's voice, recommends and add-to-cart products from Shopify, runs the existing Gemini-based virtual try-on flow inline, and gives Faith and her team an admin dashboard to manage discount codes, knowledge base content, transcripts, and analytics.

**Target features (v3.0):**
- Widget chat experience (Preact + Shadow DOM, mobile-first, <50KB gzipped) deployed on Faith's Shopify store via Theme App Extension + App Proxy
- RAG over the System 3 Knowledge Base (FAQ + product catalog) using Supabase pgvector
- Claude Sonnet 4.6 (via OpenRouter) with locked brand-voice system prompt: warm, empowering, educational not salesy, no urgency tactics
- Shopify Storefront API integration: product search, real-time inventory, add-to-cart, customer recognition for logged-in shoppers
- Admin-configurable discount-code engine with per-code rules and conversation triggers
- Virtual try-on inline in chat by reusing `lib/gemini/composition.ts:composePersonWithProduct`
- Lead capture → Supabase + email handoff to `support@cocolash.com`
- Admin dashboard at `/chatbot/admin` for: discount codes, voice prompt fragments, RAG content upload/delete, transcripts, on/off, lead export, analytics (daily sessions, conversation length, intent classification, full event funnel)
- Cookie consent banner (US-only, minimal)
- Daily cost guardrail with kill-switch ($50/day default for Claude + embeddings + Gemini try-on)

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Reconstructed from existing codebase as of 2026-05-02. -->

**Milestone v1.0 — Image Generation (System 1)**

- ✓ User can generate brand-consistent lash imagery via Gemini with category templates (lash-closeup, lifestyle, product, before-after, application-process) — `lib/prompts/compose.ts`, `app/api/generate/route.ts`
- ✓ User can configure diversity selectors (skin tone, hair, ethnicity, age range, scene, vibe, composition) with fair "random" rotation — `lib/diversity/tracker.ts`
- ✓ User can apply logo overlay (white/dark/gold variants) and export at 1K/2K/4K in 4 aspect ratios — `lib/image-processing/logo-overlay.ts`
- ✓ User can save and reload generation templates, browse a gallery, mark favorites — `app/api/templates/route.ts`, `app/api/images/`
- ✓ User can generate platform-specific captions and hashtags via OpenRouter/Claude — `lib/openrouter/captions.ts`, `lib/hashtags/selector.ts`

**Milestone v2.0 — Video Generation (System 2)**

- ✓ User can generate UGC-style talking-photo videos via HeyGen Avatar IV with ElevenLabs voice synthesis and SRT alignment — `app/api/videos/generate/route.ts`, `lib/heygen/`, `lib/elevenlabs/`
- ✓ User can generate UGC videos via Seedance 2.0 (via Enhancor.ai) with text-to-video, image-to-video, multi-frame, lipsyncing, and first-N-last-frames modes — `app/api/seedance/generate/route.ts`, `lib/seedance/`
- ✓ Webhook-based completion handling for Seedance with idempotency-by-request-id — `app/api/seedance/webhook/route.ts`, `lib/seedance/completion.ts`
- ✓ Server-side video script generation per campaign type (product-showcase, testimonial, promo, educational, unboxing, before-after, brand-story, faq, myths, product-knowledge) — `lib/prompts/scripts/`
- ✓ Caption burning via Shotstack and CDN delivery via Cloudinary — `lib/shotstack/client.ts`, `lib/cloudinary/video.ts`
- ✓ Person+product image composition via Gemini for virtual-styling shots — `lib/gemini/composition.ts:composePersonWithProduct`

### Active

<!-- Milestone v3.0 scope. See REQUIREMENTS.md for the testable REQ-IDs. -->

- [ ] On-site chat widget that loads on cocolash.com without breaking the theme
- [ ] RAG-grounded answers from the System 3 Knowledge Base (FAQ + product catalog)
- [ ] Brand voice locked: warm best-friend tone, no urgency, 70% value / 30% promo
- [ ] Real-time product context via Shopify Storefront API (inventory, price, links)
- [ ] Add-to-cart from inside the chat with optional discount code applied
- [ ] Customer recognition for logged-in Shopify shoppers (greet by name, reference last order)
- [ ] Virtual try-on triggered when user shows interest ("show me on me") via Gemini composition
- [ ] Lead capture → Supabase + email to `support@cocolash.com` with discount code in exchange
- [ ] Admin dashboard for discount rules, brand voice fragments, RAG content, transcripts, analytics, lead export, on/off switch
- [ ] Shopify Custom App + Theme App Extension + App Proxy for clean install + HMAC-signed cart actions
- [ ] Cost guardrail (kill-switch on daily spend cap)
- [ ] Cookie consent banner

### Out of Scope

| Feature | Why excluded |
|---|---|
| Live human chat / agent handoff (Intercom-style) | Email-only handoff is sufficient for v3.0; live chat is a v4 feature if conversation volume warrants the staffing cost |
| Multi-language support | CocoLash currently ships US-only per the System 3 Knowledge Base; English-only keeps prompt evaluation tractable |
| Persistent customer memory across anonymous sessions | Privacy-sensitive and complex; v3.0 only personalizes for *logged-in* Shopify customers within their session |
| Native mobile app | The widget is browser-only; CocoLash has no native app and one isn't on the roadmap |
| Voice / audio chat input | Text-only widget; voice input is a v4+ exploration |
| GDPR / CCPA-grade consent and DSR pipeline | Faith ships US-only; a minimal cookie banner is sufficient. Re-evaluate if international shipping launches |
| Auto-answering medical or safety claims | Bot must not make claims like "safe for sensitive eyes"; instead it states the ingredient profile (latex-free, formaldehyde-free, hypoallergenic) and recommends a patch test — taken directly from the brand-voice rules |

## Context

**Brand identity (from `public/brand/CocoLash-System3-Knowledge-Base-for-Harry.md` and `cocolash-brand_guidelines.pdf`)**

- Mission: *"Premium Lashes for Every Shade of Beauty"* — celebrates inclusivity across skin tones and eye shapes
- Founder: African American woman; brand spotlights customers, not the founder
- Tone: warm, empowering, feminine, aspirational but approachable — "smart best friend who happens to know everything about lashes"
- Greeting style locked: *"Hey gorgeous! Welcome to CocoLash. What can I help you find today?"*
- Voice anti-patterns: no urgency tactics, no fake scarcity ("limited time only", "selling out fast"), no pushy sales language, no medical claims, no "babe/hun" pet names, 70% educational / 30% promo
- Product line: 11 lash styles named after flowers — Classic ($12 single / $35 4-pack: Violet, Peony, Jasmine, Iris, Daisy) and Volume ($14 single / $40 4-pack: Dahlia, Poppy, Marigold, Orchid, Rose, Sorrel) plus the Lash Essentials Kit ($50) and Subscribe & Save ($24.50/mo). A Half Lash product is in development (~60 days out)
- Customer support hours: Monday–Friday 9 AM–5 PM EST
- Domestic shipping only (US); international planned but not live
- Free shipping ≥ $50; 24h order modification window; 30-day return policy

**Technical environment (from `.planning/codebase/`)**

- Single Next.js 16.1.6 App Router monolith on Vercel (Fluid Compute enabled, `maxDuration = 300` on long-running routes)
- Supabase Postgres + Storage + Auth (M3 dual-auth: Supabase + legacy cookie); migrations in `supabase/migrations/`
- Existing service-layer pattern in `lib/<service>/{client,types}.ts` with typed error classes (`GeminiError`, `HeyGenError`, `SeedanceError`)
- Storage buckets: `generated-images`, `brand-assets` (chatbot will add new buckets for KB content + selfies)
- Existing OpenRouter wiring (`lib/openrouter/`) — Claude Sonnet 4.6 already in use for captions and scripts
- Gemini composition primitive (`composePersonWithProduct`) is the foundation for virtual try-on

**Known concerns to address while building v3.0** (from `.planning/codebase/CONCERNS.md`)

- No Postgres RLS policies anywhere; M3 work should ENABLE RLS on its new tables and follow up with policies on M1/M2 tables
- Webhook secret-in-URL pattern in `app/api/seedance/webhook/route.ts` — replicate using HMAC headers only for the new Shopify webhook routes
- 184 existing `console.*` calls in production paths — introduce `lib/log.ts` as part of M3 (it benefits all three systems)
- `generated_videos` lacks `user_id` scoping; the new chat tables (`chat_sessions`, `chat_messages`, `lead_captures`) must include user/session ownership from day one

**Stakeholders**

- **Faith** — Founder + primary client; voice and brand decisions; admin dashboard end-user
- **Faith's team** — Secondary admin users (TBD per name list); transcript review, lead export
- **Aqsa** — Faith's technical contact; Shopify Storefront API token holder, Custom App approver
- **Deborah** — Content and assets (product images, discount codes); CSV exports already provided
- **Harry** — This project's engineer (you / Claude pair); ships against this roadmap

## Constraints

- **Tech stack:** Must extend the existing Next.js + Supabase + Vercel monolith. No second backend service. Reuse `lib/openrouter/`, `lib/gemini/composition.ts`, `lib/supabase/`, `lib/costs/tracker.ts`. — *Why: shared brand voice, single deployment, existing auth, lower ops surface.*
- **Brand voice:** System prompt must enforce the rules in §3 of the System 3 Knowledge Base verbatim. No "limited time", no urgency, no medical claims, no pet names. — *Why: Faith's brand authenticity is the entire reason Path B was chosen over a SaaS chatbot.*
- **Performance:** Widget bundle must be <50KB gzipped, mobile-first, no React on the client. — *Why: it loads on every page of cocolash.com; theme conflict and CWV are real risks.*
- **Privacy:** US-only data residency is acceptable; transcripts retained 180 days; selfies retained 24h then purged. No PII export beyond Faith's admin dashboard. — *Why: simple, cheap, defensible.*
- **Cost:** Hard daily kill-switch on combined Claude + embeddings + Gemini try-on spend; default $50/day, admin-configurable. — *Why: Faith would rather a 6-hour outage than a runaway bill.*
- **Deployment:** Stage 1 ships via `theme.liquid` snippet for fast iteration; Stage 2 (final delivery) ships as Shopify Custom App + Theme App Extension + App Proxy on Faith's store. — *Why: instant feedback loop early, professional one-click install at delivery.*
- **Storefront API rate limits:** Bot must cache product data and degrade gracefully when Shopify rate-limits. — *Why: live API on every message will hit limits at scale.*
- **Compatibility:** Cannot break the existing M1 image-generation pipeline or M2 video pipelines. New code is additive. — *Why: those systems are in production for Faith.*

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Build custom (Path B) instead of SaaS chatbot (Path A) | Faith is paying $4,000 for brand voice fidelity, virtual try-on, and tight integration with Systems 1 and 2 — none of which a SaaS app provides | — Pending validation at v3.0 ship |
| Extend the existing Next.js monolith rather than stand up a separate backend | Same Vercel deployment, shared brand voice + Gemini + Supabase + auth; lower ops surface | — Pending |
| Persona name "Coco" | On-brand, short, warm; alternative ("Bloom") considered and rejected | — Pending Faith's confirmation |
| Two-stage Shopify deployment (`theme.liquid` Stage 1 → Theme App Extension + App Proxy Stage 2) | Stage 1 ships in days for Faith feedback; Stage 2 ships polished and survives theme changes | — Pending |
| Preact + Shadow DOM widget (not React) | Bundle ceiling <50KB; no theme/CSS conflicts; existing React in Next.js admin is unaffected | — Pending |
| pgvector on existing Supabase Pro instance for RAG | Already paying for Supabase; no new vendor, no new ops surface | — Pending |
| Authority tier: FAQ KB > product CSV > Storefront API > generic Claude knowledge | Faith's curated docs are ground truth; Storefront API is for live signal only | — Pending |
| Update cadence: manual "Re-index" button + nightly Shopify webhook product sync | Real-time KB sync is over-engineered for v3.0; Faith uploads → click button is a clean mental model | — Pending |
| Selfie retention 24h, transcript retention 180d | Selfies = biometric-adjacent, short TTL; transcripts = trend signal, medium TTL | — Pending |
| Daily cost kill-switch at $50/day default | Hard cap on a misconfigured prompt or runaway thread | — Pending |
| Cookie banner even though US-only | Cheap insurance against a future international launch and Shopify App Store review | — Pending |
| Customer recognition for logged-in Shopify customers in v3.0 (light), persistent anonymous memory deferred to v4 | Recognition is high-value and feasible via App Proxy; cross-session anonymous memory is privacy-sensitive | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-05-02 — initial bootstrap from existing codebase + System 3 Knowledge Base; M1 and M2 history reconstructed from `.planning/codebase/` + git log; M3 charter from client conversation.*
