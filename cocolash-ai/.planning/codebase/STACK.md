# Technology Stack

**Analysis Date:** 2026-05-01

## Languages

**Primary:**
- TypeScript 5+ - All application and library code (`lib/**`, `app/**`, `components/**`)
- JavaScript/JSX - React components and Next.js configuration

**Secondary:**
- SQL - Supabase migrations (`supabase/migrations/`)

## Runtime

**Environment:**
- Node.js (version unspecified; no .nvmrc or package.json `engines` field)

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core:**
- Next.js 16.1.6 - Full-stack web application framework
- React 19.2.3 - UI component library
- React DOM 19.2.3 - React rendering to DOM

**Styling & UI:**
- Tailwind CSS 4 - Utility-first CSS framework (`@tailwindcss/postcss` 4)
- PostCSS 4 - CSS transformation tool
- shadcn/ui (via shadcn 3.8.4 CLI) - Component system built on Radix UI and Tailwind
- Radix UI 1.4.3 - Unstyled, accessible component primitives
- class-variance-authority 0.7.1 - Variant management for styled components
- clsx 2.1.1 - Utility for constructing className strings
- tailwind-merge 3.4.0 - Intelligent Tailwind CSS class merging
- lucide-react 0.563.0 - Icon library
- sonner 2.0.7 - Toast notification library
- next-themes 0.4.6 - Dark mode management

**Testing:**
- Not explicitly configured in package.json (no Jest, Vitest, etc. found in devDependencies)

**Build/Dev:**
- TypeScript 5 - Type checking
- ESLint 9 - Linting with Next.js config (`eslint-config-next` 16.1.6)
- tsx 4.21.0 - TypeScript execution (for scripts)
- dotenv 17.3.1 - Environment variable loading
- pg 8.20.0 - PostgreSQL client (dev dependency, used for local tooling)

## Key Dependencies

**Critical:**
- @supabase/ssr 0.8.0 - Server-side rendering support for Supabase authentication
- @supabase/supabase-js 2.95.3 - Supabase JavaScript client for database and auth
- @google/genai 1.40.0 - Google Gemini AI API client (image generation)
- openai 6.27.0 - OpenAI SDK (used via OpenRouter for Claude models)
- replicate 1.4.0 - Replicate API client (Nano Banana Pro for image composition)
- cloudinary 2.9.0 - Cloudinary SDK for video upload, transformation, and delivery
- sharp 0.34.5 - Image processing library (JPEG/PNG optimization)
- uuid 13.0.0 - UUID generation

**Utilities:**
- tw-animate-css 1.4.0 - Tailwind animation utilities

## Configuration

**Environment:**
- Dual authentication strategy configured via middleware (`middleware.ts`):
  1. Supabase Auth (OAuth-capable email/password)
  2. Legacy cookie-based auth with `AUTH_TOKEN` (M1-M2 compatibility)
- Environment variables required: `.env.local` (Never committed; see `.env.example` for template)
- Environment template: `.env.example` (lists all required/optional vars with descriptions)

**Build:**
- `next.config.ts` - Next.js configuration with remote image hostname allowlist for Supabase, Cloudinary, and HeyGen
- `tsconfig.json` - TypeScript compiler options with path alias `@/*` for absolute imports
- `postcss.config.mjs` - PostCSS configuration (minimal, delegates to Tailwind v4)
- `eslint.config.mjs` - ESLint configuration using Next.js preset
- `.env.example` - Environment variable template (55 lines, includes API keys for 10+ external services)

## Platform Requirements

**Development:**
- Node.js with npm
- TypeScript 5+ support
- Modern browser (ES2017+ target)

**Production:**
- Deployment target: Vercel (inferred from `next.config.ts` image optimization and `vercel.json` presence)
- Runtime: Node.js 18+ (standard Vercel support)
- Environment variables must be set at deployment time

---

*Stack analysis: 2026-05-01*
