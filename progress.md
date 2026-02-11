# CocoLash AI Image Generator: Progress Tracker

## Project Overview

**Client:** CocoLash
**Total Investment:** $5,497 across 3 milestones
**Timeline:** 3-4 weeks

---

## Current Status

**Phase:** Milestone 1 — Phase 1.4 COMPLETE
**Last Updated:** 2026-02-11

---

## Progress Log

| Date | Entry |
|------|-------|
| 2026-02-11 | Original client proposal finalized (`original_proposal.md`) |
| 2026-02-11 | Master implementation plan created (`MASTER_PLAN.md`) — full technical architecture, file structure, database schema, prompt system, and all 58 steps across 3 milestones defined |
| 2026-02-11 | **Phase 1.1 COMPLETE** — Full project scaffolding done (see details below) |
| 2026-02-11 | **Phase 1.2 COMPLETE** — Authentication & Layout done (see details below) |
| 2026-02-11 | **Phase 1.3 COMPLETE** — Brand Profile System done + full browser testing (see details below) |
| 2026-02-11 | **Phase 1.4 COMPLETE** — Prompt Engine built (types, 6 modules, 3 category templates, composer, diversity tracker) |

---

## Milestone 1: Foundation ($2,199)

### Phase 1.1: Project Scaffolding ✅ COMPLETE
- [x] Step 1 — Initialize Next.js project + shadcn/ui
  - Created Next.js 16.1.6 (latest) with App Router, TypeScript, Tailwind CSS v4, ESLint
  - shadcn/ui initialized with "New York" style, Tailwind v4 integration
  - 17 shadcn components installed: button, card, select, label, input, dialog, sonner (replaced deprecated toast), dropdown-menu, toggle-group, switch, badge, skeleton, tabs, separator, scroll-area, tooltip, toggle
  - TooltipProvider and Toaster (sonner) added to root layout
  - **Note:** Using `sonner` instead of `toast` — toast is deprecated in latest shadcn/ui
- [x] Step 2 — Install dependencies
  - `@google/genai` ^1.40.0 — Gemini AI image generation
  - `@supabase/supabase-js` ^2.95.3 — Supabase client
  - `@supabase/ssr` ^0.8.0 — Supabase SSR for Next.js
  - `sharp` ^0.34.5 — Image processing (logo overlay)
  - `uuid` ^13.0.0 + `@types/uuid` — Unique IDs
  - Additional auto-installed by shadcn: `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `radix-ui`, `next-themes`, `tw-animate-css`
- [x] Step 3 — Configure `.env.local`
  - Created `.env.local` with Supabase URL and anon key populated
  - Created `.env.example` as a template (no secrets)
  - **ACTION NEEDED:** User must add `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` manually
  - `.env*` files already in `.gitignore` by default
- [x] Step 4 — Configure Tailwind theme with CocoLash colors
  - Extended `@theme inline` with all CocoLash brand colors:
    - `coco-pink` (#ead1c1) + light/dark variants
    - `coco-brown` (#28150e) + light/medium variants
    - `coco-golden` (#ce9765) + light/dark variants
    - `coco-beige` (#ede5d6) + light/dark variants
    - `coco-charcoal` (#242424), `coco-white` (#ffffff)
  - shadcn CSS variables customized for CocoLash:
    - Background: warm beige (#ede5d6)
    - Primary: dark brown (#28150e)
    - Secondary: soft pink (#ead1c1)
    - Accent: golden (#ce9765)
    - Sidebar: dark brown (#28150e) with beige text
    - Ring/focus: golden (#ce9765)
  - Dark mode theme also configured (secondary priority)
  - All colors available as Tailwind utilities: `bg-coco-pink`, `text-coco-brown`, etc.
- [x] Step 5 — Create Supabase project + schema + storage buckets
  - **Project:** "CocoLash AI" (ID: `exkdmmxbrsgefpciyqkz`)
  - **Region:** us-east-1
  - **URL:** https://exkdmmxbrsgefpciyqkz.supabase.co
  - **Cost:** $0/month (free tier)
  - **Database tables created:**
    - `brand_profiles` — Brand identity storage (1 row seeded with CocoLash defaults)
    - `generated_images` — Image generation records with full metadata
    - `diversity_tracker` — Tracks skin tone/hair style diversity rotation
  - **Indexes created:**
    - `idx_diversity_recent` — Recent diversity usage (for rotation system)
    - `idx_images_created` — Chronological image listing
    - `idx_images_category` — Category filtering
    - `idx_images_favorite` — Partial index on favorites
  - **Storage buckets created:**
    - `generated-images` (public, 10MB limit, PNG/JPEG/WebP)
    - `brand-assets` (public, 5MB limit, PNG/SVG/JPEG/WebP)
  - **Storage policies:** Public read, service role write/delete on both buckets
  - **Seed data:** Default CocoLash brand profile with full Brand DNA prompt, color palette, tone keywords, and negative prompt

**Build Status:** ✅ Compiles successfully (Next.js 16.1.6 + Turbopack)

**Full directory structure created:**
```
cocolash-ai/
├── app/
│   ├── (auth)/login/
│   ├── (protected)/generate/, gallery/, settings/
│   ├── api/generate/, images/[id]/download/, images/[id]/favorite/, brand/, auth/
│   ├── layout.tsx (updated: metadata, TooltipProvider, Sonner)
│   ├── globals.css (updated: CocoLash brand theme)
│   └── page.tsx
├── components/
│   ├── ui/ (17 shadcn components)
│   ├── layout/, generate/, gallery/, settings/, shared/
├── lib/
│   ├── supabase/, gemini/, prompts/categories/, prompts/modules/
│   ├── image-processing/, diversity/, constants/, types/, utils/
├── public/brand/
├── .env.local, .env.example
└── package.json
```

### Phase 1.2: Authentication & Layout ✅ COMPLETE
- [x] Step 6 — Auth middleware
  - Created `middleware.ts` with cookie-based auth checking
  - Checks `cocolash-auth` httpOnly cookie against `AUTH_TOKEN` env var
  - Unauthenticated users redirected to `/login`
  - Public paths excluded: `/login`, `/api/auth`, static assets
  - Authenticated users visiting `/login` are redirected to `/generate`
  - Matcher excludes `_next/static`, `_next/image`, favicon, images
  - **Note:** Next.js 16 shows deprecation warning for `middleware` (suggests `proxy`). Still works perfectly — can migrate later if needed.
- [x] Step 7 — Login page + Auth API
  - `app/api/auth/route.ts` — POST endpoint:
    - Validates password against `AUTH_PASSWORD` env var
    - Sets `cocolash-auth` httpOnly cookie (30-day expiry, secure in prod, sameSite: lax)
    - Returns 401 on invalid password, 200 on success
  - `app/api/auth/route.ts` — DELETE endpoint:
    - Clears auth cookie for logout functionality
  - `app/(auth)/login/page.tsx` — Beautiful branded login page:
    - Warm beige background with subtle dot pattern
    - CocoLash brand logo icon (Sparkles in brown square)
    - Password input with show/hide toggle
    - Golden "Sign In" button with loading state
    - Error message display with red styling
    - Auto-redirect to `/generate` on success
- [x] Step 8 — Protected layout (sidebar + responsive nav)
  - `app/(protected)/layout.tsx` — Protected wrapper:
    - Desktop: 256px dark brown sidebar (fixed left) + beige content area
    - Mobile: Header + scrollable content + bottom nav
    - Max-width content container (7xl) with responsive padding
  - `components/layout/Sidebar.tsx` — Desktop sidebar:
    - Dark brown background (#28150e)
    - CocoLash logo with golden sparkles icon
    - 3 nav links: Generate, Gallery, Settings (with lucide icons)
    - Active link highlighting with golden accent + dot indicator
    - Tooltips on hover showing descriptions
    - Logout button at bottom with loading state
  - `components/layout/MobileNav.tsx` — Mobile bottom nav:
    - Fixed bottom bar with dark brown background
    - 3 nav items with icons and labels
    - Active indicator with golden underline
    - Hidden on desktop (md breakpoint)
  - `components/layout/Header.tsx` — Mobile top header:
    - Sticky header with backdrop blur
    - Brand icon + current page title
    - Logout button
    - Hidden on desktop
  - `app/page.tsx` — Root redirect to `/generate`
  - Placeholder pages created for `/generate`, `/gallery`, `/settings`

**Build Status:** ✅ Compiles successfully — all 7 routes detected

### Phase 1.3: Brand Profile System ✅ COMPLETE
- [x] Step 9 — Brand constants + prompt files
  - `lib/constants/brand.ts` — Central source of truth:
    - `BRAND_COLORS` object with primary/secondary/accent groups
    - `BRAND_PALETTE` flat array for UI palette display (6 colors with labels, hex, categories)
    - `DEFAULT_TONE_KEYWORDS` array (8 keywords)
    - `LOGO_VARIANTS` for white/dark/gold logos
    - `BRAND_PERSONAS` (Balanced Beauty, She's Got Style)
    - `COLOR_RULE` (60-30-10 rule description)
  - `lib/prompts/brand-dna.ts` — Master Brand DNA block:
    - Full system context prompt (1244 chars) encoding CocoLash visual identity
    - `getBrandDNA(customDNA?)` helper with fallback to default
  - `lib/prompts/negative.ts` — Negative prompt constants:
    - `DEFAULT_NEGATIVE_PROMPT` (236 chars) — terms to exclude
    - `SAFETY_NEGATIVE_APPEND` — extra terms for lifestyle shots
    - `getNegativePrompt()` and `getSafeNegativePrompt()` helpers
  - `lib/supabase/client.ts` — Browser Supabase client (using `@supabase/ssr`)
  - `lib/supabase/server.ts` — Server Supabase client + Admin client
  - `lib/supabase/storage.ts` — Storage helpers:
    - `uploadGeneratedImage()` — for AI-generated images
    - `uploadBrandAsset()` — for logo uploads (upsert mode)
    - `deleteStorageFile()` and `getPublicUrl()` utilities
    - Storage bucket constants: `GENERATED_IMAGES`, `BRAND_ASSETS`
- [x] Step 10 — Brand API (GET/PUT)
  - `app/api/brand/route.ts`:
    - **GET** — Fetches brand profile from Supabase. Auto-seeds defaults if no profile exists.
    - **PUT** — Partial updates for: `tone_keywords`, `brand_dna_prompt`, `negative_prompt`, logo URLs. Color palette is read-only (hardcoded brand identity). Automatically sets `updated_at`.
    - Whitelisted fields only — prevents arbitrary data injection
  - **Bug Found & Fixed:** Initially used `createAdminClient()` with service role key, but user's `SUPABASE_SERVICE_ROLE_KEY` was a publishable key (`sbp_...`) not a JWT. Switched to `createClient()` (anon key) since RLS is disabled on tables. Will revisit when RLS is enabled in M3.
- [x] Step 11 — Settings page + LogoUploader
  - `app/(protected)/settings/page.tsx` — Full settings page:
    - Loading skeleton state while fetching profile
    - Error state with "Try Again" button
    - Fetches brand profile from `/api/brand` on mount
    - Passes data to child components with callback handlers
    - Displays "Last updated" timestamp
  - `components/settings/BrandProfileForm.tsx`:
    - **Color Palette** (read-only) — 6 color swatches in a grid with hex codes and category badges (Primary 60%, Secondary 30%, Accent 10%)
    - **Style Keywords** — Removable badge chips + text input to add new keywords (Enter key or Add button). Duplicate prevention.
    - **Brand DNA Prompt** — Monospace textarea (12 rows) with character count and "Reset to default" button
    - **Negative Prompt** — Monospace textarea (4 rows) with character count and "Reset to default" button
    - **Save Changes** — Golden button with loading spinner, saves to `/api/brand` PUT, shows sonner toast on success/failure
  - `components/settings/LogoUploader.tsx`:
    - 3 logo variant slots (White, Dark, Gold) in a responsive grid
    - Each slot has: label, description, preview area with appropriate background color
    - Upload button triggers hidden file input (PNG/SVG/JPEG/WebP, max 5MB)
    - Upload to Supabase Storage → update brand profile via API
    - Remove logo functionality (sets URL to null)
    - "Uploaded" badge indicator when logo exists
    - Loading overlay during upload
  - `next.config.ts` — Added Supabase storage domain to `images.remotePatterns` for `next/image`

**Browser Testing Results (all passed):**
| Test | Result |
|------|--------|
| Login page renders with CocoLash branding | ✅ Pass |
| Password authentication (cocolash2026) | ✅ Pass |
| Redirect to /generate after login | ✅ Pass |
| Sidebar renders with correct branding | ✅ Pass |
| Active link highlighting (golden accent + dot) | ✅ Pass |
| Navigation: Generate → Gallery → Settings | ✅ Pass |
| Settings page loads brand profile from Supabase | ✅ Pass |
| Color palette displays 6 colors with hex + categories | ✅ Pass |
| Style keywords display + add "glamorous" keyword | ✅ Pass |
| Brand DNA prompt textarea with char count + reset | ✅ Pass |
| Negative prompt textarea with char count + reset | ✅ Pass |
| Logo uploader shows 3 variants with backgrounds | ✅ Pass |
| Save changes persists to Supabase (DB verified) | ✅ Pass |
| Toast notification on save success | ✅ Pass |
| Sign out clears cookie + redirects to /login | ✅ Pass |
| Middleware protects routes (unauthenticated → /login) | ✅ Pass |

**Architecture Decision: Supabase Service Role Key (Deferred to M3)**

| Item | Detail |
|------|--------|
| **Issue** | During Phase 1.3, the Brand API initially used `createAdminClient()` which requires the `SUPABASE_SERVICE_ROLE_KEY` (a JWT from Settings → API → Project API keys). The key provided in `.env.local` was a publishable key (`sbp_...`) from the newer API Keys page, not the legacy `service_role` JWT. This caused "Invalid API key" errors. |
| **What we did** | Switched all server-side Supabase calls to use `createClient()` (anon key) instead of `createAdminClient()` (service role key). This works because **RLS is currently disabled** on all tables (`brand_profiles`, `generated_images`, `diversity_tracker`). |
| **Why this is fine for M1-M2** | This is a single-user, password-protected internal tool. With RLS off, the anon key has full read/write access to the tables. All API routes are server-side only (not exposed to browser). Auth is enforced by our middleware cookie check. |
| **What changes in M3** | In Phase 3.1 (Supabase Auth Upgrade), we will: (1) Enable RLS policies on all tables, (2) Obtain the proper `service_role` JWT from Dashboard → Settings → API → Project API keys, (3) Switch admin operations back to `createAdminClient()` for elevated privileges, (4) Use the anon key + user session for client-side queries with proper RLS enforcement. |
| **Action required later** | In M3: Go to Supabase Dashboard → Settings → API → copy the `service_role` key (long JWT, three `.`-separated chunks) and add to `.env.local`. |

### Phase 1.4: Prompt Engine ✅ COMPLETE
- [x] Step 12 — Type definitions (`lib/types/index.ts`)
  - **Content types:** `ContentCategory` (lash-closeup, lifestyle, product) + `ContentCategoryAll` (M2 additions)
  - **Composition:** `Composition` (solo, duo) + `CompositionAll` (M2 group)
  - **Aspect ratios:** `AspectRatio` (1:1, 4:5, 9:16, 16:9) with `AspectRatioOption` including dimensions and platform labels
  - **Skin tones:** `SkinTone` (deep, medium-deep, medium, light, random) with `SkinToneOption` for UI
  - **Lash styles:** `LashStyle` — 8 styles (natural, volume, dramatic, cat-eye, wispy, doll-eye, hybrid, mega-volume)
  - **Hair styles:** `HairStyle` — 12 styles + random, grouped by Natural/Protective/Styled with `HairStyleOption`
  - **Scenes:** `Scene` — 8 environments + random
  - **Vibes:** `Vibe` — 7 moods + random
  - **Logo overlay:** `LogoPosition`, `LogoVariant`, `LogoOverlaySettings` with opacity/padding/size controls
  - **Core interfaces:** `GenerationSelections` (full form state), `GeneratedImage` (DB record), `BrandProfile` (DB record)
  - **API types:** `GenerateResponse`, `GenerateErrorResponse` with error codes
  - **Utility:** `DescriptorFn<T>`, `DiversityRecord`
- [x] Step 13 — Prompt modules (6 descriptor files)
  - `lib/prompts/modules/skin-tones.ts` — Monk Skin Tone Scale with 3 rich descriptors per tier (12 total). Photography-grade descriptions emphasizing melanin, texture, and glow. `SKIN_TONE_OPTIONS` with visual swatch colors for UI.
  - `lib/prompts/modules/hair-styles.ts` — 12 styles across Natural (4C, Afro, Twist-Out, Blown-Out), Protective (Box Braids, Locs, Sew-In, Cornrows, Bantu Knots), Styled (Silk Press, Loose Waves, Short Tapered). Each with detailed texture/styling description. Grouped options for UI.
  - `lib/prompts/modules/lash-styles.ts` — 8 lash styles with descriptions focusing on fiber detail, volume, curl pattern, and overall effect. UI options include short descriptions.
  - `lib/prompts/modules/scenes.ts` — 8 environments with full setting descriptions (studio, bedroom, cafe, golden hour, rooftop, salon, bathroom vanity, minimalist). Scene-to-category mapping (Close-ups → studio only, Lifestyle → all, Product → subset).
  - `lib/prompts/modules/vibes.ts` — 7 moods with expression/pose/energy descriptions (confident glam, soft romantic, bold editorial, natural beauty, night out, self-care, professional). UI options with short descriptions.
  - `lib/prompts/modules/compositions.ts` — Solo and Duo compositions with positioning/framing descriptions. UI options for selector.
- [x] Step 14 — Category templates + composer
  - `lib/prompts/categories/lash-closeup.ts` — Extreme macro eye photography. Randomized gaze directions. Butterfly lighting with catchlights. Pink gradient background. Hyper-realistic skin texture requirements.
  - `lib/prompts/categories/lifestyle.ts` — Medium-shot editorial portraits. Persona-driven (randomly selects Balanced Beauty or She's Got Style). Scene, vibe, hair, composition all integrated. Brand colors in wardrobe. Negative space for logo overlay. Safety terms auto-appended.
  - `lib/prompts/categories/product.ts` — Premium product staging. Randomized surface materials and prop arrangements. Center-weighted composition. "Glow" lighting. 8K commercial quality. Brand palette in scene.
  - `lib/prompts/compose.ts` — **Master composer:**
    - Formula: `BRAND_DNA + CATEGORY_TEMPLATE(selections) + NEGATIVE_PROMPT`
    - Resolves all "random" selections via diversity-aware rotation
    - Skin tone and hair style rotation uses least-recently-used algorithm from `diversity_tracker` table
    - Scene resolution respects category constraints
    - Returns `ComposedPrompt` with: fullPrompt, categoryPrompt, resolvedSelections
  - `lib/diversity/tracker.ts` — Supabase-backed diversity rotation:
    - `getRecentDiversityUsage()` — fetches last 20 selections for rotation
    - `recordDiversitySelection()` — logs skin tone + hair style after generation

**Build Status:** ✅ Compiles successfully — zero TypeScript errors

### Phase 1.5: Gemini Integration & Image Pipeline
- [ ] Step 15 — Gemini client + safety error handling
- [ ] Step 16 — Logo overlay (sharp compositing)
- [ ] Step 17 — Storage helpers
- [ ] Step 18 — Generation API route (full pipeline)
- [ ] Step 19 — Image management APIs

### Phase 1.6: UI Components
- [ ] Step 20 — Selector components (Category, SkinTone, LashStyle, HairStyle, Scene, Composition, AspectRatio, LogoOverlay, ContextNote)
- [ ] Step 21 — GenerateForm (two-column layout)
- [ ] Step 22 — GenerationProgress (animated overlay)
- [ ] Step 23 — ImagePreview
- [ ] Step 24 — ErrorDisplay
- [ ] Step 25 — Gallery page (filters, grid, modal, pagination)

### Phase 1.7: Deploy & Verify
- [ ] Step 26 — Deploy to Vercel
- [ ] Step 27 — Test matrix
- [ ] Step 28 — Client handoff

---

## Milestone 2: Expansion ($2,199)

### Phase 2.1: Seasonal/Holiday Presets
- [ ] Step 29 — Define 15+ presets
- [ ] Step 30 — Seed presets into database
- [ ] Step 31 — SeasonalSelector component
- [ ] Step 32 — Integrate into prompt composer

### Phase 2.2: Group Shots
- [ ] Step 33 — Extend composition system
- [ ] Step 34 — DiversityControls component
- [ ] Step 35 — Update form + API

### Phase 2.3: Before/After & Application Process
- [ ] Step 36 — Before/After template
- [ ] Step 37 — Application Process template
- [ ] Step 38 — UI updates for new categories

### Phase 2.4: Before/After Compositor
- [ ] Step 39 — Side-by-side compositor (sharp)

### Phase 2.5: Multi-Platform Export
- [ ] Step 40 — Export API
- [ ] Step 41 — Export UI

### Phase 2.6: Deploy & Verify
- [ ] Step 42 — Deploy M2
- [ ] Step 43 — Test matrix

---

## Milestone 3: Polish & Launch ($1,099)

### Phase 3.1: Supabase Auth Upgrade
- [ ] Step 44 — Enable Supabase Auth
- [ ] Step 45 — Update auth flow
- [ ] Step 46 — Add user_id + backfill

### Phase 3.2: Favorites System
- [ ] Step 47 — Favorite toggle API
- [ ] Step 48 — FavoriteButton component
- [ ] Step 49 — Favorites page

### Phase 3.3: Saved Prompt Templates
- [ ] Step 50 — Saved prompts API
- [ ] Step 51 — "Save These Settings" flow
- [ ] Step 52 — "Quick Generate" from saved

### Phase 3.4: Full QA
- [ ] Step 53 — Comprehensive testing
- [ ] Step 54 — Edge case testing
- [ ] Step 55 — Bug fix sprint

### Phase 3.5: Final Launch
- [ ] Step 56 — Production hardening
- [ ] Step 57 — Final deployment
- [ ] Step 58 — Client training session
