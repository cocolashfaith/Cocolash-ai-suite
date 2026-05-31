# Technology Stack

**Analysis Date:** 2026-05-31

## Languages

**Primary:**
- TypeScript 5 - Full application codebase, including Next.js app, API routes, libraries, and tests
- JavaScript - Build configuration files (ESLint, PostCSS, Next.js config)

**Secondary:**
- SQL - Supabase PostgreSQL queries for data persistence

## Runtime

**Environment:**
- Node.js (via Next.js 16.1.6)
- Browser (React 19.2.3 runtime)

**Package Manager:**
- npm
- Lockfile: package-lock.json (present)

## Frameworks

**Core:**
- Next.js 16.1.6 - Full-stack web application framework
- React 19.2.3 - UI library for client components and interactive features
- Zod 4.4.2 - Runtime schema validation for API requests and form inputs

**Styling & UI:**
- TailwindCSS 4 - Utility-first CSS framework
- Radix UI 1.4.3 - Accessible component primitives
- Lucide React 0.563.0 - SVG icon library
- Sonner 2.0.7 - Toast notifications
- Class Variance Authority 0.7.1 - Composable component variants

**Testing:**
- Vitest 2.1.8 - Unit and integration test runner
- Sharp 0.34.5 - Image processing library (included for build-time image optimization)

**Build/Dev:**
- TypeScript 5 - Type checking
- ESLint 9 - Code linting
- ESLint Config Next 16.1.6 - Next.js-specific lint rules
- PostCSS 4 - CSS transformation (via @tailwindcss/postcss)
- Shadcn 3.8.4 - Component library CLI for scaffolding
- TSX 4.21.0 - TypeScript execution tool for server scripts

## Key Dependencies

**Critical:**
- @supabase/supabase-js 2.95.3 - Browser Supabase client for auth, real-time subscriptions, and storage
- @supabase/ssr 0.8.0 - Server-side Supabase integration with SSR middleware
- openai 6.27.0 - OpenRouter API client (Claude Sonnet 4.6, text embeddings via OpenAI-compatible interface)
- @google/genai 1.40.0 - Google Gemini API client for image generation

**AI & LLM:**
- openai 6.27.0 - OpenAI SDK configured to hit OpenRouter (Claude, embeddings)
- replicate 1.4.0 - Replicate API client for Nano Banana Pro image composition
- @google/genai 1.40.0 - Gemini image generation API

**Video & Media:**
- cloudinary 2.9.0 - Cloudinary SDK for video upload, watermarking, thumbnail generation, caption burning
- replicate 1.4.0 - AI image composition and processing
- sharp 0.34.5 - High-performance image processing

**Social & Publishing:**
- blotato - Integrated via custom client (`lib/blotato/client.ts`) for cross-platform publishing

**Utilities:**
- uuid 13.0.0 - UUID generation for request/session IDs
- clsx 2.1.1 - Conditional className concatenation
- tailwind-merge 3.4.0 - Tailwind class conflict resolution
- dotenv 17.3.1 - Environment variable loading (dev)
- next-themes 0.4.6 - Dark/light theme support

**Database:**
- pg 8.20.0 - PostgreSQL client (included for server scripts, unused in runtime)

## Configuration

**Environment:**
- Configured via environment variables (`.env.local`)
- No build-time secrets required — all APIs use runtime environment variables
- See `lib/supabase/`, `lib/gemini/client.ts`, `lib/openrouter/client.ts` for singleton client patterns

**Build:**
- `next.config.ts` - Next.js build config with image remotePatterns for Supabase, Cloudinary, HeyGen
- `tsconfig.json` - TypeScript compiler options, path aliases (`@/*` → root)
- `eslint.config.mjs` - ESLint flat config (v9) with Next.js core-web-vitals and TypeScript rules
- `postcss.config.mjs` - PostCSS with Tailwind CSS 4 plugin

## Platform Requirements

**Development:**
- Node.js 20+ (inferred from @types/node@20)
- npm 10+ (for package management)

**Production:**
- Vercel (inferred from Next.js 16 structure, Supabase SSR integration, serverless functions)
- Node.js 20+ runtime

**Key Environment Variables (see `.env.example` for full list):**
- `GEMINI_API_KEY` - Google Gemini image generation
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase browser auth
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase server-side admin access
- `OPENROUTER_API_KEY` - Claude Sonnet 4.6 and embeddings
- `HEYGEN_API_KEY` - HeyGen avatar video generation
- `REPLICATE_API_TOKEN` - Replicate image composition
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` - Video hosting/processing
- `ELEVENLABS_API_KEY` - Text-to-speech voice synthesis
- `ENHANCOR_API_KEY` - Seedance 2.0 UGC video generation (via Enhancor.ai)
- `SHOTSTACK_API_KEY`, `SHOTSTACK_ENV` - Server-side caption rendering
- `BLOTATO_API_KEY` - Cross-platform social media publishing
- `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_API_TOKEN` - Storefront API for product data
- `RESEND_API_KEY` - Email delivery for lead notifications
- `AUTH_PASSWORD`, `AUTH_TOKEN` - Simple password auth (M1-M2 phase)

---

*Stack analysis: 2026-05-31*
