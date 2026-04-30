# System Architecture

**Analysis Date:** 2026-05-01

## Overview

CocoLash AI is a single Next.js 16 App Router application deployed on Vercel that orchestrates three AI content-generation pipelines on top of Supabase (Postgres, Auth, Storage):

1. **Image generation** — Gemini-based brand-consistent imagery
2. **HeyGen video** — Avatar-driven scripted video (talking-photo) with optional ElevenLabs audio
3. **Seedance video** — UGC-style video via Enhancor.ai (text-to-video / image-to-video) with webhook completion

The app is a vertical monolith: the same Next.js process serves UI (RSC + client components), REST API routes, and webhook endpoints. There is no separate backend service — all server logic lives in `app/api/**/route.ts` handlers and shared `lib/**` modules.

## High-Level Pattern

**Layered architecture inside a Next.js monolith.**

```
Browser
  │
  ▼
Next.js middleware (middleware.ts)         ← auth gate (Supabase + legacy cookie)
  │
  ▼
Next.js routes
  ├── app/(auth)/login            ← public
  ├── app/(protected)/**          ← UI pages (RSC + client components)
  └── app/api/**/route.ts         ← REST + webhooks
        │
        ▼
Service layer (lib/**)            ← typed, framework-agnostic clients & domain logic
  ├── lib/gemini, lib/heygen, lib/seedance, lib/elevenlabs, lib/openrouter,
  ├── lib/cloudinary, lib/shotstack, lib/blotato
  ├── lib/supabase                ← createClient / createAdminClient / storage
  ├── lib/prompts                 ← prompt engine (compose + modules)
  ├── lib/diversity, lib/hashtags, lib/costs, lib/image-processing, lib/video
  └── lib/types                   ← cross-cutting type definitions
        │
        ▼
External services (see INTEGRATIONS.md)
  Supabase  Gemini  HeyGen  Enhancor/Seedance  ElevenLabs
  OpenRouter  Cloudinary  Shotstack  Blotato  Replicate
```

Every API route follows the same pattern: validate input → resolve auth + brand context via Supabase → call one or more `lib/**` clients → persist to Supabase → return JSON. The `lib/**` modules never import from `app/**` or `components/**`, which keeps the dependency graph one-directional.

## Layers

### 1. Edge / Middleware (`middleware.ts`)

`middleware.ts:18` runs on every request matching the `config.matcher` (everything except static assets). Two responsibilities:

- **Refresh Supabase session** via `lib/supabase/middleware.ts:updateSession` (rewrites cookies on the response to keep tokens fresh).
- **Authorize the request**: a request is authenticated if EITHER a valid Supabase user OR a `cocolash-auth` cookie equal to `process.env.AUTH_TOKEN` is present. Public paths: `/login`, `/api/auth`, `/auth`, `/api/seedance/webhook`. Authenticated users hitting `/login` are redirected to `/generate`.

This dual-auth strategy is the key transitional decision in the codebase — the legacy password-cookie path (M1–M2) coexists with Supabase Auth (M3+).

### 2. UI Layer (`app/**`, `components/**`)

**Route groups:**
- `app/(auth)/login` — single-page password form; calls `POST /api/auth`.
- `app/(protected)/` — wrapped by `app/(protected)/layout.tsx:14` (Sidebar + Header + MobileNav from `components/layout/`). Pages: `generate`, `gallery`, `favorites`, `video`, `video/gallery`, `settings`.
- `app/layout.tsx:25` — root layout with `TooltipProvider` and a `Toaster` from `sonner`.

**Component organization (`components/`):**
- `components/ui/` — shadcn/ui primitives (button, dialog, select, etc.). Style = "new-york", base color = "neutral" (`components.json`).
- `components/layout/` — `Sidebar`, `Header`, `MobileNav`.
- `components/generate/` — image generation wizard parts (`GenerateForm.tsx` is the orchestrator; per-axis selectors like `LashStyleSelector`, `EthnicitySelector`, `SkinToneSelector`, `CompositionSelector`).
- `components/video/` — HeyGen video wizard (`ScriptGenerator`, `AvatarSetup`, `VoiceAndStyle`, `GenerateVideo`, `PipelineSelector`).
- `components/video/seedance/` — Seedance-pipeline-specific wizard steps (`SeedanceScriptStep`, `SeedanceAvatarStep`, `SeedanceGenerateStep`).
- `components/gallery/` — image and caption gallery (`ImageCard`, `ImageModal`, `GalleryFilters`, `CaptionHistoryView`, `PublishingHistoryView`).
- `components/settings/` — brand profile, hashtags, social accounts, cost summary, user manager.

Pages that need interactivity (e.g. `app/(protected)/video/page.tsx`) are explicit `"use client"` components and use `useSearchParams`/`useState`. Server components are the default elsewhere (e.g. `app/(protected)/generate/page.tsx` is a thin RSC that mounts `<GenerateForm/>`).

### 3. API Layer (`app/api/**/route.ts`)

REST handlers grouped by resource:

- **Auth:** `app/api/auth/route.ts` (legacy password login), `app/api/auth/me/route.ts`.
- **Image pipeline:** `app/api/generate/route.ts` (the canonical example — see "Pipelines" below), `app/api/images/route.ts`, `app/api/images/[id]/route.ts` (+ `captions`, `posts`, `favorite`, `download` sub-routes).
- **HeyGen video pipeline:** `app/api/videos/generate/route.ts`, `app/api/videos/[id]/route.ts` (+ `status`, `caption`, `download`), `app/api/voices/route.ts`, `app/api/scripts/route.ts`, `app/api/heygen/generate-studio-avatar/route.ts`.
- **Seedance video pipeline:** `app/api/seedance/generate/route.ts`, `app/api/seedance/generate-ugc-image/route.ts`, `app/api/seedance/[id]/status/route.ts`, `app/api/seedance/webhook/route.ts` (public; HMAC-style auth via `isAuthorizedWebhook`).
- **Brand & catalog:** `app/api/brand/route.ts`, `app/api/product-categories/route.ts`, `app/api/product-categories/[id]/images/route.ts`, `app/api/backgrounds/route.ts`, `app/api/templates/route.ts`, `app/api/hashtags/route.ts`, `app/api/hashtags/[id]/route.ts`, `app/api/hashtags/bulk/route.ts`.
- **Captions & publishing:** `app/api/captions/generate/route.ts`, `app/api/captions/[id]/route.ts`, `app/api/publish/route.ts`, `app/api/social-accounts/route.ts`, `app/api/social-accounts/sync/route.ts`, `app/api/export/route.ts`.
- **Operational:** `app/api/costs/route.ts`, `app/api/admin/users/route.ts`, `app/api/settings/blotato/route.ts`, `app/api/settings/captions/route.ts`.

**Long-running routes** declare `export const maxDuration = 300;` (e.g. `app/api/generate/route.ts:46`, `app/api/videos/generate/route.ts:24`, `app/api/seedance/generate/route.ts:23`). This requires Vercel Fluid Compute and aligns with the 5-minute generation envelope quoted in code comments.

### 4. Service Layer (`lib/**`)

Each external service has its own folder with a `client.ts` and a `types.ts` (and sometimes domain helpers):

- `lib/supabase/` — `client.ts` (browser singleton via `@supabase/ssr` `createBrowserClient`), `server.ts` (`createClient` and `createAdminClient` using cookies + service-role key), `middleware.ts` (`updateSession`), `storage.ts` (typed bucket helpers + `BUCKETS` constant).
- `lib/gemini/` — `client.ts` (low-level `@google/genai` wrapper), `generate.ts` (`generateImage`, `ReferenceImage`), `composition.ts` (`composePersonWithProduct` for video pipelines), `safety.ts` (`GeminiError` + safety filters).
- `lib/heygen/` — `client.ts` (upload asset, create photo avatar, generate video, poll status, list voices), `types.ts` (`HeyGenError`, `VideoGenParams`, etc.), `studio-avatar-prompt.ts`.
- `lib/seedance/` — `client.ts` (Enhancor `/queue` + status polling), `prompt-planner.ts`, `video-prompt.ts`, `ugc-image-prompt.ts`, `completion.ts` (webhook completion handler), `types.ts` (`SeedanceError`, mode/aspect/duration unions).
- `lib/openrouter/` — `client.ts` + `captions.ts` (`generateVideoScript`, caption generation via Claude through OpenRouter).
- `lib/elevenlabs/` — voice synthesis + alignment-to-SRT.
- `lib/cloudinary/video.ts` — video upload/transform/delivery.
- `lib/shotstack/client.ts` — video editing/composition.
- `lib/blotato/` — `client.ts` + `types.ts` for social publishing (with API-key-per-user pattern).
- `lib/prompts/` — the prompt-engine. `compose.ts` is the master assembler that combines `brand-dna`, `negative`, `skin-realism`, per-category templates (`categories/lash-closeup`, `lifestyle`, `product`, `before-after`, `application-process`), and module dictionaries (`modules/skin-tones`, `hair-styles`, `lash-styles`, `scenes`, `vibes`, `compositions`, `seasonal`, `ethnicity`, `age-range`).
- `lib/prompts/scripts/` and `lib/prompts/captions/` — system+user prompts for OpenRouter calls (with a Seedance-specific variant in `scripts/seedance.ts`).
- `lib/diversity/tracker.ts` — records the resolved skin-tone/hair/scene/vibe per generation so "random" rotates fairly.
- `lib/hashtags/selector.ts` — deterministic hashtag picker.
- `lib/image-processing/logo-overlay.ts`, `before-after-compositor.ts` — sharp-based post-processing.
- `lib/video/` — orchestration helpers shared by both video pipelines: `processor.ts`, `captions.ts`, `heygen-campaign.ts`, `insert-gallery-asset.ts`.
- `lib/costs/` — `tracker.ts` + `estimates.ts` (per-pipeline cost accounting).
- `lib/constants/` — `brand.ts`, `hashtags.ts`, `posting-times.ts` (static, framework-agnostic).
- `lib/types/index.ts` — the central type registry; everything imports from `@/lib/types`.

## Pipelines

The three pipelines are the load-bearing flows. They share a common shape (validate → resolve context → call external services → persist → respond) but differ in async semantics.

### Image generation — `POST /api/generate`

`app/api/generate/route.ts` documents the full sequence:

1. Validate `GenerationSelections` from the form.
2. Fetch `brand_profile` (logo, overrides) via Supabase.
3. Fetch recent diversity usage via `getRecentDiversityUsage` (so "random" picks a fresh value).
4. Compose the prompt via `composePrompt` / `composeBeforeAfterPrompts` (`lib/prompts/compose.ts`).
5. `generateImage` from `lib/gemini/generate.ts`.
6. Upload raw image to `generated-images` bucket.
7. Conditionally apply logo overlay (`lib/image-processing/logo-overlay.ts`) and re-upload.
8. Insert into `generated_images` table.
9. Record diversity selection.
10. Return `{ success, image, generationTimeMs }`.

Synchronous: the request waits for Gemini and the Supabase writes to finish.

### HeyGen video — `POST /api/videos/generate`

`app/api/videos/generate/route.ts` orchestrates:

1. Generate or fetch script via `generateVideoScript` (OpenRouter → Claude).
2. Resolve person image (existing `generated_images` row OR provided URL).
3. Compose person + product via `composePersonWithProduct` (Gemini, preserves background).
4. Create photo avatar via HeyGen (`uploadAudioAsset` → avatar group → `talking_photo_id`).
5. Optionally synthesize voice via ElevenLabs (`synthesizeToAudio` + `alignmentToSRT`).
6. Submit video generation (HeyGen Avatar IV).
7. Insert `generated_videos` row.
8. Return video id; UI polls `/api/videos/[id]/status` until complete, then fetches captions/download URLs.

Asynchronous via polling. There is no webhook from HeyGen; the client polls status.

### Seedance video — `POST /api/seedance/generate` + webhook

`app/api/seedance/generate/route.ts`:

1. Validate (mode-dependent: ugc / multi_reference / multi_frame / lipsyncing / first_n_last_frames).
2. Resolve script (script-in-prompt vs uploaded-audio mode).
3. Build director prompt via `buildSeedanceDirectorPromptFallback` / `generateSeedanceDirectorPrompt`.
4. `createSeedanceTask` (`lib/seedance/client.ts`) → Enhancor `/queue`.
5. Insert `generated_videos` row keyed by `seedance_task_id`.
6. Return id.

`app/api/seedance/webhook/route.ts` (public route in `middleware.ts:20`):

1. Verify webhook authorization (`isAuthorizedWebhook` uses `crypto.timingSafeEqual`).
2. Look up `generated_videos` by `seedance_task_id`.
3. Branch on `payload.status` (`COMPLETED` / `FAILED`).
4. Idempotent: subsequent callbacks for the same `request_id` are no-ops.
5. On success, `completeSeedanceVideo` downloads the result, uploads to storage, and updates the row.

## Data Flow

**Generate-image happy path (synchronous):**

```
GenerateForm.tsx
  → POST /api/generate
    → validate
    → supabase.from('brand_profile').select(...)
    → composePrompt(...)
    → generateImage(...)              // Gemini
    → uploadGeneratedImage(...)       // Supabase Storage
    → applyLogoOverlay(...)           // optional, sharp
    → insert into generated_images
    → recordDiversitySelection(...)
  ← { success, image, generationTimeMs }
ImagePreview.tsx renders image.url
```

**Seedance video happy path (async via webhook):**

```
SeedanceGenerateStep.tsx
  → POST /api/seedance/generate
    → createSeedanceTask          // Enhancor /queue
    → insert generated_videos (status: pending)
  ← { id }

(some time later)

Enhancor → POST /api/seedance/webhook
    → isAuthorizedWebhook (HMAC compare)
    → find generated_videos by seedance_task_id
    → completeSeedanceVideo:
        download MP4 → upload to Supabase Storage → update row (status: completed, video_url, ...)
  ← { received: true, processed: true }

UI polls /api/seedance/[id]/status → renders <VideoCard/>
```

## Abstractions

- **Typed error classes per service** — `GeminiError` (`lib/gemini/safety.ts`), `HeyGenError` (`lib/heygen/types.ts`), `SeedanceError` (`lib/seedance/types.ts`). Each carries `(message, status, code)`. Routes catch these and translate to typed JSON responses.
- **Cookie-based Supabase client factories** — `createClient` (anon) and `createAdminClient` (service role) both live in `lib/supabase/server.ts`. Routes never instantiate clients themselves; they call these factories.
- **Bucket constant** — `BUCKETS = { GENERATED_IMAGES, BRAND_ASSETS }` (`lib/supabase/storage.ts:14`) is the single source of truth for storage bucket names.
- **`lib/types/index.ts` re-export hub** — All cross-cutting unions (`ContentCategory`, `Composition`, `AspectRatio`, `ImageResolution`, `ScriptTone`, `CampaignType`, `VideoDuration`, `VideoPipeline`, etc.) and option arrays (`ASPECT_RATIO_OPTIONS`, `IMAGE_RESOLUTION_OPTIONS`) live here. Always import from `@/lib/types`, not from feature-local type files (those exist for service-internal types only — `lib/heygen/types.ts`, `lib/seedance/types.ts`).
- **Prompt-engine composition** — `lib/prompts/compose.ts:composePrompt` is the single entry point. It owns "random" resolution for skin tone, hair, scene, and vibe, and emits the resolved values back so the diversity tracker can record them.
- **`videoAspectToImageAspect` and `buildMinimalSelectionsForVideoAsset`** (`lib/video/insert-gallery-asset.ts`) bridge the video pipelines into the gallery (`generated_images`-style rows) so the UI can render videos and images uniformly.

## Entry Points

- **HTTP entry:** `middleware.ts` runs first; then Next.js dispatches to either `app/(auth)/login/page.tsx`, an `app/(protected)/**/page.tsx`, or an `app/api/**/route.ts` handler.
- **Static config entry:** `next.config.ts` (image remote patterns), `tsconfig.json` (path alias `@/*`), `eslint.config.mjs`, `postcss.config.mjs`, `vercel.json` (Fluid Compute toggle), `components.json` (shadcn).
- **Database entry:** `supabase/migrations/*.sql` — Postgres schema is migration-managed. Migration names are dated (e.g. `20260429_add_video_script_pipeline.sql`).
- **Scripts:** `scripts/seed-hashtags.ts`, `scripts/upload-products.mjs`, `scripts/upload-category-images.mjs`, `scripts/migrate-product-categories.mjs`, `scripts/test-captions.ts`, `scripts/test-hashtag-selector.ts`. Run via `tsx` with `dotenv` to load `.env.local`.

## Constraints & Conventions That Are Load-Bearing

1. **`lib/**` must not import `app/**` or `components/**`.** This keeps service code reusable from any handler or script.
2. **`lib/supabase/server.ts` is the only place that reads `SUPABASE_SERVICE_ROLE_KEY`.** Webhook + admin routes must use `createAdminClient`; user-facing routes use `createClient` so RLS is enforced.
3. **`maxDuration = 300` is mandatory** on routes that call Gemini / HeyGen / Seedance. Without it, Vercel will time out at the default before the model finishes.
4. **Webhook routes must be in `publicPaths` in `middleware.ts`.** Currently `/api/seedance/webhook` is the only one — adding a new webhook requires updating the array.
5. **All option enums and aspect-ratio dimensions live in `lib/types/index.ts`.** New aspect ratios need to be added there, not in route files.
6. **Cross-pipeline cost tracking goes through `lib/costs/tracker.ts`.** New paid API calls should record cost there for the `/api/costs` dashboard to stay accurate.

## Anti-Patterns to Avoid

- Creating Supabase clients ad-hoc inside routes (use `createClient` / `createAdminClient`).
- Importing `@google/genai`, `replicate`, `@supabase/supabase-js`, or any external SDK directly from `app/**` or `components/**` — go through `lib/**`.
- Hard-coding bucket names (use `BUCKETS`).
- Throwing plain `Error` from a service module — use the typed `*Error` class so the API layer can translate the status correctly.
- Adding new public routes without updating `middleware.ts:publicPaths`.

## Error Handling

- **Service layer:** throws `GeminiError` / `HeyGenError` / `SeedanceError` with `(message, status, code)`.
- **API layer:** wraps the body in `try { ... } catch (err) { ... }`, branches on `err instanceof XxxError`, and returns `NextResponse.json({ error, code }, { status })`.
- **UI layer:** `sonner` toasts surface errors; long-running operations use `<GenerationProgress />` and `<ErrorDisplay />`.
- **Webhook layer:** always responds `200 { received: true, processed: false }` for unrecognized request IDs to prevent retry storms; logs via `console.error("[seedance/webhook] ...")`.

## Background & Async Work

- **HeyGen videos** are polled from the client (`/api/videos/[id]/status`).
- **Seedance videos** complete via webhook (`/api/seedance/webhook`) — the UI also polls `/api/seedance/[id]/status` as a backup in case the webhook is missed.
- **No background queue / cron** — there is no Vercel Cron job, BullMQ, or Inngest in the stack. Every async path is either client-poll or webhook.

---

*Architecture analysis: 2026-05-01*
