# External Integrations

**Analysis Date:** 2026-05-31

## APIs & External Services

**Image Generation:**
- Google Gemini - AI image generation for product photos and backgrounds
  - SDK: @google/genai 1.40.0
  - Client: `lib/gemini/client.ts` (singleton GoogleGenAI)
  - Auth: `GEMINI_API_KEY` (environment variable)
  - Models: gemini-3-pro-image-preview
  - Supported aspect ratios: 1:1, 4:5, 9:16, 16:9

**AI/LLM Services:**
- OpenRouter (Claude Sonnet 4.6) - Text generation, chat completions, embeddings for chatbot
  - SDK: openai 6.27.0 (OpenAI-compatible interface)
  - Client: `lib/openrouter/client.ts` (singleton)
  - Auth: `OPENROUTER_API_KEY`
  - Endpoints: https://openrouter.ai/api/v1
  - Features: Streaming chat via `/api/chat`, embeddings via text-embedding-3-small
  - Retry logic: Exponential backoff on 429/500/502/503/504, transient network errors
  - Ref: `app/api/chat/route.ts`

**Video Generation & Processing:**
- HeyGen (AI Avatar) - Photo avatar creation and video generation
  - SDK: Custom client (`lib/heygen/client.ts`)
  - Auth: `HEYGEN_API_KEY` (x-api-key header)
  - API Base: https://api.heygen.com, https://upload.heygen.com
  - Flow: uploadAsset() → createPhotoAvatarGroup() → generateVideo() → getVideoStatus()
  - Retry: withRetry on 500/502/503/504 + transient network errors (3 retries)
  - Webhook: None; status polling-based

- Seedance 2.0 (via Enhancor.ai Full Access) - UGC video generation
  - SDK: Custom client (`lib/seedance/client.ts`)
  - Auth: `ENHANCOR_API_KEY` (x-api-key header)
  - API Base: https://apireq.enhancor.ai/api/enhancor-ugc-full-access/v1 (configurable via `ENHANCOR_API_BASE_URL`)
  - Flow: createSeedanceTask() → webhook callback on completion → completeSeedanceVideo()
  - Webhook: POST /api/seedance/webhook, authenticated via `ENHANCOR_WEBHOOK_SECRET` (timing-safe comparison)
  - Payload: request_id, status (COMPLETED/FAILED), result (video URL), thumbnail
  - Ref: `lib/seedance/client.ts`, `app/api/seedance/webhook/route.ts`

- Replicate (Nano Banana Pro) - Image composition/processing
  - SDK: replicate 1.4.0
  - Auth: `REPLICATE_API_TOKEN`
  - Used for background + product image composition before video generation
  - Ref: `lib/video/processor.ts`

- Shotstack - Server-side caption rendering
  - SDK: Custom client (`lib/shotstack/client.ts`)
  - Auth: `SHOTSTACK_API_KEY`
  - API Base: https://api.shotstack.io/edit/{stage|v1}
  - Features: Rich caption burning using Montserrat font, pop animation per word, SRT-based timing
  - Async rendering via polling
  - Ref: `lib/shotstack/client.ts`

**Video Hosting & CDN:**
- Cloudinary - Video upload, transformations (watermark, caption overlays), thumbnail generation
  - SDK: cloudinary 2.9.0
  - Auth: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - Features: URL-based transformations, eager format conversion (mp4/webm), SRT caption upload
  - Folder: cocolash-videos
  - Transformations: watermark text/logo, captions via SRT, quality auto, format conversion
  - Ref: `lib/cloudinary/video.ts`

**Audio & Voice:**
- ElevenLabs - Text-to-speech voice synthesis
  - SDK: Custom client (`lib/elevenlabs/client.ts`)
  - Auth: `ELEVENLABS_API_KEY` (xi-api-key header)
  - API Base: https://api.elevenlabs.io/v1
  - Features: Voice library search (/shared-voices), text-to-speech with character alignment, multi-chunk synthesis
  - Output: MP3 base64 with character-level timing for SRT caption generation
  - Ref: `lib/elevenlabs/client.ts`, `lib/elevenlabs/client.ts` (alignmentToSRT)

**Social Media & Publishing:**
- Blotato - Cross-platform social media publishing
  - SDK: Custom client (`lib/blotato/client.ts`)
  - Auth: `BLOTATO_API_KEY` (blotato-api-key header)
  - API Base: https://backend.blotato.com/v2
  - Features: publishPost(), schedulePost(), uploadMedia(), getAccounts(), getSubAccounts()
  - Platforms: Instagram, TikTok, YouTube, Facebook (detected via accountId/pageId)
  - Retry: 429 rate-limit handling with 2s delay
  - Ref: `lib/blotato/client.ts`, `app/api/publish/route.ts`

**E-commerce:**
- Shopify Storefront API - Product data and cart management
  - SDK: Custom client (`lib/shopify/storefront.ts`)
  - Auth: Auto-detect private (shpat_) or public token via header selection
  - API Base: https://{SHOPIFY_STORE_DOMAIN}/api/{SHOPIFY_STOREFRONT_API_VERSION}/graphql.json
  - Features: searchProducts(), getProductByHandle(), getProductsByHandles(), cartPermalink()
  - Caching: In-memory LRU (50 items, 15min TTL) with fallback on 429
  - Queries: Product details (title, description, price range, availability, variants)
  - Ref: `lib/shopify/storefront.ts`

## Data Storage

**Databases:**
- Supabase PostgreSQL
  - Connection: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client)
  - Client: @supabase/supabase-js 2.95.3 (browser), @supabase/ssr 0.8.0 (server-side)
  - Auth: Supabase built-in (password-based in early phases)
  - Tables: generated_videos, chat_sessions, chat_messages, gallery_assets, brand_settings, cost_tracking, etc.
  - Ref: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (admin), `lib/supabase/middleware.ts` (SSR)

**File Storage:**
- Supabase Storage - Video thumbnails, generated assets
  - Access: https://{SUPABASE_URL}/storage/v1/object/public/
  - Used in: `next.config.ts` remotePatterns, dashboard galleries
- Cloudinary - Primary video hosting (uploads from HeyGen, Seedance, Replicate)
  - Access: https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/...
  - Transformations applied at URL generation time

**Caching:**
- In-process LRU caches:
  - Shopify product cache (50 items, 15min, `lib/shopify/storefront.ts`)
  - No external Redis/Memcached

## Authentication & Identity

**Auth Provider:**
- Custom password-based (M1-M2 phase)
  - Env: `AUTH_PASSWORD`, `AUTH_TOKEN`
  - Approach: Simple token validation in `lib/chat/admin-auth.ts`

**Supabase Auth (Phase 4+):**
- Password authentication via Supabase built-in auth
- Session management via JWT tokens in cookies (SSR middleware)
- Ref: `lib/supabase/middleware.ts`

## Monitoring & Observability

**Error Tracking:**
- Not detected — no Sentry/Rollbar integration

**Logs:**
- console.log/console.warn/console.error throughout codebase
- Examples: `[gemini]`, `[openrouter]`, `[seedance]`, `[shotstack]`, `[heygen]` prefixes in logs
- Ref: `lib/log.ts` for centralized logging patterns

**Cost Tracking:**
- In-process accounting via `lib/costs/tracker.ts`
- Daily cap enforcement per store: `CHATBOT_DAILY_CAP_USD_DEFAULT` (default $50)
- Ref: `lib/costs/tracker.ts`, `app/api/costs/route.ts`

## CI/CD & Deployment

**Hosting:**
- Vercel (inferred from Next.js 16, SSR structure)
- Serverless functions for API routes
- Vercel KV or similar for session state (not explicitly configured in stack)

**CI Pipeline:**
- Not detected — no GitHub Actions/GitLab CI config found in repo

## Environment Configuration

**Required env vars (from `.env.example`):**
- `GEMINI_API_KEY` - Google Gemini API key
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key (public)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role (server-only)
- `OPENROUTER_API_KEY` - OpenRouter API key for Claude
- `HEYGEN_API_KEY` - HeyGen API key
- `REPLICATE_API_TOKEN` - Replicate API token
- `CLOUDINARY_CLOUD_NAME` - Cloudinary account name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `ELEVENLABS_API_KEY` - ElevenLabs API key
- `ENHANCOR_API_KEY` - Enhancor/Seedance API key
- `SHOTSTACK_API_KEY` - Shotstack API key
- `SHOTSTACK_ENV` - Shotstack environment (stage|v1, default: stage)
- `BLOTATO_API_KEY` - Blotato API key
- `SHOPIFY_STORE_DOMAIN` - Shopify store domain (e.g., cocolash.myshopify.com)
- `SHOPIFY_STOREFRONT_API_TOKEN` - Shopify Storefront API token (private or public)
- `SHOPIFY_STOREFRONT_API_VERSION` - Shopify API version (e.g., 2025-01)
- `ELEVENLABS_API_KEY` - ElevenLabs API key for TTS
- `RESEND_API_KEY` - Resend email service API key (optional, logs to stdout if unset)
- `LEAD_EMAIL_FROM` - Email sender address for lead notifications
- `LEAD_EMAIL_DRY_RUN` - Boolean (log emails instead of sending)

**Secrets location:**
- `.env.local` (not committed, git-ignored)
- Vercel environment secrets (production)

## Webhooks & Callbacks

**Incoming:**
- POST /api/seedance/webhook - Enhancor Seedance video completion callback
  - Auth: `ENHANCOR_WEBHOOK_SECRET` (timing-safe comparison via x-webhook-secret header or ?token query param)
  - Idempotency: request_id deduplication
  - Payload: request_id, status (COMPLETED/FAILED), result (video URL), thumbnail
  - Ref: `app/api/seedance/webhook/route.ts`

**Outgoing:**
- POST {ENHANCOR_WEBHOOK_URL} - Seedance task completion notification
  - Configured via `ENHANCOR_WEBHOOK_URL` env (defaults to {NEXT_PUBLIC_APP_URL}/api/seedance/webhook)
  - Ref: `lib/seedance/client.ts` (buildEnhancorQueueRequest)

## Real-time & Subscriptions

**Supabase Real-time:**
- Not explicitly detected in codebase — typical use for chat_messages table updates
- Client: @supabase/supabase-js subscription methods available

---

*Integration audit: 2026-05-31*
