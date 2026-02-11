# CocoLash AI Image Generator: Master Implementation Plan

## Context

**Client:** CocoLash -- a premium luxury lash brand exclusively for African American women.
**Product:** A custom AI-powered web app that generates brand-consistent social media imagery with CocoLash's DNA embedded in every pixel.
**Investment:** $5,497 across 3 milestones. **Timeline:** 3-4 weeks.

This plan synthesizes the best of two prior technical reviews and resolves their gaps:
- **From Plan 1:** Excellent stack choices (Next.js 15 + Gemini 2.5 Flash + Supabase + Vercel), modular prompt architecture, diversity rotation system
- **From Plan 2 (Critique):** Richer psychographic prompts ("Understated Elegance" + "Unapologetic Confidence"), programmatic logo overlay with `sharp` (never AI-generated), structured-input-only UI (no free-text prompt box)

**Three critical architecture decisions:**
1. **Structured Input Only** -- Dropdowns/selectors enforce brand consistency. Only a 100-char optional "Context Note" field exists. The user never writes the actual prompt.
2. **Programmatic Logo Overlay** -- AI generates image with negative space instruction, then `sharp` composites the real logo PNG on top. Pixel-perfect every time.
3. **Enhanced Brand DNA Prompts** -- Every Gemini call is prefixed with a detailed system context block encoding CocoLash's personas, visual rules, and negative constraints.

---

## Technology Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui | $0 |
| AI Image Generation | Gemini 2.5 Flash Image (`gemini-2.5-flash-image`) via `@google/genai` | ~$0.039/image |
| Image Post-Processing | `sharp` | $0 |
| Database | Supabase PostgreSQL (free tier, 500MB) | $0 |
| File Storage | Supabase Storage (free tier, 1GB) | $0 |
| Auth | Middleware password (M1-M2), Supabase Auth (M3) | $0 |
| Hosting | Vercel Hobby + Fluid Compute | $0 |

**NPM Dependencies:** `@google/genai`, `@supabase/supabase-js`, `@supabase/ssr`, `sharp`, `uuid`

---

## Project File Structure

```
cocolash-ai/
├── app/
│   ├── layout.tsx                          # Root layout, fonts, providers
│   ├── page.tsx                            # Redirect to /generate or /login
│   ├── globals.css                         # Tailwind + CocoLash custom properties
│   ├── (auth)/login/page.tsx               # Password login form
│   ├── (protected)/
│   │   ├── layout.tsx                      # Sidebar nav, auth-checked wrapper
│   │   ├── generate/page.tsx               # Main image generation page
│   │   ├── gallery/page.tsx                # Image history gallery
│   │   ├── favorites/page.tsx              # [M3] Saved favorites view
│   │   └── settings/page.tsx              # Brand profile management
│   └── api/
│       ├── generate/route.ts               # POST: full generation pipeline
│       ├── images/route.ts                 # GET: list, DELETE: remove
│       ├── images/[id]/route.ts            # GET: single image details
│       ├── images/[id]/download/route.ts   # GET: download with Content-Disposition
│       ├── images/[id]/favorite/route.ts   # [M3] PATCH: toggle favorite
│       ├── brand/route.ts                  # GET/PUT: brand profile
│       ├── templates/route.ts              # [M3] GET/POST: saved prompt templates
│       ├── export/route.ts                 # [M2] POST: re-export at different ratio
│       └── auth/route.ts                   # POST: password verification
├── components/
│   ├── ui/                                 # shadcn/ui primitives
│   ├── layout/ (Sidebar, Header, MobileNav)
│   ├── generate/
│   │   ├── GenerateForm.tsx                # Main structured input form
│   │   ├── CategorySelector.tsx            # Lash Close-up / Lifestyle / Product + [M2] Before/After, Application
│   │   ├── SkinToneSelector.tsx            # Visual swatches (Deep/Med-Deep/Med/Light/Random)
│   │   ├── LashStyleSelector.tsx           # Natural/Volume/Cat-Eye/Wispy/etc.
│   │   ├── HairStyleSelector.tsx           # 12+ styles: Natural, Protective, Styled groups
│   │   ├── SceneSelector.tsx               # Environment dropdown (varies by category)
│   │   ├── CompositionSelector.tsx         # Solo/Duo, [M2] adds Group
│   │   ├── AspectRatioSelector.tsx         # 1:1/4:5/9:16/16:9 with platform labels
│   │   ├── LogoOverlayToggle.tsx           # Toggle + variant + position selector
│   │   ├── ContextNoteInput.tsx            # 100-char optional field
│   │   ├── SeasonalSelector.tsx            # [M2] 15+ holiday/seasonal presets
│   │   ├── DiversityControls.tsx           # [M2] Group composition controls
│   │   └── BeforeAfterToggle.tsx           # [M2] Before/After mode
│   ├── gallery/
│   │   ├── ImageGrid.tsx, ImageCard.tsx, ImageModal.tsx, GalleryFilters.tsx
│   │   └── FavoriteButton.tsx              # [M3]
│   ├── settings/
│   │   ├── BrandProfileForm.tsx, LogoUploader.tsx
│   └── shared/
│       ├── LoadingSpinner.tsx, GenerationProgress.tsx, ErrorDisplay.tsx, ImagePreview.tsx
├── lib/
│   ├── supabase/ (client.ts, server.ts, storage.ts)
│   ├── gemini/ (client.ts, generate.ts, safety.ts)
│   ├── prompts/
│   │   ├── brand-dna.ts                    # Master Brand DNA block
│   │   ├── negative.ts                     # Negative prompt constants
│   │   ├── compose.ts                      # composePrompt() assembler
│   │   ├── categories/ (lash-closeup.ts, lifestyle.ts, product.ts, [M2] before-after.ts, application-process.ts)
│   │   └── modules/ (skin-tones.ts, hair-styles.ts, lash-styles.ts, scenes.ts, compositions.ts, vibes.ts, [M2] seasonal.ts)
│   ├── image-processing/
│   │   ├── logo-overlay.ts                 # sharp-based logo compositing
│   │   ├── resize.ts                       # [M2] Aspect ratio re-export
│   │   └── before-after.ts                 # [M2] Side-by-side compositor
│   ├── diversity/tracker.ts                # Diversity rotation tracking
│   ├── constants/ (brand.ts, categories.ts, platforms.ts)
│   ├── types/index.ts                      # All TypeScript interfaces
│   └── utils/ (format.ts, validation.ts)
├── public/brand/ (logo-white.png, logo-dark.png, logo-gold.png)
├── middleware.ts                            # Auth protection
└── .env.local                              # API keys
```

---

## Database Schema

### M1 Tables

```sql
CREATE TABLE brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'CocoLash',
  color_palette JSONB NOT NULL,
  tone_keywords TEXT[],
  brand_dna_prompt TEXT NOT NULL,
  negative_prompt TEXT NOT NULL,
  logo_white_url TEXT,
  logo_dark_url TEXT,
  logo_gold_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brand_profiles(id) ON DELETE CASCADE,
  prompt_used TEXT NOT NULL,
  selections JSONB NOT NULL,              -- Structured user selections
  image_url TEXT NOT NULL,
  raw_image_url TEXT,                     -- Before logo overlay
  storage_path TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL DEFAULT '4:5',
  category TEXT NOT NULL,
  composition TEXT DEFAULT 'solo',
  has_logo_overlay BOOLEAN DEFAULT false,
  logo_position TEXT,
  generation_time_ms INT,
  gemini_model TEXT DEFAULT 'gemini-2.5-flash-image',
  is_favorite BOOLEAN DEFAULT false,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE diversity_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brand_profiles(id) ON DELETE CASCADE,
  skin_tone TEXT NOT NULL,
  hair_style TEXT NOT NULL,
  age_range TEXT,
  used_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_diversity_recent ON diversity_tracker (brand_id, used_at DESC);
CREATE INDEX idx_images_created ON generated_images (created_at DESC);
CREATE INDEX idx_images_category ON generated_images (category);
CREATE INDEX idx_images_favorite ON generated_images (is_favorite) WHERE is_favorite = true;
```

### M2 Additions

```sql
CREATE TABLE seasonal_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  prompt_modifier TEXT NOT NULL,
  color_overrides JSONB,
  props TEXT[],
  mood_keywords TEXT[],
  available_months INT[],
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE generated_images ADD COLUMN seasonal_preset_id UUID REFERENCES seasonal_presets(id);
ALTER TABLE generated_images ADD COLUMN group_count INT DEFAULT 1;
ALTER TABLE generated_images ADD COLUMN diversity_selections JSONB;
```

### M3 Additions

```sql
CREATE TABLE saved_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brand_profiles(id) ON DELETE CASCADE,
  user_id UUID,
  name TEXT NOT NULL,
  selections JSONB NOT NULL,
  category TEXT NOT NULL,
  thumbnail_url TEXT,
  use_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE generated_images ADD COLUMN user_id UUID;
```

---

## Brand DNA Prompt System

### Master Brand DNA Block (prepended to EVERY Gemini call)

```
[SYSTEM CONTEXT: COCOLASH VISUAL IDENTITY]
You are the Lead Photographer for CocoLash, a premium luxury lash brand exclusively
designed for African American women. Your aesthetic merges "Understated Elegance"
with "Unapologetic Confidence." Target personas: "Balanced Beauty" (effortless,
natural-enhanced glam) and "She's Got Style" (bold, fashion-forward, statement-making).

CRITICAL VISUAL RULES:
1. SKIN TONE & TEXTURE: ABSOLUTE PRIORITY. Hyper-realistic, rich melanin, visible
   pores and microtexture, healthy luminous glow. NO plastic smoothing, NO ashy
   undertones, NO over-exposed highlights washing out dark skin.
2. LIGHTING: Warm only (3200K-4500K). Butterfly or Rembrandt, soft diffused.
   FORBIDDEN: Cool blue, sterile white, harsh neon, flat frontal flash.
3. COLOR PALETTE (60-30-10 Rule):
   - 60% Primary: Soft Pink (#ead1c1), Creamy Beige (#ede5d6)
   - 30% Secondary: Warm Dark Brown (#28150e), Golden Brown (#ce9765)
   - 10% Accents: Charcoal (#242424), Clean White (#ffffff)
4. MOOD: Confident, Friendly, Warm, Proud. Never conceited, cold, or aggressive.
5. CAMERA: 85mm f/1.2 prime lens simulation. Shallow depth of field, creamy bokeh.
6. LASHES: Distinct, fluffy, meticulously applied. Individual fibers visible.

[NEGATIVE / AVOID]:
illustration, 3d render, cartoon, anime, plastic skin, airbrushed, blurry, blue
lighting, cool tones, disfigured eyes, double iris, messy makeup, clumpy lashes,
aggressive expression, stock photo feel, watermark, text overlay, logo text.
```

### Prompt Composition Formula

```
FINAL_PROMPT = MASTER_BRAND_DNA + CATEGORY_TEMPLATE(selections) + [SEASONAL_MODIFIER] + NEGATIVE_PROMPT
```

### Category Templates (M1: 3 categories, M2: adds 2 more)

**Lash Close-Up:** Extreme macro, specific eye shape/skin tone/lash style, butterfly lighting, catchlights, soft pink gradient background, specific gaze direction.

**Lifestyle/Editorial:** Medium-shot portrait, persona-driven ("Balanced Beauty"), specific outfit/setting/action, brand colors in wardrobe, negative space instruction for logo, "She's Black & Proud" energy.

**Product Photography:** Premium product staging, specific surface material, minimalist self-care props, "glow" lighting, center-weighted composition, 8K commercial quality.

**Before/After (M2):** Generates TWO images -- "before" with natural sparse lashes, "after" with stunning CocoLash extensions. Same model/setting/lighting. Composited side-by-side using `sharp`.

**Application Process (M2):** Five steps (Preparation, Isolation, Application, Final Check, Reveal). Tutorial-quality detail showing the artistry of lash application.

### Diversity Rotation System

Skin tone descriptors use the Monk Skin Tone Scale:
- **Deep:** "deep espresso," "rich dark chocolate," "deep mahogany"
- **Medium-Deep:** "warm cocoa," "caramel brown," "warm chestnut"
- **Medium:** "golden brown," "warm honey-brown," "toffee-toned"
- **Light:** "light brown with golden undertones," "warm tawny," "light caramel"

Hair styles: 12+ options across Natural (4C, Afro, Twist-Out, Blown-Out), Protective (Box Braids, Locs, Sew-In, Cornrows, Bantu Knots), and Styled (Silk Press, Loose Waves, Short Tapered).

When "Random" is selected, the `diversity_tracker` table tracks recent usage and rotates to underrepresented combinations.

---

## Milestone 1: Foundation ($2,199)

**Deliverables:** Brand profile system, Core categories (Lash Close-ups, Lifestyle, Product), Basic composition (Solo & Duo), Deployed & accessible.

### Phase 1.1: Project Scaffolding (Steps 1-5)

1. **Initialize Next.js project** -- `npx create-next-app@latest cocolash-ai` (App Router, TS, Tailwind, ESLint). Init shadcn/ui with "New York" style. Install components: button, card, select, label, input, dialog, toast, dropdown-menu, toggle-group, switch, badge, skeleton, tabs, separator, scroll-area, tooltip.

2. **Install dependencies** -- `npm install @google/genai @supabase/supabase-js @supabase/ssr sharp uuid`

3. **Configure `.env.local`** -- `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_PASSWORD`, `AUTH_TOKEN`

4. **Configure Tailwind theme** -- Extend with `coco` colors: pink (#ead1c1), brown (#28150e), golden (#ce9765), beige (#ede5d6), charcoal (#242424), white (#ffffff). Set up dark sidebar + beige content area theme.

5. **Create Supabase project** -- Execute M1 schema SQL. Create storage buckets: `generated-images` (public), `brand-assets` (for logos). Configure CORS for Vercel domain. Upload logo files.

### Phase 1.2: Authentication & Layout (Steps 6-8)

6. **Auth middleware** (`middleware.ts`) -- Check `cocolash-auth` cookie. If missing/invalid, redirect to `/login`. Exclude `_next/*`, `favicon.ico`, `public/*`, `/api/auth`.

7. **Login page** (`app/(auth)/login/page.tsx`) -- CocoLash logo, password input, submit. POST to `/api/auth` which validates against `AUTH_PASSWORD`, sets httpOnly cookie (30-day expiry), returns 200. Redirect to `/generate`.

8. **Protected layout** (`app/(protected)/layout.tsx`) -- Dark brown sidebar (#28150e) with nav links: Generate, Gallery, Settings. CocoLash logo at top. Beige content area (#ede5d6). Responsive: sidebar collapses to bottom nav on mobile.

### Phase 1.3: Brand Profile System (Steps 9-11)

9. **Brand constants** -- `lib/constants/brand.ts` (colors, keywords), `lib/prompts/brand-dna.ts` (Master DNA block), `lib/prompts/negative.ts` (negative prompt).

10. **Brand API** (`app/api/brand/route.ts`) -- GET: fetch profile (auto-seed defaults if none exists). PUT: update tone_keywords, brand_dna_prompt, negative_prompt.

11. **Settings page** -- Display color palette swatches (read-only). Edit style keywords, Brand DNA prompt, negative prompt. `LogoUploader` component for white/dark/gold variants uploading to `brand-assets` bucket.

### Phase 1.4: Prompt Engine (Steps 12-14)

12. **Type definitions** (`lib/types/index.ts`) -- `ContentCategory`, `Composition`, `AspectRatio`, `SkinTone`, `LogoPosition`, `GenerationSelections`, `GeneratedImage` interfaces.

13. **Prompt modules** -- Create descriptor files for skin-tones (Monk Scale), hair-styles (12+), lash-styles (8+), scenes (8+), vibes (7+), compositions (solo/duo). Each exports `getDescriptor(key): string`.

14. **Category templates + composer** -- `lash-closeup.ts`, `lifestyle.ts`, `product.ts` template builders. `compose.ts` assembles: `BRAND_DNA + CATEGORY_TEMPLATE(selections) + NEGATIVE_PROMPT`.

### Phase 1.5: Gemini Integration & Image Pipeline (Steps 15-19)

15. **Gemini client** -- `lib/gemini/client.ts` (singleton `GoogleGenAI`). `lib/gemini/generate.ts` (`generateImage(prompt, aspectRatio) -> {buffer, mimeType}`). `lib/gemini/safety.ts` (`GeminiError` class with codes: `EMPTY_RESPONSE`, `SAFETY_BLOCK`, `NO_IMAGE_DATA`, `RATE_LIMITED`).

16. **Logo overlay** (`lib/image-processing/logo-overlay.ts`) -- `applyLogoOverlay(imageBuffer, {position, variant, opacity, paddingPercent, sizePercent}) -> Buffer`. Downloads logo from Supabase Storage, resizes to % of image width, composites at calculated position using `sharp`.

17. **Storage helpers** (`lib/supabase/storage.ts`) -- `uploadGeneratedImage(buffer, brandId, suffix) -> {url, path}`.

18. **Generation API route** (`app/api/generate/route.ts`, `maxDuration = 60`) -- Full pipeline:
    1. Validate selections
    2. Resolve "random" skin tone via diversity tracker
    3. Compose prompt via `composePrompt()`
    4. Call Gemini `generateImage()`
    5. Upload raw image to Supabase Storage
    6. If logo enabled, run `applyLogoOverlay()`, upload final version
    7. Insert record into `generated_images`
    8. Record diversity selection
    9. Return `{success, image, generationTimeMs}`
    - Error handling: `SAFETY_BLOCK` -> 422, `RATE_LIMITED` -> 429, generic -> 500

19. **Image management APIs** -- `GET /api/images` (paginated list with category/favorite/date filters), `DELETE /api/images` (remove from DB + Storage), `GET /api/images/[id]` (single detail), `GET /api/images/[id]/download` (Content-Disposition: attachment).

### Phase 1.6: UI Components (Steps 20-25)

20. **Selector components** -- `CategorySelector` (3 categories with icons), `SkinToneSelector` (visual swatches + "Random" default), `LashStyleSelector` (8+ options with tooltips), `HairStyleSelector` (12+ grouped by Natural/Protective/Styled), `SceneSelector` (varies by category; auto-selects "Studio" for Close-up, hidden for Product), `CompositionSelector` (Solo/Duo, only for Lifestyle), `AspectRatioSelector` (platform-labeled toggles, default 4:5), `LogoOverlayToggle` (switch + variant/position pickers), `ContextNoteInput` (100-char max with counter).

21. **GenerateForm** -- Two-column desktop layout (selectors left, preview right). Conditional rendering based on category. Gold "Generate Image" button with spinner + "Creating your CocoLash image..." loading state. "Usually takes 5-15 seconds" hint.

22. **GenerationProgress** -- Animated overlay with CocoLash logo pulse, cycling text ("Composing your scene...", "Applying CocoLash magic...", "Almost there..."), elapsed timer.

23. **ImagePreview** -- Full-quality display. Buttons: Download, Generate Another. Expandable "View Prompt Used" section. Metadata: category, ratio, generation time.

24. **ErrorDisplay** -- Per-code messages: SAFETY_BLOCK ("Try adjusting selections"), RATE_LIMITED (countdown timer), generic ("Try again"). Retry button.

25. **Gallery page** -- `GalleryFilters` (category + date range), `ImageGrid` (responsive: 3/2/1 cols), `ImageCard` (thumbnail + category badge + date), `ImageModal` (full-size + prompt + download + delete with confirmation). Pagination via "Load More".

### Phase 1.7: Deploy & Verify (Steps 26-28)

26. **Deploy to Vercel** -- Push to GitHub, connect Vercel, set env vars, verify Fluid Compute enabled.

27. **Test matrix** -- Generate across all 3 categories, both compositions, all 4 skin tones + random, multiple lash/hair styles, all 4 aspect ratios, with and without logo overlay. Verify each image against brand checklist: realistic skin, warm lighting, brand colors, visible lashes, no artifacts.

28. **Client handoff** -- Share URL + password. Walkthrough demo of all M1 features. Collect feedback.

---

## Milestone 2: Expansion ($2,199)

**Deliverables:** 15+ seasonal/holiday presets, Group shots (3+) with diversity controls, Before/After & Application Process categories, Multi-platform export.

### Phase 2.1: Seasonal/Holiday Presets (Steps 29-32)

29. **Define 15+ presets** in `lib/prompts/modules/seasonal.ts` -- Each has: name, slug, category (major_holiday/beauty_industry/seasonal), prompt modifier text, suggested props, mood keywords, available months. Full list:
    - **Major Holidays:** Valentine's Day, Mother's Day, Halloween, Christmas, New Year's Eve
    - **Beauty Industry:** National Lash Day, Galentine's Day, Self-Care Sunday, World Lash Day
    - **Seasonal:** Wedding Season, Prom Season, Back to School, Summer Vibes, Holiday Party, Fall/Autumn

30. **Seed presets** into `seasonal_presets` table via migration script.

31. **SeasonalSelector component** -- Grouped dropdown by category. Default "No Season". Shows only current-month presets unless "All Seasons" toggle is on. Displays selected season's suggested props as toggleable chips.

32. **Integrate into compose.ts** -- Append seasonal modifier after category template, before negative prompt.

### Phase 2.2: Group Shots (Steps 33-35)

33. **Extend composition system** -- Add `'group'` to `Composition` type. `compositions.ts` gets `getGroupCompositionPrompt(count, diversitySelections)` that specifies each person's skin tone, hair, age, plus group interaction/positioning.

34. **DiversityControls component** -- Visible when composition = "Group". Person count (3/4/5). Per-person skin tone + hair OR "Diverse Mix" auto-assign. Age range (Same/Mixed/Mature). Group action (Laughing/Walking/Posing/Brunch/Getting Ready).

35. **Update form + API** -- Show `DiversityControls` for Lifestyle + Group. API handles `groupCount` and `diversitySelections`. Execute M2 ALTER TABLE statements.

### Phase 2.3: Before/After & Application Process (Steps 36-38)

36. **Before/After template** (`before-after.ts`) -- Returns TWO prompts: `beforePrompt` (natural sparse lashes, "bare" eyes) and `afterPrompt` (stunning CocoLash extensions, dramatic transformation). Same model/setting/lighting in both.

37. **Application Process template** (`application-process.ts`) -- Five steps: Preparation (gel pads, tool prep), Isolation (single lash isolation), Application (bonding moment), Final Check (mirror reveal), Reveal (client reaction). Tutorial-quality detail.

38. **UI updates** -- Add categories to `CategorySelector`. Before/After shows simplified form. Application Process shows "Step" selector (5 options). API route handles dual-generation for Before/After.

### Phase 2.4: Before/After Compositor (Step 39)

39. **Side-by-side compositor** (`lib/image-processing/before-after.ts`) -- Uses `sharp` to: resize both images to same dimensions, add "Before"/"After" labels via SVG text overlay, join side-by-side with brand-color (beige) gap.

### Phase 2.5: Multi-Platform Export (Steps 40-41)

40. **Export API** (`app/api/export/route.ts`, `maxDuration = 60`) -- Takes imageId + targetAspectRatio. Re-generates from Gemini at new ratio using stored prompt (higher quality than cropping). Re-applies logo if original had one. Uploads new version.

41. **Export UI** -- In `ImageModal`: "Export for..." button group showing all 4 platform formats. Current ratio highlighted. Loading state per-ratio. Download button for each export.

### Phase 2.6: Deploy & Verify (Steps 42-43)

42. **Deploy** -- Execute M2 schema changes, run seed script, deploy to Vercel.

43. **Test matrix** -- Seasonal combos (Valentine's + Close-up, Christmas + Lifestyle), Group shots (3/5 people), Before/After (verify two distinct images + side-by-side), Application Process (all 5 steps), Multi-export (4:5 -> all other ratios), Seasonal + Group combo (Galentine's + Group of 4).

---

## Milestone 3: Polish & Launch ($1,099)

**Deliverables:** Favorites/Saved prompts system, Full QA testing & bug fixes, Final deployment + training session.

### Phase 3.1: Supabase Auth Upgrade (Steps 44-46)

44. **Enable Supabase Auth** -- Email auth provider. Create client user account manually.

45. **Update auth flow** -- Replace middleware password with `@supabase/ssr` session check. Update login page to `signInWithPassword`. Keep password fallback as option.

46. **Add user_id** -- Execute M3 schema. Backfill existing images. Create `saved_prompts` table.

### Phase 3.2: Favorites System (Steps 47-49)

47. **Favorite toggle API** (`PATCH /api/images/[id]/favorite`) -- Toggle `is_favorite` boolean.

48. **FavoriteButton component** -- Animated heart icon, optimistic UI update.

49. **Favorites page** (`app/(protected)/favorites/page.tsx`) -- Same grid as gallery, filtered to favorites. "Favorites" link added to sidebar.

### Phase 3.3: Saved Prompt Templates (Steps 50-52)

50. **Saved prompts API** (`GET/POST /api/templates`) -- List by `use_count DESC`. Save with name + selections JSON.

51. **"Save These Settings" flow** -- After generation, dialog to name the combination. Saves to `saved_prompts` with generated image as thumbnail.

52. **"Quick Generate" from saved** -- Horizontal scrollable row above the generate form. Clicking a saved template populates all selectors. Increment `use_count` on each use.

### Phase 3.4: Full QA (Steps 53-55)

53. **Comprehensive testing** -- Every category x composition x skin tone x hair style x lash style x scene x seasonal x aspect ratio x logo combination. All edge cases.

54. **Edge case testing** -- Safety filter blocks, rate limiting (10+ rapid generations), large groups, function timeouts, storage limits, mobile responsiveness (iPhone SE through iPad), browser compatibility (Chrome/Safari/Firefox).

55. **Bug fix sprint** -- Resolve all issues. Refine prompts based on quality review. Polish UI spacing, loading states, animations. Add error boundaries.

### Phase 3.5: Final Launch (Steps 56-58)

56. **Production hardening** -- Supabase RLS policies, input validation on all routes, verify no API key exposure, `robots.txt` Disallow all, Vercel Analytics (free).

57. **Final deployment** -- Production env vars, end-to-end verification.

58. **Client training session** -- Walk through: login, all 5 categories, seasonal presets, diversity controls, group shots, Before/After, logo overlay, gallery management, favorites, saved templates, export, brand settings, cost expectations (~$5-15/month).

---

## Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| **Gemini safety block** | Return 422 with "Try adjusting selections." Never use trigger words ("bare", "exposed"). Auto-retry with appended "fully clothed, professional setting" for lifestyle. |
| **Rate limiting** | Client-side: disable Generate for 5s after each call. Server: catch 429, return friendly countdown. Daily limit: "System ready again tomorrow." |
| **Empty/malformed response** | Check for `inlineData` in parts. If only text, retry once with "Generate as photographic image." After 2 fails, surface error. |
| **Function timeout** | `maxDuration = 60`. Before/After dual-gen may take ~30s. Group 5-person may be slow. On 504, suggest reducing complexity. |
| **Storage limits** | 1GB = ~1000 images. Show usage on Settings page. Warn at 80%. Allow bulk-delete of old unfavorited images. |
| **Logo not uploaded** | Disable logo toggle with "Upload your logo in Settings first" message. |

---

## Verification Checklist (Per Image)

- [ ] Skin: hyper-realistic, visible pores, no plastic/waxy appearance
- [ ] Lighting: warm golden, no cool/blue tones
- [ ] Colors: brand palette present (pink/beige backgrounds, brown/gold accents)
- [ ] Lashes: visible, detailed, individual fibers, no clumping
- [ ] Hair: natural texture matching selection
- [ ] Composition: matches category and scene
- [ ] Logo: pixel-perfect, correct position/size (if applied)
- [ ] Aspect ratio: matches selection
- [ ] Seasonal elements: present and tasteful (if selected)
- [ ] Diversity: accurate skin tone, no unnatural color cast
- [ ] No artifacts, watermarks, or AI text
