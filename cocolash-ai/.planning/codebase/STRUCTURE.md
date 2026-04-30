# Project Structure

**Analysis Date:** 2026-05-01

## Top-Level Layout

```
cocolash-ai/
├── app/                  Next.js 16 App Router (pages, layouts, API routes)
├── components/           React components (UI primitives + feature components)
├── lib/                  Service layer, prompt engine, types, helpers
├── hooks/                (currently empty — reserved for cross-cutting hooks)
├── public/               Static assets (favicon, brand SVGs, brand images)
├── scripts/              CLI utilities run via tsx (seeding, uploads, ad-hoc tests)
├── supabase/             SQL migrations + Supabase CLI metadata
├── Plan/                 In-tree planning notes (active feature scoping)
├── middleware.ts         Auth + Supabase session refresh on every request
├── next.config.ts        Next config (image remote patterns)
├── tsconfig.json         TypeScript config (path alias `@/*`)
├── components.json       shadcn/ui config
├── eslint.config.mjs     ESLint flat config (`eslint-config-next`)
├── postcss.config.mjs    Tailwind v4 PostCSS pipeline
├── vercel.json           Vercel deployment config (Fluid Compute)
├── package.json          Manifest (npm; scripts: dev/build/start/lint)
├── .env.example          Required + optional env vars (template)
└── .env.local            (Gitignored) actual secrets
```

## `app/` — Next.js App Router

**Layouts and pages:**

```
app/
├── layout.tsx                                   Root layout (Geist fonts, Toaster, TooltipProvider)
├── page.tsx                                     Root redirect / landing
├── globals.css                                  Tailwind v4 + custom CSS
├── (auth)/
│   └── login/page.tsx                           Public password login
└── (protected)/                                 Route group; auth via middleware
    ├── layout.tsx                               Sidebar + Header + MobileNav frame
    ├── generate/page.tsx                        Image generation wizard
    ├── gallery/page.tsx                         Generated-image gallery
    ├── favorites/page.tsx                       Favorited images
    ├── video/page.tsx                           Video generation wizard (HeyGen + Seedance)
    ├── video/gallery/page.tsx                   Generated-video gallery
    └── settings/page.tsx                        Brand profile, hashtags, social, costs
```

**API routes (`app/api/**/route.ts`):**

```
app/api/
├── auth/                       POST login (legacy cookie)
│   ├── route.ts
│   └── me/route.ts             GET current user
├── admin/
│   └── users/route.ts          GET admin user list (gated by ADMIN_EMAIL)
├── brand/route.ts              GET / PATCH brand profile
├── images/                     Image CRUD + sub-resources
│   ├── route.ts                GET list, DELETE
│   └── [id]/
│       ├── route.ts            GET/PATCH/DELETE single image
│       ├── captions/route.ts   per-image caption history
│       ├── posts/route.ts      per-image scheduled posts
│       ├── favorite/route.ts   toggle favorite
│       └── download/route.ts   download original
├── generate/route.ts           POST image generation (Gemini)
├── export/route.ts             POST reframe / re-export image
├── product-categories/         catalog
│   ├── route.ts
│   └── [id]/images/route.ts
├── backgrounds/route.ts        background music catalog
├── templates/route.ts          saved generation templates
├── hashtags/                   hashtag library
│   ├── route.ts
│   ├── [id]/route.ts
│   └── bulk/route.ts
├── captions/                   AI captions
│   ├── generate/route.ts
│   └── [id]/route.ts
├── publish/route.ts            scheduled posting via Blotato
├── social-accounts/            connected social accounts
│   ├── route.ts
│   └── sync/route.ts
├── scripts/route.ts            saved video scripts
├── voices/route.ts             HeyGen voice catalog (cached)
├── videos/                     HeyGen pipeline
│   ├── route.ts                GET list
│   ├── generate/route.ts       POST start video
│   └── [id]/
│       ├── route.ts            GET/DELETE single video
│       ├── status/route.ts     poll HeyGen status
│       ├── caption/route.ts    burn captions via Shotstack
│       └── download/route.ts
├── seedance/                   Seedance pipeline
│   ├── generate/route.ts       POST start UGC video
│   ├── generate-ugc-image/route.ts  generate person+product image
│   ├── [id]/status/route.ts    poll status
│   └── webhook/route.ts        Enhancor completion callback (PUBLIC)
├── heygen/
│   └── generate-studio-avatar/route.ts
├── settings/
│   ├── blotato/route.ts        Blotato API key management
│   └── captions/route.ts
└── costs/route.ts              GET monthly cost summary
```

**Key conventions for `app/api/`:**

- One handler per file: `route.ts` exports `GET`, `POST`, `PATCH`, `DELETE` as named functions.
- Long-running routes set `export const maxDuration = 300;` (5 min cap on Vercel).
- Dynamic segments use `[id]` folder names; the handler signature is `(_req, { params }: { params: Promise<{ id: string }> })`.

## `components/` — React Components

```
components/
├── ui/                  shadcn primitives (button, dialog, select, tabs, ...)
│                        Style "new-york", base color "neutral" — see components.json.
├── layout/              Sidebar, Header, MobileNav (used by (protected)/layout.tsx)
├── generate/            Image-generation wizard
│                        - GenerateForm.tsx is the orchestrator
│                        - Per-axis selectors: LashStyleSelector, EthnicitySelector,
│                          SkinToneSelector, HairStyleSelector, CompositionSelector,
│                          AspectRatioSelector, ResolutionSelector,
│                          PlatformSelector, ApplicationStepSelector, AgeRangeSelector
│                        - DiversityControls, GenerationProgress, ImagePreview
│                        - ContextNoteInput, HashtagDisplay, ErrorDisplay
│                        - SaveTemplateDialog, SavedTemplatesRow
│                        - CaptionGenerator, CaptionModal, CaptionStyleSelector,
│                          CaptionVariationCard
│                        - ExportForPlatform, PublishModal
├── video/               HeyGen video wizard
│                        - PipelineSelector (HeyGen vs Seedance switch)
│                        - ScriptGenerator, ScriptVariations, ScriptLibraryPicker
│                        - AvatarSetup (1406 lines — largest file)
│                        - VoiceAndStyle, MusicSelector
│                        - GenerateVideo, VideoCard, VideoModal
│                        seedance/
│                        - SeedanceScriptStep
│                        - SeedanceAvatarStep
│                        - SeedanceGenerateStep
├── gallery/             Image gallery widgets
│                        - ImageCard, ImageModal, FavoriteButton
│                        - GalleryFilters, CaptionHistoryView, PublishingHistoryView
├── settings/            Settings panels
│                        - BrandProfileForm, LogoUploader, ProductImageUploader
│                        - ProductCategoryManager, HashtagManager
│                        - CaptionSettingsForm, BlotatoApiKeyInput
│                        - SocialAccountsManager, ConnectedAccountCard
│                        - UserManager, CostSummary
└── shared/              Cross-feature components
```

**Component conventions:**

- Default to **server components**. Only mark `"use client"` when state, effects, or browser APIs are required (e.g. `app/(protected)/video/page.tsx:1`).
- Co-locate sub-components by feature folder, not by component type.
- Pages mount a single feature-root component (e.g. `<GenerateForm />`, `<ScriptGenerator />`).
- Visual primitives come from `components/ui/`; if a primitive is missing, add it via `npx shadcn add <name>` rather than hand-rolling.

## `lib/` — Service Layer

```
lib/
├── utils.ts                       cn() + small helpers
├── types/index.ts                 Central type registry (689 lines — single source of truth)
├── supabase/
│   ├── client.ts                  Browser singleton (createBrowserClient)
│   ├── server.ts                  createClient + createAdminClient + getCurrentUserId
│   ├── middleware.ts              updateSession() — refreshes auth cookies
│   └── storage.ts                 BUCKETS + uploadGeneratedImage / uploadBrandAsset / etc.
├── gemini/
│   ├── client.ts                  Low-level @google/genai wrapper
│   ├── generate.ts                generateImage() + ReferenceImage
│   ├── composition.ts             composePersonWithProduct() (used by video pipelines)
│   └── safety.ts                  GeminiError + safety filters + RATE_LIMITED detection
├── heygen/
│   ├── client.ts                  HeyGen v2 API (upload asset, photo avatar, generate, poll)
│   ├── types.ts                   HeyGenError + request/response types
│   └── studio-avatar-prompt.ts    Studio-avatar prompt builders
├── seedance/
│   ├── client.ts                  Enhancor /queue + status polling
│   ├── types.ts                   SeedanceError + mode/aspect/duration unions
│   ├── prompt-planner.ts          generateSeedanceDirectorPrompt() (LLM-driven)
│   ├── video-prompt.ts            Static director-prompt builders
│   ├── ugc-image-prompt.ts        UGC scene + vibe prompt builders
│   ├── ugc-image-prompt.test-examples.ts   Sample inputs for development
│   └── completion.ts              completeSeedanceVideo() — webhook completion handler
├── elevenlabs/client.ts           synthesizeToAudio() + alignmentToSRT()
├── openrouter/
│   ├── client.ts                  OpenAI SDK pointed at openrouter.ai
│   └── captions.ts                generateVideoScript(), caption generation via Claude
├── cloudinary/video.ts            Video upload + CDN URL helpers
├── shotstack/client.ts            Caption-burn + video-edit pipeline
├── blotato/                       Social-publishing client
│   ├── client.ts
│   └── types.ts
├── prompts/                       Prompt engine (the heart of the image pipeline)
│   ├── compose.ts                 Master assembler (composePrompt, composeBeforeAfterPrompts)
│   ├── brand-dna.ts               Brand voice + visual tokens
│   ├── skin-realism.ts            Skin-realism DNA
│   ├── negative.ts                Negative prompts
│   ├── categories/                Per-category prompt builders
│   │   ├── lash-closeup.ts
│   │   ├── lifestyle.ts
│   │   ├── product.ts
│   │   ├── before-after.ts
│   │   └── application-process.ts
│   ├── modules/                   Reusable prompt dictionaries
│   │   ├── skin-tones.ts          Monk Skin Tone Scale
│   │   ├── hair-styles.ts
│   │   ├── lash-styles.ts
│   │   ├── scenes.ts
│   │   ├── vibes.ts
│   │   ├── compositions.ts
│   │   ├── seasonal.ts
│   │   ├── ethnicity.ts
│   │   └── age-range.ts
│   ├── scripts/                   Video-script prompts (system + user)
│   │   ├── system.ts
│   │   ├── user.ts
│   │   ├── seedance.ts            Seedance-specific variant
│   │   └── templates.ts
│   └── captions/                  Caption-prompt system + user
│       ├── system.ts
│       └── user.ts
├── diversity/tracker.ts           Records resolved skin/hair/scene/vibe → fair "random"
├── hashtags/selector.ts           Deterministic hashtag picker
├── image-processing/
│   ├── logo-overlay.ts            sharp-based logo overlay
│   └── before-after-compositor.ts sharp-based side-by-side composite
├── video/
│   ├── processor.ts
│   ├── captions.ts
│   ├── heygen-campaign.ts
│   └── insert-gallery-asset.ts    Bridges video pipelines into the gallery
├── costs/
│   ├── tracker.ts
│   └── estimates.ts
└── constants/
    ├── brand.ts
    ├── hashtags.ts
    └── posting-times.ts
```

**Layer conventions:**

- `lib/**` files **never** import from `app/**` or `components/**`. Dependencies flow strictly downward: components → app → lib → externals.
- Each external service has `client.ts` + `types.ts`. Custom error class lives in `types.ts` (Seedance/HeyGen) or alongside the client (Gemini in `safety.ts`).
- The prompt engine is the only place that owns "random" resolution semantics for diversity axes.
- `lib/types/index.ts` is the canonical type hub. Only put types in `lib/<service>/types.ts` if they are **internal** to that service (request/response shapes for an external API).

## `supabase/`

```
supabase/
├── migrations/                       Dated SQL migrations (manual; no Prisma/Drizzle)
│   ├── 20260212124344_add_product_categories.sql
│   ├── 20260307_upgrade_one_system_one.sql      hashtags, captions, scheduled_posts, social_accounts, caption_settings
│   ├── 20260321_upgrade_one_system_two.sql      video_scripts, generated_videos, voice_options, background_music
│   ├── 20260402_seed_background_music.sql
│   ├── 20260405_widen_voice_options_columns.sql
│   ├── 20260408_seedance_columns.sql            adds pipeline / seedance_task_id / seedance_prompt / audio_mode / audio_url
│   ├── 20260421_add_caption_srt.sql
│   ├── 20260421_add_script_text_cache.sql
│   ├── 20260421_make_product_image_nullable.sql
│   └── 20260429_add_video_script_pipeline.sql   adds pipeline column to video_scripts
└── .temp/                            CLI scratch directory (gitignored content)
```

Migration filename convention: `YYYYMMDD[hhmmss]_<short_description>.sql`. New migrations should follow this convention so ordering remains lexical.

## `scripts/`

CLI utilities run via `tsx` (with `dotenv` to load `.env.local`):

```
scripts/
├── seed-hashtags.ts                  Seed hashtags table from constants
├── upload-products.mjs               Upload product images to Supabase Storage
├── upload-category-images.mjs        Upload category reference images
├── migrate-product-categories.mjs    Backfill product-category schema
├── test-captions.ts                  Ad-hoc test for caption pipeline
└── test-hashtag-selector.ts          Ad-hoc test for hashtag selector
```

These are **not** the test suite (there is no Jest/Vitest). They are operational scripts.

## `Plan/`

In-tree planning notes for active features (not part of the build). Treat as scratch documentation; check before starting feature work in case there is unfinished design context.

## `public/`

```
public/
├── favicon.ico
├── brand/                Brand-related raster assets used by the UI
├── file.svg
├── globe.svg
├── next.svg
├── vercel.svg
└── window.svg
```

Tailwind doesn't process `public/`; assets are served as-is.

## `hooks/`

Currently empty. Reserved by `components.json` aliases (`@/hooks`). When adding a custom React hook used by more than one component, place it here.

## Path Aliases

`tsconfig.json` exposes a single alias: `@/* → ./*`.

So:

- `@/lib/...` → repo root `lib/...`
- `@/components/...` → repo root `components/...`
- `@/app/...` → repo root `app/...` (rare; pages should not import other pages)
- `@/hooks/...` → repo root `hooks/...`

The `components.json` `aliases` block also defines `components`, `utils`, `ui`, `lib`, `hooks` — these are consumed by the shadcn CLI when generating new primitives.

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g. `ImageCard.tsx`).
- Hooks: `useXxx.ts` (lowercase camelCase, but file name still starts with `use`).
- Pages and route handlers: lowercase (`page.tsx`, `route.ts`, `layout.tsx`) — required by Next.js App Router.
- Library modules: `kebab-case.ts` (e.g. `before-after-compositor.ts`, `studio-avatar-prompt.ts`).
- Migrations: `YYYYMMDD[hhmmss]_<snake_case_description>.sql`.

**Symbols:**
- Types and interfaces: `PascalCase`.
- Type unions / enum-like constants: `UPPER_SNAKE_CASE` arrays of objects (e.g. `IMAGE_RESOLUTION_OPTIONS`, `ASPECT_RATIO_OPTIONS`).
- Functions: `camelCase`. Service entry points are verbs (`generateImage`, `composePrompt`, `createSeedanceTask`).
- Error classes: `<Service>Error` (e.g. `GeminiError`, `HeyGenError`, `SeedanceError`).

**API routes:**
- Resources are plural (`/api/images`, `/api/videos`, `/api/hashtags`).
- Sub-resources nest (`/api/images/[id]/captions`).
- Pipeline-specific actions go under the pipeline folder (`/api/seedance/generate`, `/api/seedance/webhook`, `/api/heygen/generate-studio-avatar`).
- Webhook routes always end in `/webhook` and are added to `middleware.ts:publicPaths`.

## Where to Add New Code

| Adding... | Goes in... |
| --- | --- |
| A new selector for the image form | `components/generate/` + register in `components/generate/GenerateForm.tsx` |
| A new HeyGen wizard step | `components/video/` |
| A new Seedance wizard step | `components/video/seedance/` |
| A new external service client | `lib/<service>/{client,types}.ts` (mirror Seedance/HeyGen layout) |
| A new prompt category | `lib/prompts/categories/<name>.ts` + branch in `lib/prompts/compose.ts` |
| A new prompt-axis dictionary | `lib/prompts/modules/<name>.ts` |
| A new API resource | `app/api/<resource>/route.ts` (+ sub-routes) |
| A new long-running endpoint | Set `export const maxDuration = 300` |
| A new webhook | `app/api/<svc>/webhook/route.ts` + add to `middleware.ts:publicPaths` |
| A cross-cutting type or option array | `lib/types/index.ts` |
| A service-internal type | `lib/<service>/types.ts` |
| A schema change | `supabase/migrations/YYYYMMDD_<desc>.sql` |
| A storage bucket | Add to `BUCKETS` in `lib/supabase/storage.ts` |
| A custom React hook | `hooks/useXxx.ts` |
| A static asset | `public/...` |
| A one-off operational script | `scripts/<name>.{ts,mjs}` |
| A dev-time test runner | `scripts/test-<name>.ts` (run via `tsx`) — note: there is no formal test framework |

## Files Not to Touch Without Care

- `middleware.ts` — auth gate. Adding/removing public paths affects every route.
- `lib/supabase/server.ts` — only place that reads the service-role key.
- `lib/types/index.ts` — central type contract; downstream code assumes its unions are exhaustive.
- `lib/prompts/compose.ts` — the prompt assembly contract; changes ripple through every image generation.
- `next.config.ts` — image remote patterns; new hostnames must be allowlisted before `next/image` will load them.

---

*Structure analysis: 2026-05-01*
