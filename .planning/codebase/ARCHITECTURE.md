<!-- refreshed: 2026-05-31 -->
# Architecture

**Analysis Date:** 2026-05-31

## System Overview

CocoLash AI is a Next.js full-stack application for AI-powered content creation. It's a monolithic Next.js app with three primary pipelines: (1) image generation via Gemini, (2) video generation via Seedance + HeyGen, and (3) a sales chatbot powered by Claude Sonnet 4.6. All data persists in Supabase PostgreSQL with vector embeddings.

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend Layer (React)                        │
├──────────────────┬──────────────────┬──────────────────┬────────────┤
│  Generate Page   │  Gallery Page    │  Video Page      │ Settings   │
│ `app/(protected)`│ `app/(protected)`│ `app/(protected)`│   Page     │
├──────────────────┴──────────────────┴──────────────────┴────────────┤
│                      Layout & Navigation (140 components)           │
│  `components/` (ui, layout, generate, gallery, video, settings)     │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                    API Routes Layer (Next.js)                        │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│  Image Gen   │  Video Gen   │  Chat API    │  Admin/Settings       │
│ `/api/       │ `/api/       │ `/api/chat`  │ `/api/settings`       │
│  generate`   │  seedance`   │ `/api/        │ `/api/admin`          │
│ `/api/brand` │ `/api/       │  chat/config` │ `/api/products`       │
│              │  heygen`     │ `/api/costs`  │ `/api/shopify`        │
└──────────────┴──────────────┴──────────────┴───────────────────────┘
         │                    │                  │
         ▼                    ▼                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Business Logic Layer                            │
│                   `lib/` (112 TypeScript modules)                    │
├──────────────────────────────────────────────────────────────────────┤
│ • Image Pipeline: gemini, prompts, brand, image-processing, diversity│
│ • Video Pipeline: seedance, heygen, video, openrouter               │
│ • Chat Pipeline: chat, openrouter, costs, shopify                   │
│ • Data Access: supabase (client/server, storage, middleware)        │
│ • Logging: log.ts (structured JSON logging)                         │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  External Services & Databases                       │
├──────────┬──────────────┬──────────────┬──────────────┬──────────────┤
│ Supabase │  Google     │  Seedance    │  HeyGen      │  OpenRouter  │
│ (Auth,  │  Gemini     │  (UGC Video) │  (Avatar    │  (Claude LLM │
│ Storage,│  (Image)    │  Generation) │  Video Gen)  │  + Captions) │
│ DB)     │             │              │              │              │
└──────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Frontend (React)** | User-facing pages, forms, galleries, settings UIs | `app/(protected)/**`, `components/**` |
| **API Routes** | HTTP endpoints, request validation, pipeline orchestration | `app/api/**/*.ts` |
| **Image Pipeline** | Gemini integration, prompt composition, logo overlays, diversity tracking | `lib/gemini/`, `lib/prompts/`, `lib/image-processing/`, `lib/diversity/` |
| **Video Pipeline** | Seedance task creation, HeyGen polling, video processing | `lib/seedance/`, `lib/heygen/`, `lib/video/` |
| **Chat Pipeline** | Intent classification, knowledge retrieval, discount/product injection, voice fragments | `lib/chat/`, `lib/openrouter/` |
| **Database Access** | Supabase client, server auth, storage ops, migrations | `lib/supabase/`, `supabase/migrations/` |
| **Brand & Commerce** | Brand profile management, product lookup, Shopify integration | `lib/brand/`, `lib/shopify/` |
| **Utilities** | Constants, types, logging, helpers | `lib/types/`, `lib/constants/`, `lib/log.ts` |
| **Auth & Middleware** | Dual-auth strategy (Supabase + cookie fallback) | `middleware.ts`, `lib/supabase/middleware.ts` |

## Pattern Overview

**Overall:** REST API with streaming server-sent events (SSE) for long-running operations (chat, video generation).

**Key Characteristics:**
- **Monolithic Next.js app** — Single deployment unit, shared types and utilities
- **Dual-auth strategy** — Supabase Auth (M3 upgrade) with cookie fallback (M1-M2 legacy)
- **Service-oriented lib structure** — Each external API/feature gets a subdirectory in `lib/`
- **Streaming responses** — Chat and long-running video/image tasks return SSE or JSON polling
- **Database-first** — All operations persist to Supabase PostgreSQL; vector embeddings for RAG
- **Type-safe** — Central type definitions in `lib/types/index.ts` shared across all layers
- **Error handling** — Custom error classes per domain (e.g., `ChatError`, `GeminiError`)

## Layers

**Frontend Layer:**
- Purpose: User interface for content generation, galleries, settings, chatbot
- Location: `app/(protected)/`, `components/`
- Contains: React Server Components (RSCs), form components, galleries, navigation layouts
- Depends on: API routes via fetch, UI utilities (shadcn/radix), hooks
- Used by: End users via web browser

**API Routes Layer:**
- Purpose: HTTP endpoints that orchestrate pipelines and validate requests
- Location: `app/api/`
- Contains: Route handlers (GET/POST/DELETE) using Next.js `NextRequest`/`NextResponse`
- Depends on: `lib/**` for business logic, Supabase for data access
- Used by: Frontend, webhooks, external services

**Business Logic Layer (lib/):**
- Purpose: Reusable services, pipelines, integrations with external APIs
- Location: `lib/`
- Contains: Service classes, pipeline orchestrators, data access helpers, type definitions
- Depends on: External SDKs (Gemini, Seedance, HeyGen, OpenRouter), Supabase client
- Used by: API routes, other lib modules

**Data Access Layer:**
- Purpose: Abstracts Supabase interactions (auth, storage, database queries)
- Location: `lib/supabase/`
- Contains: `client.ts` (browser), `server.ts` (server), `middleware.ts` (auth refresh), `storage.ts` (file uploads)
- Depends on: @supabase/supabase-js, @supabase/ssr
- Used by: All API routes and services

## Data Flow

### Primary Request Path (Image Generation)

1. User submits generate form (`app/(protected)/generate/page.tsx`)
2. Form calls `POST /api/generate` with selections (category, aspect ratio, lash style, etc.)
3. Route validates via `validateSelections()` (`app/api/generate/route.ts:87`)
4. Fetches brand profile via `GET /api/brand` → `lib/brand/product-truth.ts`
5. Composes prompt via `lib/prompts/compose.ts:composePrompt()`
6. Calls `lib/gemini/generate.ts:generateImage()` → Google Gemini API
7. On success, uploads raw image to Supabase Storage via `lib/supabase/storage.ts:uploadGeneratedImage()`
8. If logo enabled, applies overlay via `lib/image-processing/logo-overlay.ts:applyLogoOverlay()`
9. Inserts `generated_images` record, records diversity selection
10. Returns `{ success: true, image: url, generationTimeMs }`

### Video Generation Path (Seedance)

1. User submits video form (`app/(protected)/video/page.tsx`)
2. Form calls `POST /api/seedance/generate` with campaign type, images, script, etc.
3. Route validates selections and resolves mode (text-to-video vs. image-to-video)
4. Composes Seedance prompt via `lib/seedance/prompt-planner.ts:generateSeedanceDirectorPrompt()`
5. Creates task via `lib/seedance/client.ts:createSeedanceTask()` → Seedance API
6. Inserts `generated_videos` record with status `pending`
7. Returns task ID; frontend polls `GET /api/videos?status=pending`
8. Webhook at `POST /api/seedance/webhook` receives status updates (in-progress → completed)
9. On completion, records final video in database, optionally triggers HeyGen pipeline

### Chat Pipeline (Milestone v3.0)

1. Visitor sends message via embedded widget or dashboard (`POST /api/chat`)
2. Route validates session (creates if missing) via `lib/chat/db.ts`
3. Embeds query via `lib/chat/embeddings.ts` → OpenAI embeddings API
4. Retrieves top-K knowledge chunks via `lib/chat/retrieve.ts` (vector similarity in Supabase)
5. Classifies intent in parallel via `lib/chat/intent.ts` (Claude classification)
6. Fetches active discounts via `lib/chat/discount.ts` if intent is product/order
7. Builds product context via `lib/chat/product-context.ts` (Shopify product refs)
8. Composes system prompt via `lib/chat/voice.ts` (persona, rules, fragments, product context)
9. Streams Claude Sonnet 4.6 response via `lib/openrouter/chat.ts:streamChat()` as SSE
10. Persists user message, assistant response, intent, retrieved chunks, costs to database

**State Management:**
- **Frontend:** React state for form selections, generation progress, galleries (no Redux/Zustand)
- **Backend:** Supabase database as source of truth; temporary in-memory tracking for polling
- **Videos:** Status stored in `generated_videos.heygen_status` and `pipeline` column

## Key Abstractions

**GenerationSelections Interface:**
- Purpose: Represents all choices from the image generation form
- Examples: `lib/types/index.ts:GenerationSelections`
- Pattern: Validated on POST, passed through pipeline, recorded in database

**ChatMessage & ChatSession:**
- Purpose: Represent conversation state and message history
- Examples: `lib/chat/types.ts:ChatMessage`, `ChatSession`
- Pattern: Loaded from database, enriched with intent/cost data, appended after response

**SeedancePrompt & VideoPrompt:**
- Purpose: Encapsulate Seedance-specific prompt composition
- Examples: `lib/seedance/prompt-planner.ts`, `lib/seedance/video-prompt.ts`
- Pattern: Built from campaign type + selections, sent verbatim to Seedance API

**VoiceFragments & ChatSettings:**
- Purpose: Admin-editable bot personality and cost controls
- Examples: `lib/chat/types.ts:VoiceFragments`, `ChatSettings`
- Pattern: Loaded once per request, cached in memory, updated via `/api/settings` admin endpoint

## Entry Points

**Web Application:**
- Location: `app/layout.tsx` (root), `app/(protected)/layout.tsx` (authenticated routes)
- Triggers: User navigates to `/` (redirects to `/generate`), authenticated pages require middleware check
- Responsibilities: Initialize layout, apply theme/fonts, render sidebar/header, nest protected routes

**API Endpoints:**
- Location: `app/api/*/route.ts` (40+ endpoints)
- Triggers: HTTP requests from frontend, webhooks from external services (Seedance, HeyGen)
- Responsibilities: Validate input, orchestrate business logic, return JSON or stream SSE

**Middleware:**
- Location: `middleware.ts`
- Triggers: Every HTTP request through Next.js
- Responsibilities: Refresh Supabase auth session, check cookie fallback, redirect unauthenticated users to `/login`

**Webhooks:**
- Location: `app/api/seedance/webhook`, `app/api/shopify/products-webhook`
- Triggers: External service calls (Seedance on video completion, Shopify on product updates)
- Responsibilities: Verify signature, update database, trigger downstream processing

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js); long-running operations (image/video gen) have 300s timeout, require Vercel Fluid Compute
- **Global state:** None; all state in Supabase database or request-scoped memory
- **Circular imports:** None detected; lib modules are leaf nodes with no cross-dependencies
- **Auth dual-layer:** Supabase + cookie fallback creates two paths through middleware; both must be kept in sync
- **Database:** All user data must go through `lib/supabase/` clients; no direct PG connections
- **External API limits:** Gemini (quota), Seedance (concurrent tasks), HeyGen (avatar slots), OpenRouter (rate limits) — no retry logic implemented yet
- **Storage:** Cloudinary for brand assets, Supabase Storage for generated images/videos (no CDN caching currently)

## Anti-Patterns

### Direct console.log in Production Code

**What happens:** M1/M2 code uses `console.log()` for debugging; output pollutes logs in production
**Why it's wrong:** Structured logging (`lib/log.ts`) exists but isn't used everywhere; makes log parsing difficult
**Do this instead:** Replace `console.log()` with `log.info()` from `lib/log.ts` — set `LOG_LEVEL` env to control verbosity

### Promise-based polling without timeouts

**What happens:** Frontend polls `/api/videos?status=pending` indefinitely waiting for Seedance to complete
**Why it's wrong:** Network hangs, server crashes, or API failures can leave UI waiting forever
**Do this instead:** Implement max retry count + exponential backoff; show timeout UI after 10 minutes

### Hardcoded prompts in route handlers

**What happens:** `app/api/generate/route.ts` and `app/api/seedance/generate/route.ts` compose prompts inline
**Why it's wrong:** Large prompts mixed with validation/orchestration code; hard to iterate on prompt quality
**Do this instead:** Move all prompts to `lib/prompts/` and `lib/seedance/prompt-planner.ts`; keep routes as orchestrators

### Missing error handling for external API failures

**What happens:** Gemini, Seedance, HeyGen API calls fail but route doesn't catch/retry
**Why it's wrong:** Silent failures; user sees blank image or "pending" forever
**Do this instead:** Wrap all external calls in try-catch; record error, return user-friendly message with retry link

## Error Handling

**Strategy:** Domain-specific error classes for meaningful stack traces and user messaging.

**Patterns:**
- `ChatError` (`lib/chat/error.ts`) — Chat pipeline failures with optional retry guidance
- `GeminiError` (`lib/gemini/safety.ts`) — Safety violations and generation failures
- `NextResponse.json({ error: "..." }, { status: 500 })` — Catch-all for unhandled errors in routes
- `throw new Error("message")` — Used for validation errors (converted to 400 by middleware)

**Recovery:**
- Image generation: User can retry via form (no permanent failure record)
- Video generation: Task stored with status; webhook updates; UI shows "retrying" or "failed"
- Chat: Message recorded regardless; cost tracked even on failure; no auto-retry (user re-sends)

## Cross-Cutting Concerns

**Logging:** Structured JSON via `lib/log.ts`; replace `console.*` in new code. Level: debug < info < warn < error

**Validation:** Zod schemas in route handlers (`GenerationSelections`, `ChatRequestSchema`); type narrowing in business logic

**Authentication:** Dual-auth in `middleware.ts` (Supabase or cookie); enforced for all routes except `/login`, `/api/auth`, `/api/chat`, `/api/seedance/webhook`

**Cost Tracking:** `lib/costs/tracker.ts` logs all API calls (chat tokens, embeddings, image gen, video task cost); stored in `chat_cost_events` table; daily cap enforced in `/api/chat`

**Rate Limiting:** `lib/chat/rate-limit.ts` limits chat messages per session per minute (guards against spam)

---

*Architecture analysis: 2026-05-31*
