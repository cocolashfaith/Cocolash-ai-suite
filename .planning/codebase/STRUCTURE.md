# Codebase Structure

**Analysis Date:** 2026-05-31

## Directory Layout

```
cocolash-ai/
├── app/                         # Next.js App Router
│   ├── (auth)/                  # Public auth pages (not protected by middleware)
│   │   └── login/page.tsx       # Login page
│   ├── (protected)/             # Protected pages (auth middleware enforces)
│   │   ├── generate/page.tsx    # Main image generation UI
│   │   ├── video/page.tsx       # Video generation UI
│   │   ├── gallery/page.tsx     # Generated images gallery
│   │   ├── video/gallery/page.tsx # Generated videos gallery
│   │   ├── favorites/page.tsx   # Saved favorite images
│   │   ├── settings/page.tsx    # User settings
│   │   ├── chatbot/admin/       # Chatbot admin panel (Phase 2+)
│   │   └── layout.tsx           # Protected layout (sidebar, header, nav)
│   ├── api/                     # API routes (40+ endpoints)
│   │   ├── generate/route.ts    # POST image generation
│   │   ├── videos/route.ts      # GET/POST video operations
│   │   ├── chat/route.ts        # POST chat (SSE stream)
│   │   ├── brand/route.ts       # GET/PUT brand profile
│   │   ├── seedance/            # Video generation via Seedance
│   │   ├── heygen/              # Avatar video via HeyGen
│   │   ├── settings/            # GET/PUT admin settings
│   │   ├── costs/route.ts       # GET monthly cost summary
│   │   ├── products/            # Product database ops
│   │   ├── shopify/             # Shopify product webhook
│   │   └── auth/route.ts        # Supabase auth callback
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx               # Root layout (fonts, metadata, providers)
│   ├── page.tsx                 # Root page (redirects to /generate)
│
├── components/                  # React components (99 components)
│   ├── ui/                      # Shadcn/Radix UI components (21 files)
│   │   ├── button.tsx, input.tsx, select.tsx, dialog.tsx, etc.
│   ├── layout/                  # App structure
│   │   ├── Sidebar.tsx          # Desktop left navigation
│   │   ├── Header.tsx           # Mobile top header
│   │   └── MobileNav.tsx        # Mobile bottom nav
│   ├── generate/                # Image generation form & controls (35+ components)
│   │   ├── GenerateForm.tsx     # Main form component
│   │   ├── CategorySelector.tsx, LashStyleSelector.tsx, etc.
│   │   ├── GenerationProgress.tsx # Loading state
│   ├── gallery/                 # Image gallery display
│   │   └── [image components]
│   ├── video/                   # Video generation & display
│   │   └── [video components]
│   ├── settings/                # Settings panel components
│   │   └── [settings components]
│   └── shared/                  # Shared utilities (minimal)
│
├── lib/                         # Business logic (112 TypeScript modules)
│   ├── types/
│   │   └── index.ts             # Central type definitions (689 lines)
│   │                             # GenerationSelections, ChatMessage, VideoType, etc.
│   ├── supabase/                # Database & auth abstraction
│   │   ├── client.ts            # Browser client
│   │   ├── server.ts            # Server client
│   │   ├── middleware.ts        # Auth token refresh
│   │   └── storage.ts           # File upload helpers
│   ├── chat/                    # Chatbot pipeline (27 files)
│   │   ├── db.ts                # Session, message, settings persistence
│   │   ├── retrieve.ts          # RAG vector search + chunk retrieval
│   │   ├── intent.ts            # Intent classification (Claude)
│   │   ├── voice.ts             # System prompt composition + voice fragments
│   │   ├── voice-rules.ts       # Non-negotiable rules engine
│   │   ├── product-context.ts   # Product reference injection
│   │   ├── discount.ts          # Discount selection logic
│   │   ├── embeddings.ts        # Query embedding via OpenAI
│   │   ├── tryon.ts             # Try-on image references
│   │   ├── rate-limit.ts        # Message rate limiter
│   │   ├── hours.ts             # Business hours helper
│   │   ├── error.ts             # ChatError class
│   │   ├── preflight.ts         # Pre-request checks
│   │   ├── types.ts             # Chat-local types (KnowledgeChunk, VoiceFragments, etc.)
│   │   └── eval/                # Evaluation & testing utilities
│   ├── gemini/                  # Google Gemini image generation
│   │   ├── generate.ts          # generateImage() entry point
│   │   ├── safety.ts            # Safety filter, GeminiError
│   │   ├── composition.ts       # Multi-model inference for composition
│   │   └── client.ts            # SDK initialization
│   ├── seedance/                # Seedance video generation
│   │   ├── client.ts            # API client + task creation
│   │   ├── prompt-planner.ts    # generateSeedanceDirectorPrompt()
│   │   ├── video-prompt.ts      # Video-specific prompts
│   │   ├── ugc-image-prompt.ts  # UGC image-to-video prompts
│   │   ├── completion.ts        # Prompt completion logic
│   │   ├── mode-allowlist.ts    # Mode validation per generation type
│   │   └── types.ts             # Seedance types (SeedanceTask, mode, duration, etc.)
│   ├── heygen/                  # HeyGen avatar video generation
│   │   ├── client.ts            # API client + task creation
│   │   └── campaign.ts          # Campaign management
│   ├── openrouter/              # OpenRouter LLM API (chat + captions)
│   │   ├── chat.ts              # streamChat() for Claude Sonnet 4.6
│   │   └── captions.ts          # Caption generation
│   ├── brand/                   # Brand profile management
│   │   ├── product-truth.ts     # Product reference resolver + category mapping
│   │   └── get-product-references.ts # Helper to load product data
│   ├── shopify/                 # Shopify integration
│   │   ├── client.ts            # GraphQL API calls
│   │   ├── products.ts          # Product queries
│   │   └── types.ts             # Product types
│   ├── prompts/                 # Prompt templates & composition
│   │   ├── compose.ts           # composePrompt() main entry
│   │   ├── brand-dna.ts         # Brand DNA master prompt
│   │   ├── negative.ts          # Negative prompt library
│   │   ├── skin-realism.ts      # Skin texture prompts
│   │   ├── modules/             # Prompt fragment modules (categories, scenes, etc.)
│   │   ├── captions/            # Caption prompt templates
│   │   ├── categories/          # Category-specific prompts
│   │   └── scripts/             # Script/voiceover prompt templates
│   ├── image-processing/        # Image post-processing
│   │   ├── logo-overlay.ts      # Logo application + positioning
│   │   └── before-after-compositor.ts # Before/after composite generation
│   ├── diversity/               # Diversity tracking & rotation
│   │   └── tracker.ts           # getRecentDiversityUsage(), recordDiversitySelection()
│   ├── costs/                   # Cost tracking
│   │   └── tracker.ts           # recordCostEvent(), getMonthlyCostSummary()
│   ├── video/                   # Video post-processing
│   │   ├── processor.ts         # Video frame extraction, captions, etc.
│   │   ├── heygen-campaign.ts   # HeyGen campaign creation
│   │   ├── captions.ts          # Caption application
│   │   └── insert-gallery-asset.ts # Persist to gallery
│   ├── cloudinary/              # Cloudinary image hosting
│   │   └── [cloudinary client]
│   ├── elevenlabs/              # ElevenLabs voice generation (if used)
│   │   └── [voice client]
│   ├── ai/                      # General AI utilities
│   │   └── [AI helpers]
│   ├── blotato/                 # Blotato API integration (settings)
│   │   └── client.ts            # API client
│   ├── hashtags/                # Hashtag generation
│   │   └── selector.ts          # selectHashtags()
│   ├── constants/               # App constants
│   │   ├── brand/               # Brand colors, tone keywords
│   │   └── [other constants]
│   ├── log.ts                   # Structured JSON logger
│   └── utils.ts                 # Misc utilities (minimal)
│
├── hooks/                       # Custom React hooks
│   └── [currently empty, add hooks here]
│
├── middleware.ts                # Auth & session middleware
│
├── public/                      # Static assets
│   ├── brand/                   # Brand logos, assets
│   ├── widget/                  # Widget files
│   └── favicon.ico
│
├── supabase/                    # Database migrations & config
│   ├── migrations/              # SQL migration files (date-named)
│   └── .temp/                   # Temporary schema files
│
├── tests/                       # Test suites & fixtures
│   ├── brand/                   # Brand module tests
│   ├── seedance-payloads/       # Seedance test data
│   └── seedance-director/       # Director prompt tests
│
├── scripts/                     # One-off scripts
│   ├── chat-eval.ts             # Chat evaluation runner
│   └── [other scripts]
│
├── extensions/                  # Browser extensions & third-party integrations
│   └── cocolash-chat-block/     # Custom chat block for website
│
├── widget/                      # Embedded widget (separate build)
│   ├── src/                     # Widget source code (React)
│   ├── package.json             # Widget dependencies
│   └── scripts/                 # Widget build scripts
│
├── .claude/                     # Project-level Claude settings
│   ├── agents/                  # Custom agents
│   ├── commands/                # Custom commands
│   ├── hooks/                   # Project hooks (pre/post)
│   └── get-shit-done/           # GSD phase framework
│
├── .planning/                   # Planning & documentation
│   ├── codebase/                # Codebase analysis (you are reading from here)
│   ├── phases/                  # Phase plans & reviews
│   ├── research/                # Research docs
│   └── todos/                   # TODO tracking
│
├── package.json                 # Main app dependencies
├── tsconfig.json                # TypeScript config
├── vitest.config.ts             # Vitest config (unit tests)
├── next.config.ts               # Next.js config (image remotes, etc.)
├── eslint.config.mjs            # ESLint rules
├── tailwind.config.ts           # Tailwind CSS config (via @tailwindcss/postcss)
├── postcss.config.mjs           # PostCSS config
└── vercel.json                  # Vercel deployment config (Fluid Compute, functions, etc.)
```

## Directory Purposes

**`app/`** (Next.js App Router)
- Purpose: Page routes and API endpoints; entry point for all HTTP traffic
- Contains: `.tsx` pages, `.ts` route handlers using Next.js runtime
- Key files: `app/layout.tsx` (root), `middleware.ts` (auth), API routes

**`components/`** (140 React components)
- Purpose: Reusable React components for pages and layouts
- Contains: UI primitives (shadcn/Radix), feature-specific components (generate, gallery, video, settings)
- Pattern: Each component is a `.tsx` file with typed props, no state lifted outside app/

**`lib/`** (Business logic, 112 modules)
- Purpose: Service classes, integrations, data access, shared utilities
- Contains: Domain-organized subdirectories (chat, video, brand, etc.)
- Pattern: Each service is a leaf module; no cross-service imports; all exports are functions or types

**`lib/types/index.ts`** (689 lines)
- Purpose: Central type definitions shared across the entire codebase
- Contains: `GenerationSelections`, `ChatMessage`, `BrandProfile`, `GeneratedVideo`, etc.
- Pattern: Types are inferred from database schemas and API contracts

**`supabase/`** (Database)
- Purpose: Database schema and migrations
- Contains: SQL migration files (date-named), schema definition
- Pattern: One migration per feature/change; migrations are idempotent

**`tests/`** (Test suites)
- Purpose: Unit tests, integration tests, test fixtures
- Location: `lib/**/*.test.ts` (co-located) or `tests/` (grouped)
- Pattern: Vitest runner; no E2E tests yet (Playwright available)

**`public/`** (Static assets)
- Purpose: Served directly by Next.js (no processing)
- Contains: Brand logos, widget assets, favicon
- Pattern: Images optimized externally; only reference from Image component with remote patterns

**`widget/`** (Embedded chat widget)
- Purpose: Standalone React app injected into customer websites
- Contains: React source, separate build pipeline
- Pattern: Built separately via `npm run build:widget`; outputs `dist/widget.js`

## Key File Locations

**Entry Points:**
- `app/layout.tsx` — Root layout (fonts, metadata, theme)
- `app/(protected)/layout.tsx` — Protected layout (sidebar, header, footer)
- `app/page.tsx` — Root page (redirect to `/generate`)
- `middleware.ts` — Auth middleware (runs on every request)

**Configuration:**
- `package.json` — Dependencies, scripts, version
- `tsconfig.json` — TypeScript strict mode, paths aliases (`@/`)
- `next.config.ts` — Image remote patterns, redirects
- `vitest.config.ts` — Test runner config
- `tailwind.config.ts` — CSS utility config
- `vercel.json` — Deployment config (maxDuration, functions)

**Core Logic:**
- `lib/types/index.ts` — Central types (689 lines)
- `lib/supabase/server.ts` — Server client initialization
- `app/api/generate/route.ts` — Image generation pipeline
- `app/api/chat/route.ts` — Chat endpoint (SSE stream)
- `app/api/seedance/generate/route.ts` — Video generation orchestration

**Testing:**
- `lib/**/*.test.ts` — Co-located unit tests
- `tests/` — Integration tests, fixtures, test data
- `vitest.config.ts` — Test configuration

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g., `GenerateForm.tsx`, `CategorySelector.tsx`)
- Utilities/services: `camelCase.ts` (e.g., `product-truth.ts`, `retrieve.ts`)
- Tests: `[name].test.ts` or `[name].spec.ts` (e.g., `intent.test.ts`)
- Config: `snake_case.json` or `camelCase.config.*` (e.g., `eslint.config.mjs`)

**Directories:**
- Feature modules: `kebab-case/` (e.g., `lib/image-processing/`, `lib/chat/`)
- Page routes: `(group-name)/` or `[dynamic]/` (Next.js conventions)
- Components by feature: `components/[feature]/` (e.g., `components/generate/`, `components/gallery/`)

**Types & Interfaces:**
- Type names: `PascalCase` (e.g., `GenerationSelections`, `ChatMessage`, `BrandProfile`)
- Type files: `index.ts` (main) or `[domain].types.ts` (local)
- Union types: `PascalCase` with explicit values (e.g., `type Composition = "solo" | "duo" | "group"`)

**Functions & Variables:**
- Functions: `camelCase` (e.g., `composePrompt()`, `generateImage()`, `classifyIntent()`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `VALID_CATEGORIES`, `DEFAULT_VOICE_FRAGMENTS`)
- Hooks: `useX` (e.g., `useGenerationForm()`, `useChatMessages()`)

## Where to Add New Code

**New Feature (e.g., image editing, discount codes):**
- API endpoint: `app/api/[feature]/route.ts`
- Business logic: `lib/[feature]/` (create directory with helper files)
- Components: `components/[feature]/` (create directory with feature components)
- Types: Add to `lib/types/index.ts` if shared, else `lib/[feature]/types.ts`
- Tests: Co-locate as `lib/[feature]/*.test.ts`

**New Component/Module:**
- React component: `components/[feature]/ComponentName.tsx` with typed props
- Service/utility: `lib/[service]/[function].ts` with explicit return types
- Both: Export from barrel file (`index.ts`) if multiple related files

**Utilities & Helpers:**
- Shared utilities: `lib/utils.ts` (currently minimal; prefer domain-specific files)
- Format/transform helpers: `lib/[domain]/[function].ts` (e.g., `lib/prompts/compose.ts`)
- Constants: `lib/constants/[domain].ts` (e.g., `lib/constants/brand.ts`)

## Special Directories

**`.claude/`** (Project configuration)
- Purpose: Local Claude settings, agents, custom commands, hooks
- Generated: Yes (by claude-in-claude)
- Committed: Yes
- Note: Overrides global `~/.claude/` settings for this project

**`.planning/`** (Documentation & planning)
- Purpose: Codebase analysis, phase plans, research, TODOs
- Generated: Yes (by orchestrators and planning agents)
- Committed: Yes
- Note: Human-readable; used as context for `/gsd-*` commands

**`supabase/.temp/`** (Database temp files)
- Purpose: Temporary schema diffs during local development
- Generated: Yes (by `supabase` CLI)
- Committed: No (in `.gitignore`)

**`widget/`** (Separate build)
- Purpose: Standalone chat widget for customer websites
- Generated: Yes (npm build process)
- Committed: `src/` only; `dist/` is gitignored
- Note: Built via `npm run build:widget` before main build

---

*Structure analysis: 2026-05-31*
