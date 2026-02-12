# CocoLash AI Image Generator: Progress Tracker

## Project Overview

**Client:** CocoLash
**Total Investment:** $5,497 across 3 milestones
**Timeline:** 3-4 weeks

---

## Current Status

**Milestone 1: COMPLETE** (Phase 1.7 Deployment deferred — deploying after M2 or on demand)
**Last Updated:** 2026-02-12

---

## Progress Log

| Date | Entry |
|------|-------|
| 2026-02-11 | Original client proposal finalized (`original_proposal.md`) |
| 2026-02-11 | Master implementation plan created (`MASTER_PLAN.md`) — full technical architecture, file structure, database schema, prompt system, and all 58 steps across 3 milestones defined |
| 2026-02-11 | **Phase 1.1 COMPLETE** — Full project scaffolding (Next.js 16.1.6, shadcn/ui, Supabase, Tailwind theme) |
| 2026-02-11 | **Phase 1.2 COMPLETE** — Authentication & Layout (middleware, login page, sidebar, mobile nav) |
| 2026-02-11 | **Phase 1.3 COMPLETE** — Brand Profile System (constants, Supabase clients, API, Settings page, LogoUploader) |
| 2026-02-11 | **Phase 1.4 COMPLETE** — Prompt Engine (types, 6 modules, 3 category templates, composer, diversity tracker) |
| 2026-02-11 | **Phase 1.5 COMPLETE** — Gemini Integration & Image Pipeline (client, safety, generate, logo overlay, APIs) |
| 2026-02-11 | **Phase 1.6 COMPLETE** — UI Components (10 selectors, GenerateForm, progress overlay, preview, error display, gallery) |
| 2026-02-11 | **Post-1.6 Fixes** — Logo naming/preview, Gemini model update, end-to-end testing |
| 2026-02-12 | **Post-1.6 Enhancement: Skin Realism DNA** — New skin realism prompt system for hyper-realistic African-American skin |
| 2026-02-12 | **Post-1.6 Enhancement: Logo Overlay Fixes** — Increased logo size, added negative prompts to prevent AI text generation |
| 2026-02-12 | **Post-1.6 Enhancement: Product Category System** — Complete overhaul of product generation with 7 sub-categories, 37 reference images, per-category prompts |
| 2026-02-12 | **MILESTONE 1 COMPLETE** — All core features built, tested, and refined. Deployment (Phase 1.7) deferred to post-M2. |

---

## Milestone 1: Foundation ($2,199) — COMPLETE

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
  - Created `.env.local` with Supabase URL, anon key, Gemini API key populated
  - Created `.env.example` as a template (no secrets)
  - `.env*` files already in `.gitignore` by default
- [x] Step 4 — Configure Tailwind theme with CocoLash colors
  - Extended `@theme inline` with all CocoLash brand colors:
    - `coco-pink` (#ead1c1) + light/dark variants
    - `coco-brown` (#28150e) + light/medium variants
    - `coco-golden` (#ce9765) + light/dark variants
    - `coco-beige` (#ede5d6) + light/dark variants
    - `coco-charcoal` (#242424), `coco-white` (#ffffff)
  - shadcn CSS variables customized for CocoLash brand
- [x] Step 5 — Create Supabase project + schema + storage buckets
  - **Project:** "CocoLash AI" (ID: `exkdmmxbrsgefpciyqkz`)
  - **Database tables:** `brand_profiles`, `generated_images`, `diversity_tracker`
  - **Storage buckets:** `generated-images` (public, 10MB), `brand-assets` (public, 5MB)
  - **Seed data:** Default CocoLash brand profile with full Brand DNA prompt

### Phase 1.2: Authentication & Layout ✅ COMPLETE
- [x] Step 6 — Auth middleware (`middleware.ts`) — Cookie-based auth, redirects unauthenticated to `/login`
- [x] Step 7 — Login page + Auth API — Beautiful branded login, httpOnly cookie (30-day), logout endpoint
- [x] Step 8 — Protected layout — Desktop sidebar (256px dark brown) + mobile header/bottom nav, 3 nav links (Generate, Gallery, Settings)

### Phase 1.3: Brand Profile System ✅ COMPLETE
- [x] Step 9 — Brand constants (`lib/constants/brand.ts`), Brand DNA prompt (`lib/prompts/brand-dna.ts`), Negative prompt (`lib/prompts/negative.ts`), Supabase clients (`lib/supabase/client.ts`, `server.ts`, `storage.ts`)
- [x] Step 10 — Brand API (`app/api/brand/route.ts`) — GET with auto-seed, PUT with whitelisted fields
- [x] Step 11 — Settings page with BrandProfileForm (color palette, keywords, DNA/negative prompts) + LogoUploader (3 variants)

**Architecture Decision: Supabase Service Role Key (Deferred to M3)**

| Item | Detail |
|------|--------|
| **Issue** | The `SUPABASE_SERVICE_ROLE_KEY` provided was a publishable key (`sbp_...`) not a legacy JWT. This caused "Invalid API key" errors with `createAdminClient()`. |
| **Solution** | Switched to `createClient()` (anon key) since RLS is disabled. Works fine for single-user M1-M2. |
| **M3 Action** | Enable RLS, obtain proper `service_role` JWT, switch admin operations back to `createAdminClient()`. |

### Phase 1.4: Prompt Engine ✅ COMPLETE
- [x] Step 12 — Comprehensive type definitions (`lib/types/index.ts`) — 15+ types covering categories, compositions, skin tones, lash/hair styles, scenes, vibes, logo settings, selections, generated images, brand profiles, API responses
- [x] Step 13 — 6 prompt descriptor modules: skin-tones (Monk Scale, 4 tiers × 3 descriptors), hair-styles (12 grouped by Natural/Protective/Styled), lash-styles (8), scenes (8 + category mapping), vibes (7), compositions (solo/duo)
- [x] Step 14 — 3 category templates (lash-closeup, lifestyle, product) + master `composePrompt()` assembler with diversity-aware random resolution

### Phase 1.5: Gemini Integration & Image Pipeline ✅ COMPLETE
- [x] Step 15 — Gemini client (`lib/gemini/client.ts`), safety error handling (`lib/gemini/safety.ts` with `GeminiError` class), image generation (`lib/gemini/generate.ts` with multimodal support)
- [x] Step 16 — Logo overlay (`lib/image-processing/logo-overlay.ts`) — Sharp-based compositing with configurable position, opacity, size, padding. Logo URL caching with 5-min TTL.
- [x] Step 17 — Storage helpers (completed in Phase 1.3)
- [x] Step 18 — Generation API (`app/api/generate/route.ts`) — Full 11-step pipeline: validate → fetch brand → fetch diversity → fetch product refs → compose prompt → call Gemini → upload raw → apply logo → insert record → record diversity → return result
- [x] Step 19 — Image management APIs: `GET /api/images` (paginated, filtered), `DELETE /api/images`, `PATCH /api/images` (favorite toggle), `GET /api/images/[id]`, `GET /api/images/[id]/download`

### Phase 1.6: UI Components ✅ COMPLETE
- [x] Step 20 — 10 selector components: CategorySelector, SkinToneSelector, LashStyleSelector, HairStyleSelector, SceneSelector, VibeSelector, CompositionSelector, AspectRatioSelector, LogoOverlayToggle, ContextNoteInput
- [x] Step 21 — GenerateForm with two-column layout, conditional rendering per category, smart defaults
- [x] Step 22 — GenerationProgress (animated overlay with cycling messages, elapsed timer, gradient progress bar)
- [x] Step 23 — ImagePreview (full-quality display, metadata badges, download, prompt viewer)
- [x] Step 24 — ErrorDisplay (per-error-code messages: safety block, rate limit with countdown, API key error, timeout)
- [x] Step 25 — Gallery page with GalleryFilters, ImageCard (hover effects, badges), ImageModal (full-size, download, favorite, delete), pagination

### Phase 1.7: Deploy & Verify — DEFERRED
- [ ] Step 26 — Deploy to Vercel (deferred to after M2 or on-demand)
- [ ] Step 27 — Test matrix (manual testing performed; formal matrix deferred)
- [ ] Step 28 — Client handoff (deferred)

**Reason for deferral:** Client opted to complete M2 features before deploying, or deploy on-demand before M2 if needed.

---

## Post-Phase 1.6: Enhancements & Fixes

### Skin Realism DNA System ✅ COMPLETE (2026-02-12)

**Problem:** AI-generated images had plastic/fake-looking skin — not the hyper-realistic African-American skin quality needed for the brand.

**Technical Solution:**
1. **Database migration** — Added `skin_realism_prompt` column to `brand_profiles` table (TEXT, nullable).
2. **New prompt module** — Created `lib/prompts/skin-realism.ts`:
   - `DEFAULT_SKIN_REALISM_PROMPT` — 1500+ character directive covering melanin pigmentation, pore visibility, subdermal vascularity, melanin variance, subsurface scattering, natural oil sheen, iris striations, and strict forbidden list.
   - `getSkinRealismDNA(customPrompt?)` — Returns custom or default.
3. **Prompt composition update** — Modified `lib/prompts/compose.ts`:
   - Skin realism block is injected for `lifestyle` and `lash-closeup` categories only (skipped for `product` — no human skin).
   - Positioned between Brand DNA and Category Template in the prompt assembly.
4. **Settings UI** — Added "Skin Realism Prompt" section in `BrandProfileForm.tsx` with textarea, character count, and "Reset to default" button.
5. **API update** — `app/api/brand/route.ts` now accepts and persists `skin_realism_prompt`.

**Files modified:** `lib/prompts/skin-realism.ts` (new), `lib/prompts/compose.ts`, `components/settings/BrandProfileForm.tsx`, `app/api/brand/route.ts`, `lib/types/index.ts`

### Logo Overlay Fixes ✅ COMPLETE (2026-02-12)

**Problems identified during testing:**
1. Logo was too small in generated images
2. AI was generating text ("LOGA") in the image conflicting with the overlay
3. Logo missing in some close-up shots

**Technical Solution:**
1. **Increased logo size** — Changed default `sizePercent` from 15% to 22% and reduced `paddingPercent` from 4% to 3% in `lib/image-processing/logo-overlay.ts`.
2. **Expanded negative prompt** — Added explicit anti-text directives to `lib/prompts/negative.ts`: `"no text in image, no typography, no lettering, no brand names rendered in image, no watermarks, no embedded logos, no words, no captions, no signatures"`.
3. **Logo labels renamed** — Updated to match actual logo colors provided by client:
   - "White Logo" → **"Light Pink Logo"** (for dark backgrounds)
   - "Gold Logo" → **"Beige Logo"** (for premium/accent use)
   - Updated in: `lib/constants/brand.ts`, `components/generate/LogoOverlayToggle.tsx`, `components/settings/LogoUploader.tsx`
4. **Logo preview backgrounds fixed** — Each logo preview now has a contrasting background (dark logo → white bg, light/beige logos → brown bg).

### Gemini Model Fix ✅ COMPLETE (2026-02-11)

**Problem:** Initial model names were outdated.
- `gemini-2.0-flash-exp` → 404 (model not found)
- `gemini-2.0-flash-preview-image-generation` → 404 (model retired)
- **Fix:** Updated to `gemini-2.5-flash-image` in `lib/gemini/client.ts`

### Product Category System — COMPLETE OVERHAUL ✅ (2026-02-12)

**Problem:** The original product generation system sent ALL product reference images (5 generic photos) to Gemini in every product generation. The AI mashed all product types together — showing boxes, trays, pouches, and accessories in one chaotic scene. There was no way to specify which product type to generate.

**Original Design:** A single "Product Reference Images" section in Settings (max 5 images), all sent to Gemini for every product generation with a single generic prompt.

**New Design:** 7 distinct product sub-categories, each with its own reference images and ultra-specific prompt template. Only the selected sub-category's images and prompt are sent to Gemini.

**Technical Implementation:**

#### 1. Database Schema (New Tables)

```sql
-- Product sub-categories (7 rows seeded)
CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,          -- e.g., 'single-black-tray'
  label TEXT NOT NULL,               -- e.g., 'Single Black Lid Trays'
  description TEXT,
  prompt_template TEXT,              -- Category-specific prompt (future use)
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Reference images linked to categories (37 total across 7 categories)
CREATE TABLE product_reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

RLS enabled with permissive policies. Indexes on `category_id` and `sort_order`.

#### 2. Product Sub-Categories & Reference Images

| # | Key | Label | Images | Description |
|---|-----|-------|--------|-------------|
| 1 | `single-black-tray` | Single Black Lid Trays | 5 | Individual lash pairs in black round trays (Dahlia, Poppy, Marigold, Orchid, Rose) |
| 2 | `single-nude-tray` | Single Nude Lid Trays | 5 | Individual lash pairs in nude/brown round trays (Daisy, Iris, Jasmine, Peony, Violet) |
| 3 | `multi-lash-book` | Multi-Lash Book Boxes | 5 | 5-pair lash sets in book-style boxes (black or pink) |
| 4 | `full-kit-pouch` | Full Kits with Pouch | 5 | Complete sets including fabric storage pouch |
| 5 | `full-kit-box` | Full Kits in Box | 8 | Complete sets in rigid cardboard boxes |
| 6 | `storage-pouch` | Storage Pouches Only | 3 | Just the linen/fabric bags without other products |
| 7 | `branding-flatlay` | Branding & Flatlays | 6 | Styled overhead shots, pattern arrangements, bulk displays |
| **Total** | | | **37** | |

**Note:** An 8th category "Multi-Lash Display Boxes" was initially created but removed at the client's request (too similar to Multi-Lash Book Boxes). Fully cleaned from DB, types, prompts, and UI.

#### 3. TypeScript Types (`lib/types/index.ts`)

Added `ProductCategoryKey` union type (7 values), `ProductCategory` interface, `ProductReferenceImage` interface, and `productSubCategory?: ProductCategoryKey` to `GenerationSelections`.

#### 4. API Endpoints (New)

- **`GET /api/product-categories`** — Returns all 7 categories with their reference images and image counts. Used by both the Generate page selector and the Settings page manager.
- **`POST /api/product-categories/[id]/images`** — Registers a new reference image for a category (after uploading to Supabase Storage).
- **`DELETE /api/product-categories/[id]/images?imageId=...`** — Removes a reference image (deletes from both Storage and DB).

#### 5. Generate Page UI (`components/generate/ProductSubCategorySelector.tsx`)

New component that appears when "Product" is selected in the category selector. Shows a 4-column grid of the 7 sub-categories, each with:
- An icon (Circle, CircleDot, BookOpen, ShoppingBag, Box, Briefcase, Layers)
- The category name
- An image count badge (e.g., "5" in golden for categories with images, "No images yet" warning for empty ones)
- Golden active border when selected

#### 6. Settings Page UI (`components/settings/ProductCategoryManager.tsx`)

Replaced the old `ProductImageUploader` (5-image max) with a new accordion-style category manager. Each of the 7 categories is an expandable row showing:
- Category name and description
- Image count badge
- When expanded: grid of uploaded reference images with remove buttons, plus an "Add Reference Image" upload button
- Total image count badge in the header

#### 7. Generate API Route (`app/api/generate/route.ts`)

Updated to:
1. Accept `productSubCategory` in the request body
2. Look up the category in the `product_categories` table
3. Fetch only that category's reference images from `product_reference_images`
4. Convert them to base64 for Gemini's multimodal input
5. Pass the category key, label, and description to the prompt composer

#### 8. Prompt System (`lib/prompts/categories/product.ts`)

Completely refactored with:
- **Per-category prompt templates** (`CATEGORY_PROMPTS` record): Each of the 7 categories has a detailed prompt block specifying:
  - What the product type IS (physical description)
  - Composition rules (what to show, how many items)
  - Strict constraints (what CAN'T be changed)
- **Fidelity block** (`buildFidelityBlock()`): Ultra-strict 9-point directive added whenever reference images exist, covering: product identity, shape/form, color/finish, branding/text, packaging details, what can change, what cannot change, product type enforcement, accuracy check.
- **Updated `composePrompt()`**: Now accepts `productSubCategoryKey`, `productSubCategoryLabel`, `productSubCategoryDescription` and passes them through to `buildProductPrompt()`.

#### 9. Upload Tooling

Created reusable scripts for bulk image upload:
- **`scripts/upload-category-images.mjs`** — CLI tool that takes a category key and list of image paths, uploads each to Supabase Storage under `products/{category-key}/`, registers them in `product_reference_images` with auto-incrementing sort order.
- **`scripts/migrate-product-categories.mjs`** — Creates tables (if needed) and seeds the 7 categories.

---

## Architecture Summary

### File Structure (Final M1)

```
cocolash-ai/
├── app/
│   ├── (auth)/login/page.tsx              # Branded login
│   ├── (protected)/
│   │   ├── layout.tsx                     # Sidebar + mobile nav
│   │   ├── generate/page.tsx              # Image generation
│   │   ├── gallery/page.tsx               # Image history
│   │   └── settings/page.tsx              # Brand settings
│   └── api/
│       ├── auth/route.ts                  # Login/logout
│       ├── brand/route.ts                 # GET/PUT brand profile
│       ├── generate/route.ts              # POST: full generation pipeline
│       ├── images/route.ts                # GET (list), DELETE, PATCH (favorite)
│       ├── images/[id]/route.ts           # GET single image
│       ├── images/[id]/download/route.ts  # GET download
│       ├── product-categories/route.ts    # GET all categories + images
│       └── product-categories/[id]/images/route.ts  # POST/DELETE ref images
├── components/
│   ├── ui/ (17 shadcn components)
│   ├── layout/ (Sidebar, Header, MobileNav)
│   ├── generate/
│   │   ├── GenerateForm.tsx               # Master form
│   │   ├── CategorySelector.tsx           # 3 categories
│   │   ├── ProductSubCategorySelector.tsx  # 7 product sub-categories (NEW)
│   │   ├── SkinToneSelector.tsx           # 5 options with swatches
│   │   ├── LashStyleSelector.tsx          # 8 styles
│   │   ├── HairStyleSelector.tsx          # 12+ grouped
│   │   ├── SceneSelector.tsx              # 8 + random
│   │   ├── VibeSelector.tsx               # 7 + random
│   │   ├── CompositionSelector.tsx        # Solo/Duo
│   │   ├── AspectRatioSelector.tsx        # 4 ratios
│   │   ├── LogoOverlayToggle.tsx          # Switch + settings
│   │   ├── ContextNoteInput.tsx           # 100-char note
│   │   ├── GenerationProgress.tsx         # Animated overlay
│   │   ├── ImagePreview.tsx               # Result display
│   │   └── ErrorDisplay.tsx               # Error cards
│   ├── gallery/
│   │   ├── GalleryFilters.tsx             # Category + favorites
│   │   ├── ImageCard.tsx                  # Thumbnail card
│   │   └── ImageModal.tsx                 # Full-size detail
│   └── settings/
│       ├── BrandProfileForm.tsx           # DNA, skin realism, keywords, negative
│       ├── LogoUploader.tsx               # 3 logo variants
│       └── ProductCategoryManager.tsx     # 7-category accordion (NEW)
├── lib/
│   ├── supabase/ (client.ts, server.ts, storage.ts)
│   ├── gemini/ (client.ts, generate.ts, safety.ts)
│   ├── prompts/
│   │   ├── brand-dna.ts                   # Master Brand DNA
│   │   ├── skin-realism.ts                # Skin realism directive (NEW)
│   │   ├── negative.ts                    # Negative/forbidden terms
│   │   ├── compose.ts                     # Master prompt assembler
│   │   ├── categories/ (lash-closeup.ts, lifestyle.ts, product.ts)
│   │   └── modules/ (skin-tones.ts, hair-styles.ts, lash-styles.ts, scenes.ts, vibes.ts, compositions.ts)
│   ├── image-processing/logo-overlay.ts   # Sharp compositing
│   ├── diversity/tracker.ts               # Diversity rotation
│   ├── constants/brand.ts                 # Brand identity
│   └── types/index.ts                     # All TypeScript types
├── scripts/
│   ├── upload-category-images.mjs         # Bulk image upload tool
│   ├── upload-products.mjs                # Legacy product upload (superseded)
│   └── migrate-product-categories.mjs     # DB migration + seeding
├── middleware.ts                           # Auth protection
├── .env.local                             # API keys (gitignored)
└── .env.example                           # Template
```

### Database Schema (Final M1)

| Table | Purpose | Rows |
|-------|---------|------|
| `brand_profiles` | Brand identity, prompts, logo URLs | 1 |
| `generated_images` | All generated image records with metadata | Variable |
| `diversity_tracker` | Skin tone/hair style rotation tracking | Variable |
| `product_categories` | 7 product sub-categories with labels/descriptions | 7 |
| `product_reference_images` | Reference photos linked to product categories | 37 |

Additional columns added to `brand_profiles` during M1:
- `skin_realism_prompt TEXT` — Custom skin realism directive
- `product_image_urls JSONB` — Legacy field (superseded by product_categories system)

### Prompt Assembly Formula

```
FINAL_PROMPT = BRAND_DNA
             + [SKIN_REALISM_DNA]       (lifestyle + lash-closeup only)
             + CATEGORY_TEMPLATE(selections, subCategory)
             + [PRODUCT_FIDELITY_BLOCK]  (product with reference images only)
             + NEGATIVE_PROMPT
```

### Generation Pipeline (11 Steps)

1. Parse and validate all selections (including `productSubCategory`)
2. Fetch brand profile (for prompt overrides + logo URLs)
3. Fetch diversity tracker data (recent skin tones + hair styles)
4. Fetch product reference images for selected sub-category (if product)
5. Convert reference images to base64 for Gemini multimodal input
6. Compose prompt via `composePrompt()` with all overrides
7. Call Gemini `generateImage()` with prompt + optional reference images
8. Upload raw image to Supabase Storage
9. Apply logo overlay if enabled (Sharp compositing)
10. Insert record into `generated_images` table
11. Record diversity selection for future rotation

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Structured input only (no free-text prompt box)** | Enforces brand consistency. User selects from dropdowns/buttons. Only a 100-char context note is allowed. |
| **Programmatic logo overlay (Sharp, not AI)** | AI-generated text is unreliable. Sharp composites the real PNG logo pixel-perfectly every time. |
| **Per-category product prompts** | Generic prompts caused AI to mash all product types together. Each sub-category has strict instructions about what to show and what not to change. |
| **Multimodal reference images** | Product images are converted to base64 and sent to Gemini alongside the text prompt, giving the AI visual references to match exactly. |
| **Skin realism as separate DNA block** | Keeps the concern isolated. Can be edited independently in Settings. Only injected for human-featuring categories. |
| **Diversity rotation (least-recently-used)** | When "Random" is selected, the system picks the least-used skin tone/hair style from the last 20 generations, ensuring visual diversity. |
| **Sonner instead of Toast** | shadcn/ui deprecated `toast` in favor of `sonner`. Changed during Phase 1.1 installation. |
| **Anon key for all Supabase calls** | Service role key mismatch (publishable vs JWT). RLS is off, so anon key works. Proper service role setup deferred to M3. |

### Errors Encountered & Resolutions

| # | Error | Resolution |
|---|-------|------------|
| 1 | `EPERM: operation not permitted, mkdir create-next-app-nodejs` | Re-ran `npx create-next-app` with elevated permissions |
| 2 | "The toast component is deprecated" during shadcn install | Replaced `toast` with `sonner` |
| 3 | "Invalid API key" for `SUPABASE_SERVICE_ROLE_KEY` | Switched to anon key (RLS off). Deferred to M3. |
| 4 | Next.js build failed — network blocked during font fetch | Re-ran build with `full_network` permission |
| 5 | TypeScript type error — `GeminiErrorCode` not assignable | Added `INVALID_API_KEY` and `MODEL_ERROR` to error code union |
| 6 | Dev server port 3000 in use + `uv_interface_addresses` error | Killed conflicting processes, restarted with permissions |
| 7 | Gemini 404 — `gemini-2.0-flash-exp` model not found | Updated to `gemini-2.5-flash-image` (current model) |
| 8 | "Brand profile not found" — transient Supabase fetch failure | Resolved on retry (network glitch) |
| 9 | TypeScript error — `uploadBrandAsset` too strictly typed | Created dedicated `uploadProductImage` function |
| 10 | TypeScript error — `contents` type mismatch in Gemini SDK | Explicitly typed multimodal content array |

---

## What Remains

### Phase 1.7: Deploy & Verify — DEFERRED
- Deployment to Vercel deferred until after M2 or on-demand by client
- Manual testing performed by client; formal test matrix deferred

### Milestone 2: Expansion ($2,199) — NOT STARTED
- Phase 2.1: Seasonal/Holiday Presets (15+ presets)
- Phase 2.2: Group Shots (3+ people with diversity controls)
- Phase 2.3: Before/After & Application Process categories
- Phase 2.4: Before/After Compositor (Sharp side-by-side)
- Phase 2.5: Multi-Platform Export
- Phase 2.6: Deploy & Verify

### Milestone 3: Polish & Launch ($1,099) — NOT STARTED
- Phase 3.1: Supabase Auth Upgrade (RLS, proper service role key)
- Phase 3.2: Favorites System (dedicated page)
- Phase 3.3: Saved Prompt Templates
- Phase 3.4: Full QA
- Phase 3.5: Final Launch + Client Training
