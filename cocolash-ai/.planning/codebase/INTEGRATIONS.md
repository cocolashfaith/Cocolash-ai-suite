# External Integrations

**Analysis Date:** 2026-05-01

## APIs & External Services

### AI Image Generation
- **Google Gemini** - AI image generation for product mockups
  - SDK/Client: `@google/genai` (1.40.0)
  - Auth: `GEMINI_API_KEY` environment variable
  - Client: `lib/gemini/client.ts` (singleton pattern, 180-second timeout for 4K images)
  - Usage: `lib/gemini/generate.ts`, `lib/gemini/composition.ts`, `lib/gemini/safety.ts`

### AI Video Generation
- **HeyGen** - AI avatar video generation with photo avatars
  - SDK/Client: Custom HTTP wrapper in `lib/heygen/client.ts`
  - Auth: `HEYGEN_API_KEY` header (x-api-key)
  - API Base: https://api.heygen.com (v2 endpoints) + https://upload.heygen.com (asset uploads)
  - Features: Photo avatar group creation, video generation with Avatar IV engine, voice selection
  - Status polling: Supports v1 endpoints for backward compatibility
  - Recent completion: "Heygen Pipeline complete" (commit d299cd7)
  - Implementation: `lib/heygen/client.ts`, `lib/heygen/types.ts`, `lib/heygen/studio-avatar-prompt.ts`
  - Network resilience: Automatic retry on 500/502/503/504 with exponential backoff, handles transient errors (ECONNRESET, ETIMEDOUT, etc.)

- **Seedance 2.0 (Enhancor.ai)** - Full-access UGC video generation
  - SDK/Client: Custom HTTP wrapper in `lib/seedance/client.ts`
  - Auth: `ENHANCOR_API_KEY` header (x-api-key)
  - API Base: https://apireq.enhancor.ai/api/enhancor-ugc-full-access/v1 (configurable via `ENHANCOR_API_BASE_URL`)
  - Webhook: POST `/api/seedance/webhook` receives completion/failure callbacks (request_id for idempotency)
  - Features: Queue video requests, poll status, webhook callbacks for long-running jobs
  - Recent completion: "Seedance Pipeline Tested" (commit 6ae2f1c)
  - Implementation: `lib/seedance/client.ts`, `lib/seedance/types.ts`, `lib/seedance/completion.ts`, `lib/seedance/prompt-planner.ts`
  - Legacy predecessor: Kie.ai (kept in `.env.example` for rollback context only)

### Text-to-Speech
- **ElevenLabs** - AI voice synthesis with character-level timing
  - SDK/Client: Custom HTTP wrapper in `lib/elevenlabs/client.ts`
  - Auth: `ELEVENLABS_API_KEY` header (xi-api-key)
  - API Base: https://api.elevenlabs.io/v1
  - Features: 10,000+ shared voices with filtering (gender, age, accent, use_case), text-to-speech with timestamps for caption syncing
  - Chunking: Automatic sentence splitting for texts >4500 characters
  - Alignment: Returns character-level timing for precise SRT generation
  - Implementation: `lib/elevenlabs/client.ts`, `lib/video/captions.ts`

### AI LLM (Claude via OpenRouter)
- **OpenRouter** - OpenAI-compatible API gateway for Claude 3.5 Sonnet
  - SDK/Client: OpenAI SDK with OpenRouter baseURL in `lib/openrouter/client.ts`
  - Auth: `OPENROUTER_API_KEY` environment variable
  - API Base: https://openrouter.ai/api/v1 (OpenAI-compatible)
  - Features: Caption generation, prompt planning, cross-platform social publishing
  - Network resilience: Retry with exponential backoff (5 retries default) on 429/500/502/503/504 and transient errors
  - Implementation: `lib/openrouter/client.ts`, `lib/openrouter/captions.ts`

### Image Processing
- **Replicate** - Nano Banana Pro for image composition
  - SDK/Client: `replicate` (1.4.0)
  - Auth: `REPLICATE_API_TOKEN` environment variable
  - Purpose: Image composition and processing workflows
  - Implementation: Part of image pipeline; exact usage in `lib/image-processing/`

### Video Hosting & Processing
- **Cloudinary** - Video upload, transformation, and delivery
  - SDK/Client: `cloudinary` (2.9.0) JavaScript SDK
  - Auth: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` environment variables
  - Features: Video upload (from URL or buffer), eager transformations (mp4/webm), watermarking (text + logo), caption overlay, SRT subtitle upload, thumbnail generation
  - CDN: Images served from res.cloudinary.com (whitelisted in `next.config.ts`)
  - Implementation: `lib/cloudinary/video.ts` (singleton pattern)
  - Folder: Videos stored in `cocolash-videos` folder with tags `['cocolash', 'ugc']`

### Caption Rendering
- **Shotstack** - Server-side caption burning onto videos
  - SDK/Client: Custom HTTP wrapper in `lib/shotstack/client.ts`
  - Auth: `SHOTSTACK_API_KEY` header (x-api-key)
  - API Base: https://api.shotstack.io/edit/{stage|v1}
  - Environment: `SHOTSTACK_ENV` (default: "stage" for sandbox; "v1" for production)
  - Features: Rich captions with pop animation, active word highlighting (#FFFFFF white / #ce9765 golden brown), font rendering (Montserrat ExtraBold 72px)
  - Design: Cloudinary-free — no remote dependencies, suitable for Vercel deployment
  - Implementation: `lib/shotstack/client.ts`, full pipeline in `lib/video/captions.ts`
  - Retry: Transient network error retry with up to 4 attempts
  - Output quality: Medium (8 Mbps VBR, ~60 MB per 60-second 1080x1920 clip for Cloudinary compatibility)

## Data Storage

**Databases:**
- PostgreSQL (via Supabase)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser), `SUPABASE_SERVICE_ROLE_KEY` (server)
  - Client: `@supabase/supabase-js` (2.95.3) with `@supabase/ssr` (0.8.0) for middleware support
  - Schema management: Migrations in `supabase/migrations/` (12 files as of 2026-05-01)
  - Key tables: `generated_videos` (tracks video generation pipeline status), others in migrations

**File Storage:**
- Supabase Storage (PostgreSQL-backed object storage)
  - Used for project/user data persistence
  - Accessible via Supabase client at `NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/public/**` (whitelisted in `next.config.ts`)

**Caching:**
- None detected (no Redis, Memcached configuration)
- Reliant on browser cache and CDN (Cloudinary for videos, Supabase CDN for storage)

## Authentication & Identity

**Auth Provider:**
- Dual authentication system (middleware.ts):
  1. **Supabase Auth** - Email/password OAuth-capable (M3 upgrade)
     - Credentials: Browser client (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) + Server role key (`SUPABASE_SERVICE_ROLE_KEY`)
     - Session management: `@supabase/ssr` middleware auto-refresh on every request
     - Implementation: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`
  2. **Legacy Cookie Auth** - Password-based with `cocolash-auth` cookie
     - Verification: `AUTH_TOKEN` environment variable
     - Fallback: Keeps M1-M2 password login functional during transition to Supabase Auth
     - Both methods considered valid (OR logic in middleware)

**Session Persistence:**
- Supabase session tokens stored in browser and refreshed via server middleware
- Legacy auth via signed cookie (stateless)

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry, Rollbar, etc.)
- Manual logging via `console.log`/`console.warn`/`console.error` throughout codebase

**Logs:**
- Console output (development) with namespace prefixes like `[HeyGen]`, `[shotstack]`, `[seedance]`, `[openrouter]`
- No centralized logging infrastructure configured
- Structured: Some API calls log request details (video URL prefix truncation for privacy)

## CI/CD & Deployment

**Hosting:**
- Vercel (inferred from `vercel.json` presence, `next.config.ts` image optimization, environment variable pattern)

**CI Pipeline:**
- Not detected in git (no `.github/workflows/`, `.gitlab-ci.yml`, etc.)
- Vercel auto-builds on git push to main

**Build/Deploy:**
- Scripts in `package.json`:
  - `npm run dev` - Next.js dev server
  - `npm run build` - Next.js production build
  - `npm run start` - Production server start
  - `npm run lint` - ESLint check

## Environment Configuration

**Required env vars** (from `.env.example`):

**Core Authentication:**
- `GEMINI_API_KEY` - Google Gemini image generation
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase browser key (public)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key (server-side only)
- `AUTH_PASSWORD`, `AUTH_TOKEN` - Legacy password-based auth

**AI Video & Voice:**
- `HEYGEN_API_KEY` - HeyGen avatar video generation
- `ELEVENLABS_API_KEY` - ElevenLabs text-to-speech
- `OPENROUTER_API_KEY` - OpenRouter for Claude models

**Seedance 2.0:**
- `ENHANCOR_API_KEY` - Enhancor.ai Seedance full-access endpoint
- `ENHANCOR_API_BASE_URL` (optional) - Override default Enhancor endpoint
- `ENHANCOR_WEBHOOK_URL` (optional) - Custom webhook URL (defaults to `{NEXT_PUBLIC_APP_URL}/api/seedance/webhook`)
- `ENHANCOR_WEBHOOK_SECRET` (optional) - Webhook token for signature verification

**Social Publishing:**
- `BLOTATO_API_KEY` - Blotato for cross-platform social posting
- `REPLICATE_API_TOKEN` - Replicate for image composition

**Video & Captions:**
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` - Cloudinary video hosting
- `SHOTSTACK_API_KEY` - Shotstack caption rendering
- `SHOTSTACK_ENV` (optional) - "stage" or "v1" (defaults to "stage")

**App Configuration:**
- `NEXT_PUBLIC_APP_URL` - Public app URL (used in OpenRouter headers, webhook callbacks)

**Secrets location:**
- Development: `.env.local` (never committed, listed in `.gitignore`)
- Production: Vercel dashboard → Project Settings → Environment Variables
- Sensitive files forbidden: No `.npmrc`, `.pypirc`, or hardcoded credentials in repo

## Webhooks & Callbacks

**Incoming:**
- `POST /api/seedance/webhook` - Enhancor.ai Seedance completion/failure callbacks
  - Payload: `request_id`, `status` ("completed" / "failed"), video URL, etc.
  - Idempotency: request_id treated as dedup key (Enhancor may retry multiple times)
  - Signature verification: Optional `ENHANCOR_WEBHOOK_SECRET` for HMAC validation
  - Handler: `lib/seedance/completion.ts` (updates video status in DB, triggers next pipeline step)
  - Authorized: Webhook endpoint not protected by auth middleware (public)

**Outgoing:**
- Social media post scheduling/publishing via Blotato (asynchronous, not webhooks)
- HeyGen video status polling (pull model, not push via webhooks)

---

*Integration audit: 2026-05-01*
