# Seedance 2.5 — Implementation Plan (03-PLAN.md)

Planner: Fable 5.1 · 2026-09-08 · Status: **Wave 0 DONE (contracts shipped, tsc clean, 62 files / 589 tests green)** → Wave 1 ready to start.

Read first: `02-DECISIONS.md` (D1–D15 are locked — do not re-open), `01-API-REFERENCE.md` (the 2.5 API + real pricing). `00-DISCOVERY.md` is the map of the pre-existing 2.0 pipeline; its line numbers have drifted — trust the code.

**How to use this file.** Each Wave-1 package (§3) is self-contained: an executor opens its section, reads the "Context — import these" list, and ships. Executors never `git add`/commit/push; never touch files outside their "Owned files" list; ignore any path ending in `" 2"` (Finder duplicates); never touch `.planning/`. If you need something changed in another package's file, do NOT edit it — put a `REQUEST FOR <pkg>:` line in your final report and the orchestrator routes it.

---

## 0. Wave 0 — what already exists (executors import these)

| Module | Key exports | Notes |
|---|---|---|
| `lib/types/index.ts` | `SeedanceEngine`, `QualityTier`, `VideoInputUrls`; `GeneratedVideo` + 14 **optional** 2.5 columns (`engine?`, `seedance_mode?`, `quality_tier?`, `resolution?`, `requested_duration?`, `input_urls?`, `request_payload?`, `credits_cost?`, `error_message?`, `rerender_of?`, `output_format?`, `bitrate_mode?`, `is_uncensored?`, `pass_faces?`); `aspect_ratio` widened to `string \| null`; `VideoStatusResponse` + optional `engine, mode, resolution, qualityTier, requestedDuration, creditsCost, costUsd, errorMessage, rerenderOf` | Columns are optional on purpose: absent pre-migration and in literal test fixtures. |
| `lib/seedance/engines.ts` | `SEEDANCE_ENGINES`, `DEFAULT_ENGINE="2.5"`, `SEEDANCE_25_API_BASE`, `SEEDANCE_20_API_BASE_DEFAULT`, `getEngine`, `engineLabel`, `engineSupportsMode`, `engineSupportsAspectRatio`, `isDurationValidForEngine`, `QUALITY_TIERS`, `QUALITY_TIER_IDS`, `DEFAULT_QUALITY_TIER`, `qualityTierToResolution`, `resolutionToQualityTier`, `isDraftTier`, `isAdaptiveOnlyMode`, `DEFAULT_ASPECT_RATIO="9:16"`, `DEFAULT_DURATION_SECONDS=8`, `SEEDANCE_20_MODES`, `SEEDANCE_ENGINE_IDS` | Client-safe. 2.5 base URL is hard-coded (env override applies to 2.0 only). |
| `lib/seedance/v25/types.ts` | `SEEDANCE_25_MODES` (9), `Seedance25Mode`, `SEEDANCE_25_ASPECT_RATIOS` (7), `SEEDANCE_25_LIMITS`, `AUTO_DURATION=-1`, `SEEDANCE_25_MODE_LABELS`, `SEEDANCE_25_ADAPTIVE_ONLY_MODES`, `SEEDANCE_25_REDUCED_RATE_MODES`, `SEEDANCE_25_MOV_DEFAULT_MODES`, `Seedance25Request`, `Seedance25QueuePayload`, `Seedance25QueueResponse`, `Seedance25CallbackPayload`, `Seedance25TaskResult`, `Seedance25TaskStatus` | Dependency-free. |
| `lib/seedance/v25/schema.ts` | `Seedance25RequestSchema` (validate **and normalize**), `Seedance25GenerateBodySchema`, `RerenderBodySchema`, `DurationSchema`, `Seedance25CallbackSchema`, `parseSeedance25Callback`, `normalizeSeedance25Status`, `isSeedance25GenerateBody`, `resolveQualityTier`, `extractInputUrls`, `hasVideoInputs`, `isPublicHttpsUrl`, `formatZodIssues`, `SEEDANCE_25_MODE_MEDIA_FIELDS` | zod v4. |
| `lib/seedance/pricing.ts` | `SEEDANCE_25_RATES_DEFAULT`, `USD_PER_CREDIT_DEFAULT=0.001`, `AUTO_DURATION_ESTIMATE_SECONDS=10`, `SEEDANCE_20_USD_PER_SECOND`, `estimateCredits`, `creditsToUsd`, `usdToCredits`, `roundUsd`, `roundCredits`, `formatCredits`, `formatUsd`, `isReducedRateEligible`, `resolveOutputSeconds`, `coerceRateTable` | Pure. |
| `lib/settings/video-settings.ts` | `VideoSettings`, `DEFAULT_VIDEO_SETTINGS`, `VIDEO_SETTINGS_SINGLETON_ID`, `VIDEO_SETTINGS_TABLE`, `VideoSettingsSchema` (PATCH, strict), `RateTableSchema`, `mergeVideoSettings`, `loadVideoSettings(supabase)`, `getVideoSettings(supabase)`, `VideoSettingsResponse` | Client-safe; pass a Supabase client. |
| `lib/settings/use-video-settings.ts` | `useVideoSettings()` → `{ settings, loading, fromDatabase, missingTable, error, refresh }` | Client hook; GET `/api/settings/video` (package B builds the route; hook falls back to defaults until then). |
| `lib/supabase/schema-errors.ts` | `isMissingColumnError` (42703 / PGRST204), `isMissingTableError` (42P01 / PGRST205), `isSchemaMissingError`, `migrationRequiredBody`, `MIGRATION_REQUIRED_STATUS=503`, `MIGRATION_REQUIRED_CODE="migration_required"`, `SEEDANCE25_MIGRATION_FILE`, `rowHasSeedance25Columns(row)` | |
| `lib/supabase/storage.ts` | `BUCKETS.VIDEO_INPUTS="video-inputs"`, `VIDEO_INPUTS_ALLOWED_MIME`, `VIDEO_INPUTS_MAX_BYTES` | |
| `lib/seedance/mode-allowlist.ts` | engine-aware: `pickAllowed(input, mode, engine="2.0")`, `getAllowedFieldsForMode`, `getDisallowedFields`, `MODE_ALLOWLIST_V25`, `UNIVERSAL_FIELDS_V25`; 2.0 tables unchanged | |
| `components/video/seedance-v4/types.ts` | `SeedanceV4WizardState` + `engine, qualityTier, durationMode, passFaces, isUncensored, outputFormat?, bitrateMode, ugcInfluencerImageUrls[], inputImageUrls[], inputVideoUrls[], inputAudioUrls[], editInstruction?, settingsApplied?`; `mode` is now all 9; `aspectRatio` is the 7-value 2.5 union; `DEFAULT_V4_STATE` (engine 2.5, draft-720p, fixed, 8 s, 9:16, passFaces on) | Old keys kept. |
| `components/video/seedance-v4/lib/upload.ts` | `uploadVideoInput(file, kind)`, `validateVideoInputFile`, `kindForFile`, `IMAGE_INPUT_MAX_BYTES`, `VIDEO_INPUT_MAX_BYTES`; `uploadSeedanceMedia` = deprecated alias | Calls package C's routes. |
| `lib/costs/estimates.ts` | `V4CostInput.mode` = 9 modes + optional `engine, isUncensored, hasVideoInputs, inputVideoSeconds, multiFrameDurations, rates, usdPerCredit`; `V4CostBreakdown` + optional `engine, credits, creditsUsd, usdPerCredit, assumedAutoDuration`; `estimateV4Cost` prices the Seedance line in credits when `engine==="2.5"` | 2.0 numbers unchanged. |
| `lib/ai/director/types.ts` | `DirectorMode = Seedance25Mode`; `DirectorInput` + `sourceVideoUrls?, editInstruction?, referenceAudioUrls?, referenceVideoUrls?` | |
| `supabase/migrations/20260908_seedance25.sql` | THE migration (idempotent; columns, constraints, indexes, `video_settings` + seed, RLS read policy, bucket no-op) | Harry pastes it. |
| Tests | `tests/seedance-v25/{schema,pricing,engines,video-settings,migration-sql}.test.ts` (83 tests) | |

Compile-fallout files touched in Wave 0 (tiny, mechanical — the owning package may reshape freely): `lib/ai/director/system-prompts.ts` (map → `Partial<Record>`), `components/video/seedance-v4/lib/mode-capabilities.ts` (3 placeholder entries), `Step2DynamicInputs.tsx` (default placeholder branch), `Step3PromptReviewAndGenerate.tsx` (3 labels + 2 `default:` branches).

Baseline after Wave 0: `npx tsc --noEmit` clean · `npm test` 62 files / 589 tests · `npm run lint`: **0 errors in any Wave-0 file**; the repo has 37 pre-existing lint errors outside `widget/` (chatbot admin pages, `components/generate/*`, `scripts/discount-import.ts`, 4 old tests) + many in `widget/`. Rule for all waves: **do not add lint errors** (`npx eslint <your files>` must be 0 errors).

---

## 1. Architecture

### 1.1 Engines (D1)
`pipeline` stays `'seedance'` for both engines; the new `generated_videos.engine` column ('2.0' default, '2.5') discriminates. `lib/seedance/engines.ts` is the registry (base URLs, capability flags, quality tiers). 2.0 code paths (`lib/seedance/client.ts`, the legacy branch of the generate route) are untouched; 2.5 gets its own client in `lib/seedance/v25/client.ts`.

### 1.2 Generate flow (2.5)
```
Wizard (D/E) ──POST /api/seedance/generate {engine:"2.5", request, qualityTier, scriptText…}──▶ route (A)
  isSeedance25GenerateBody(body)? ──yes──▶ runSeedance25Generation()          ──no──▶ legacy 2.0 handler (unchanged)
     1 Seedance25GenerateBodySchema.parse  (400 on issues)
     2 settings = getVideoSettings(admin)   (defaults if table missing)
     3 estimate = estimateCredits({... rates, usd_per_credit})
     4 optional scriptId → video_scripts lookup (404)
     5 INSERT generated_videos (all 2.5 columns; processing_cost = estimate)   ← PGRST204/42703 ⇒ 503 migration_required, NOTHING queued
     6 createSeedance25Task(request, webhookUrl)   ONE POST /queue, NO retry
        fail ⇒ row failed + error_message ⇒ 500
     7 UPDATE seedance_task_id + status processing
     8 200 { videoId, taskId, status, engine, estimatedCost, estimate }
```
No server-side script generation and no legacy prompt planner on 2.5 — the wizard's Director output is authoritative (`request.prompt` / `multi_frame_prompts`). The lash-brand guard (prepend directive if the prompt never mentions lashes) applies to `ugc` only.

### 1.3 Webhook + status (both engines, same public route)
`POST /api/seedance/webhook` (already in the middleware public allow-list; secret via `?token=`/`x-webhook-secret`) parses the body with `parseSeedance25Callback` (works for 2.0 payloads too — they simply lack `cost`), looks the row up by `seedance_task_id` + `pipeline='seedance'`, reads `engine = row.engine ?? "2.0"`, and:
- `FAILED` → mark failed + `completed_at` (+ `error_message` only when `rowHasSeedance25Columns(row)`); idempotent on repeats.
- `COMPLETED` → `completeSeedanceVideo({ …, creditsCost: result.cost, engine })`. The existing atomic claim (`UPDATE … WHERE heygen_status IN (pending,processing,captioning)`) makes duplicate callbacks no-ops (first wins). A second COMPLETED after completion returns early; COMPLETED after FAILED is ignored by the claim.
- Never retries anything; never calls `/queue`.

`GET /api/seedance/[id]/status` branches on `engine`: `querySeedance25Task` (POST `${SEEDANCE_25_API_BASE}/status`, retry OK — idempotent) vs the existing `querySeedanceTask`. It also backfills `credits_cost` for a completed 2.5 row whose cost is still null.

### 1.4 "Re-render as Final" (D3)
`POST /api/seedance/[id]/rerender` loads the source row (must be `pipeline='seedance'`, `engine='2.5'`, `request_payload` present, `heygen_status='completed'`, `resolution != '1080p'`), copies `request_payload` (the normalized `Seedance25Request` — identical prompt + identical input URLs), sets `resolution: "1080p"`, applies the optional `duration` override (ignored for `edit`/`multi_frame`), and runs the SAME `runSeedance25Generation()` with `qualityTier: "final-1080p"`, `rerenderOf: source.id`, `scriptText/scriptId` copied. New row links via `rerender_of`.

### 1.5 Un-applied migration
There is no SQL execution path from this machine. Every write that touches a new column goes through `lib/seedance/v25/db.ts`: the 2.5 INSERT returns `503 migrationRequiredBody()` on `isSchemaMissingError` (and nothing is queued); UPDATEs of legacy rows strip the new columns and retry on `PGRST204/42703` (`safeUpdateVideo`). `GET /api/settings/video` returns defaults with `missingTable:true`; `PATCH` returns 503. The 2.0 path never writes new columns (DB default stamps `engine='2.0'`), so it works before and after the migration.

### 1.6 Cost (D4)
- **Estimate** (before Generate): `estimateCredits()` — credits/sec from the live `video_settings.rates` (seed = 01-API-REFERENCE tables), × billable seconds (output; + input-video seconds on the reduced rate for multi_reference/edit/extend/multi_frame with `videos[]`; uncensored column when `is_uncensored`). Auto (-1) is estimated on 10 s and flagged (`assumedAutoDuration`). USD = credits × `usd_per_credit`. Shown in the wizard header + Step 3 (`estimateV4Cost` → `V4CostBreakdown.credits`), stored provisionally in `processing_cost`.
- **Actual**: the 2.5 webhook/status `cost` → `credits_cost`; `processing_cost` = `creditsToUsd(cost, usd_per_credit)`. 2.0 keeps its existing estimate formula.
- **Dashboard** (Wave 2): Seedance split by engine.

### 1.7 Global settings (D5)
One `video_settings` row (`is_singleton` UNIQUE). `GET /api/settings/video` (any signed-in user) feeds the wizard's defaults on a FRESH wizard only (localStorage still remembers last-used values) and the estimator's rates. `PATCH` (admin via `requireChatAdmin`) edits defaults, `usd_per_credit`, and the rate tables.

### 1.8 Inputs & storage (D6/D7/D8)
- Bucket `video-inputs` (public, 50 MB, MIME allow-list). **Video/audio never pass through a route handler** (Vercel caps request bodies at ~4.5 MB): `POST /api/video-inputs/sign` mints a signed upload URL (service role) and the browser uploads straight to Storage (`uploadToSignedUrl`). Images (≤10 MB) go through `POST /api/video-inputs/upload` so they are normalised to PNG/JPEG (`toEnhancorCompatibleImage`).
- "From your videos": `GET /api/videos/inputs` lists completed rows with a LIVE public URL (skips dead `res.cloudinary.com/dtnvppaty/*` finals and expired `files*.heygen.ai` raws).
- "Store products": `GET /api/shopify/product-images` (Storefront API, all products with images, 15-min cache). The picker uses the CDN URLs directly (public https; proven by the POC). Seeding `sorrel`/`fern`/`ivy` into `product_reference_images` **re-hosts** the images into `brand-assets/products/shopify/<handle>-<n>.<ext>` (deterministic path, `upsert`) because `product_reference_images.storage_path` is NOT NULL, the category manager deletes by `storage_path`, and Shopify admin access is revoked (CDN URLs can change on re-upload).

---

## 2. Shared contracts (exact)

The code below is what is in the repo now (Wave 0). Full source in the files named; excerpts here are the parts executors code against.

### 2.1 Types — `lib/types/index.ts`
```ts
export type SeedanceEngine = "2.0" | "2.5";
export type QualityTier = "draft-480p" | "draft-720p" | "final-1080p";
export interface VideoInputUrls { products?: string[]; influencers?: string[]; images?: string[]; videos?: string[]; audios?: string[]; first_frame_image?: string; last_frame_image?: string; lipsyncing_audio?: string; }
// GeneratedVideo additions (ALL optional):
engine?: SeedanceEngine | null; seedance_mode?: string | null; quality_tier?: QualityTier | null; resolution?: string | null;
requested_duration?: number | null; input_urls?: VideoInputUrls | null; request_payload?: Record<string, unknown> | null;
credits_cost?: number | null; error_message?: string | null; rerender_of?: string | null;
output_format?: "mp4" | "mov" | null; bitrate_mode?: "standard" | "high" | null; is_uncensored?: boolean | null; pass_faces?: boolean | null;
// VideoStatusResponse additions (optional): engine, mode, resolution, qualityTier, requestedDuration, creditsCost, costUsd, errorMessage, rerenderOf
```

### 2.2 Engine registry — `lib/seedance/engines.ts`
```ts
SEEDANCE_25_API_BASE = "https://apireq.enhancor.ai/api/seedance2.5/v1"        // hard-coded
SEEDANCE_ENGINES["2.0"].getApiBase() → process.env.ENHANCOR_API_BASE_URL ?? "https://apireq.enhancor.ai/api/enhancor-ugc-full-access/v1"
capabilities["2.5"] = { modes: 9, durationMin 4, durationMax 30, supportsAutoDuration true, aspectRatios 7, supportsPassFaces/IsUncensored/OutputFormat/BitrateMode true, supportsFastMode/Quality false, maxImages 30, maxVideos 10, maxAudios 10, maxUgcRefs 30, webhookRequired true, retryQueue FALSE, reportsCost true }
capabilities["2.0"] = { modes: 6 (5 + text_to_video), 4–15 s, no auto, 6 aspects, fast_mode/quality yes, max 9 refs, retryQueue true (legacy), reportsCost false }
QUALITY_TIERS: draft-480p→480p, draft-720p→720p (DEFAULT), final-1080p→1080p; isDraftTier()
```

### 2.3 2.5 wire types — `lib/seedance/v25/types.ts`
```ts
SEEDANCE_25_MODES = ["ugc","text_to_video","multi_reference","first_n_last_frames","multi_frame","edit","extend","lipsyncing","voice_clone"]
SEEDANCE_25_ASPECT_RATIOS = ["21:9","16:9","4:3","1:1","3:4","9:16","adaptive"]
SEEDANCE_25_LIMITS = { durationMin:4, durationMax:30, maxImages:30, maxVideos:10, maxAudios:10, maxUgcRefs:30, maxCombinedVideoSeconds:30, maxCombinedAudioSeconds:30, lipsyncAudioMaxSeconds:30, maxMultiFrameSegments:10, maxPromptChars:6000 }
interface Seedance25Request { mode; prompt?; duration:number /* 4–30 | -1 */; resolution; aspect_ratio; images?; videos?; audios?; multi_frame_prompts?; lipsyncing_audio?; products?; influencers?; first_frame_image?; last_frame_image?; pass_faces:boolean; is_uncensored:boolean; output_format:"mp4"|"mov"; bitrate_mode:"standard"|"high" }
interface Seedance25QueuePayload extends Omit<Seedance25Request,"duration"> { duration?: string; webhook_url: string }
interface Seedance25TaskResult { requestId; status: PENDING|IN_QUEUE|IN_PROGRESS|PROCESSING|COMPLETED|FAILED; resultUrl?; thumbnailUrl?; cost?: number; error? }
```

### 2.4 Validation — `lib/seedance/v25/schema.ts`
`Seedance25RequestSchema` = validate + normalize. Per-mode rules (from 01-API-REFERENCE):

| mode | requires | accepts (media) | normalization |
|---|---|---|---|
| ugc | prompt; products and/or influencers (≥1, combined ≤30) | products, influencers | — |
| text_to_video | prompt | none | — |
| multi_reference | prompt; ≥1 of images/videos/audios | images≤30, videos≤10, audios≤10 | — |
| first_n_last_frames | prompt; first_frame_image | first_frame_image, last_frame_image | aspect → `adaptive` |
| multi_frame | multi_frame_prompts (≥1, durations sum 4–30) | images, videos, audios | duration := sum; prompt optional |
| edit | prompt; videos ≥1; **duration must be -1 (rejected otherwise)** | images, videos, audios | aspect → `adaptive`; output_format default `mov` |
| extend | prompt; videos ≥1 | images, videos, audios | aspect → `adaptive`; output_format default `mov` |
| lipsyncing / voice_clone | prompt; images ≥1; lipsyncing_audio | images, lipsyncing_audio | — |

Universal: `duration` accepts `8 | "8" | -1`, else 4–30 integer; defaults `resolution "720p"`, `aspect_ratio "9:16"`, `duration 8`, `pass_faces true`, `is_uncensored false`, `bitrate_mode "standard"`, `output_format` mp4 (mov for edit/extend). Media not accepted by the mode → error `"<field> is not accepted in <mode> mode"`. All URLs must be public https (SSRF guard). Unknown keys (`webhook_url`, `type`, `full_access`, `fast_mode`, `quality`) are stripped. Empty arrays / `""` are dropped.

```ts
Seedance25GenerateBodySchema = { engine: "2.5"; request: Seedance25RequestSchema; qualityTier?: QualityTier /* must match request.resolution */; scriptText?: ≤2500; scriptId?: uuid; campaignType?; tone?; productSku?; rerenderOf?: uuid }
RerenderBodySchema = { duration?: 4–30 | -1 }
parseSeedance25Callback(raw, fallbackRequestId?) → Seedance25TaskResult | null   // accepts request_id|requestId|id, result|video_url, thumbnail|thumbnail_url, cost number|string, error string|{message}, nested `data`
formatZodIssues(err) → "request.videos: edit mode requires at least one input video; …"
```

### 2.5 Pricing — `lib/seedance/pricing.ts`
```
standard  480p 122.2 / 123.422u   720p 269.3 / 271.993u   1080p 487.3 / 492.173u   (credits per second; u = uncensored)
reduced   480p  72.9 /  73.629u   720p 165.5 / 167.155u   1080p 292.8 / 295.728u   (videos[] on multi_reference|edit|extend|multi_frame; billable = input + output s)
1 credit = $0.001 (USD_PER_CREDIT_DEFAULT). Anchors: 1080p×30 s = 14,619 cr = $14.62 · 720p×30 s = 8,079 = $8.08 · 480p×30 s = 3,666 = $3.67 · POC 720p×6 s = 1,615.8.
estimateCredits({ engine, mode, resolution, durationSeconds /* -1 ⇒ 10 s assumed */, hasVideoInputs?, inputVideoSeconds?, isUncensored?, multiFrameDurations?, rates?, usdPerCredit? })
  → { engine, credits (3dp), usd (2dp), usdExact, usdPerCredit, creditsPerSecond, billableSeconds, outputSeconds, inputVideoSeconds, rateKind, isUncensored, assumedAutoDuration, note }
Engine "2.0": usd = SEEDANCE_20_USD_PER_SECOND[res] × s (0.10 / 0.205 / 0.41 — unchanged), credits informational.
```

### 2.6 Video settings — `lib/settings/video-settings.ts`
```ts
interface VideoSettings { id; default_engine: SeedanceEngine; default_quality_tier: QualityTier; default_duration: number /* 4–30 | -1 */; default_aspect_ratio: Seedance25AspectRatio; usd_per_credit: number; rates: Seedance25RateTable; updated_at; updated_by: string|null }
DEFAULT_VIDEO_SETTINGS = { "2.5", "draft-720p", 8, "9:16", 0.001, SEEDANCE_25_RATES_DEFAULT }
VideoSettingsSchema (PATCH, .strict(), non-empty): default_engine?, default_quality_tier?, default_duration? (-1|4–30), default_aspect_ratio?, usd_per_credit? (0<x≤1), rates? (RateTableSchema)
loadVideoSettings(supabase) → { settings, fromDatabase, missingTable, error? }   // never throws
```

### 2.7 DB — `supabase/migrations/20260908_seedance25.sql`
`generated_videos` += `engine TEXT NOT NULL DEFAULT '2.0' CHECK IN ('2.0','2.5')`, `seedance_mode TEXT`, `quality_tier TEXT CHECK`, `resolution TEXT`, `requested_duration INTEGER CHECK (-1 | 1..30)`, `input_urls JSONB`, `request_payload JSONB`, `credits_cost NUMERIC(12,3)`, `error_message TEXT`, `rerender_of UUID REFERENCES generated_videos(id) ON DELETE SET NULL`, `output_format TEXT`, `bitrate_mode TEXT`, `is_uncensored BOOLEAN`, `pass_faces BOOLEAN`; indexes on `engine`, `rerender_of`. `video_settings` (columns as §2.6 + `is_singleton UNIQUE`, `updated_by TEXT`), seed row id `00000000-0000-0000-0000-000000000002`, RLS on + `authenticated` SELECT policy. Bucket no-op insert. Everything `IF NOT EXISTS` / `DO $$` guarded.

**Row write conventions** (who sets what):

| column | 2.0 path | 2.5 generate | 2.5 rerender | completion / status / webhook |
|---|---|---|---|---|
| engine | (DB default '2.0') | '2.5' | '2.5' | read only |
| seedance_mode, quality_tier, resolution, requested_duration, input_urls, request_payload, output_format, bitrate_mode, is_uncensored, pass_faces | never written | from request | copied + resolution '1080p', quality_tier 'final-1080p' | read only |
| rerender_of | — | null | source id | — |
| processing_cost | existing estimate at completion | estimate.usdExact at insert | same | 2.5: creditsToUsd(actual) · 2.0: unchanged formula |
| credits_cost | — | null | null | 2.5: actual `cost` |
| error_message | — (safeUpdate strips it) | null | null | provider/queue error text (≤500 chars) |
| seedance_prompt | planner output | request.prompt or joined segments | copied | — |
| duration_seconds | requested VideoDuration | request.duration (null when -1) | same | — |
| aspect_ratio | requested | request.aspect_ratio (may be 'adaptive') | copied | — |

### 2.8 Allow-list — `lib/seedance/mode-allowlist.ts`
`pickAllowed(payload, mode, "2.5")` keeps per-mode fields + `UNIVERSAL_FIELDS_V25 = {mode, resolution, aspect_ratio, webhook_url, pass_faces, is_uncensored, output_format, bitrate_mode}` and strips `type/full_access/fast_mode/quality`. ugc never carries `videos/audios`; multi_frame never carries top-level `prompt/duration`. Default engine arg `"2.0"` keeps every existing call site identical.

### 2.9 Wizard state — `components/video/seedance-v4/types.ts`
```ts
engine: SeedanceEngine = "2.5"; qualityTier: QualityTier = "draft-720p"; durationMode: "fixed"|"auto" = "fixed"; duration = 8 (4–30 on 2.5, 4–15 on 2.0)
passFaces = true; isUncensored = false; outputFormat?: "mp4"|"mov" (undefined ⇒ engine default); bitrateMode = "standard"
ugcInfluencerImageUrls: string[] = []; inputImageUrls: string[] = []; inputVideoUrls: string[] = []; inputAudioUrls: string[] = []; editInstruction?: string; settingsApplied?: boolean
aspectRatio: Seedance25AspectRatio (7 values); resolution stays and MUST mirror qualityTierToResolution(qualityTier) on 2.5
// kept for 2.0 + vision agent: ugcInfluencerImageUrl (single = ugcInfluencerImageUrls[0]), ugcProductImageUrls, multiReferenceImages{url,role}, lipsyncImageUrl/lipsyncAudioUrl, firstFrameUrl/lastFrameUrl, directorPrompt, directorMultiFramePrompts, fullAccess/unrestricted/quality/fastMode
```
Invariants every UI package must keep: `ugcInfluencerImageUrl === ugcInfluencerImageUrls[0]`; `resolution === qualityTierToResolution(qualityTier)` when `engine==="2.5"`; `durationMode==="auto"` ⇒ submit `duration: -1`; `mode==="edit"` ⇒ `durationMode` forced `"auto"`; adaptive-only modes ⇒ `aspectRatio` shown locked as `adaptive` (schema coerces anyway).

### 2.10 Upload helper — `components/video/seedance-v4/lib/upload.ts`
`uploadVideoInput(file, "image"|"video"|"audio") → { url, path, kind, contentType, size }`. image → `POST /api/video-inputs/upload` (multipart `file`,`kind`); video/audio → `POST /api/video-inputs/sign` → `supabase.storage.from("video-inputs").uploadToSignedUrl(path, token, file)`.

### 2.11 API contracts (new / changed routes)

**`POST /api/seedance/generate` — engine 2.5 branch (A).** Detect with `isSeedance25GenerateBody(body)`; else legacy handler unchanged.
```ts
// request: Seedance25GenerateBodySchema input (§2.4)
// 200
{ videoId: string; taskId: string; status: "processing"; engine: "2.5";
  estimatedCost: number;                       // USD 2dp (legacy field name kept)
  estimate: { credits: number; usd: number; billableSeconds: number; rateKind: "standard"|"reduced"; assumedAutoDuration: boolean; note: string } }
// 400 { error: string }  (formatZodIssues)      // 404 { error: "Script not found" }
// 503 MigrationRequiredBody                      // 500 { error: "Seedance rejected the request: <detail>" } | { error: "Failed to create video record" }
```

**`POST /api/seedance/[id]/rerender` (A).** Body `RerenderBody`. 200 = generate response + `rerenderOf: string`. 404 not found · 409 `{ error, code: "not_rerenderable" }` (not pipeline seedance / not engine 2.5 / no request_payload / not completed / already 1080p) · 503 migration · 500 queue failure.

**`GET /api/seedance/[id]/status` (A).** `VideoStatusResponse` + the optional 2.5 fields (§2.1) populated from the row; `progress` stays 10/50/85/100.

**`POST /api/seedance/webhook` (A).** Body parsed by `parseSeedance25Callback`; responses unchanged: `{received:true, processed:boolean}`, 401 bad secret, 400 no request id.

**`GET /api/settings/video` (B).** 200 `VideoSettingsResponse = { settings: VideoSettings; fromDatabase: boolean; missingTable: boolean }` (never fails: defaults on error).
**`PATCH /api/settings/video` (B).** Body `VideoSettingsPatch`. 200 `{ ok: true; settings: VideoSettings }` · 400 `{ error: "invalid_settings"; issues: string }` · 401 `{ error: "not_authenticated" }` · 403 `{ error: "forbidden" }` · 503 migration.

**`GET /api/shopify/product-images` (C).**
```ts
{ products: Array<{ handle: string; title: string; productType: string; available: boolean; images: Array<{ url: string; alt: string | null; width?: number; height?: number }> }>; fetchedAt: string; cached: boolean }
// only PNG/JPEG originals are returned (Enhancor rejects webp/avif/gif); 503 { error: "shopify_not_configured" } · 502 { error: "shopify_unavailable" }
```

**`POST /api/video-inputs/sign` (C).** Body `{ kind: "video"|"audio"|"image"; filename: string; contentType: string; size: number }` → 200 `{ path: string; token: string; signedUrl: string; publicUrl: string; kind; contentType }` · 400 `{ error }` (MIME not in `VIDEO_INPUTS_ALLOWED_MIME`, size > 50 MB, image > 10 MB, kind/MIME mismatch) · 500.
**`POST /api/video-inputs/upload` (C).** multipart `file` (+ optional `kind`) → 200 `{ url: string; path: string; kind; contentType: string; size: number }`; images transcoded to PNG/JPEG; same 400s.
**`GET /api/videos/inputs?limit=60` (C).** 200 `{ videos: Array<{ id; url; thumbnailUrl: string|null; durationSeconds: number|null; createdAt: string; pipeline: "seedance"|"heygen"; engine: SeedanceEngine|null; mode: string|null; label: string }> }` — completed rows with a live URL only.
**`GET /api/videos?…&engine=2.0|2.5` (E).** Adds `.eq("engine", engine)`; on `isMissingColumnError` → 503 migration body.

---

## 3. Work packages

### Ownership matrix (Wave 1 — every file appears in exactly one column)

| A backend | B settings | C inputs | D wizard | E step3+gallery | F prompts |
|---|---|---|---|---|---|
| `app/api/seedance/generate/route.ts` | `app/api/settings/video/route.ts` ✚ | `app/api/video-inputs/upload/route.ts` ✚ | `components/video/seedance-v4/SeedanceV4Wizard.tsx` | `components/video/seedance-v4/Step3PromptReviewAndGenerate.tsx` | `lib/prompts/scripts/seedance.ts` |
| `app/api/seedance/webhook/route.ts` | `components/settings/VideoDefaultsForm.tsx` ✚ | `app/api/video-inputs/sign/route.ts` ✚ | `…/Step1ScriptAndMode.tsx` | `…/lib/build-request.ts` ✚ | `lib/ai/director/system-prompts.ts` |
| `app/api/seedance/[id]/status/route.ts` | `lib/costs/format.ts` ✚ | `app/api/videos/inputs/route.ts` ✚ | `…/Step2DynamicInputs.tsx` | `…/SeedanceGenerationProgress.tsx` ✚ | `lib/ai/director/seedance-director.ts` |
| `app/api/seedance/[id]/rerender/route.ts` ✚ | `app/(protected)/settings/page.tsx` | `app/api/shopify/product-images/route.ts` ✚ | `…/ProductReferencePicker.tsx` | `components/video/RerenderButton.tsx` ✚ | `lib/ai/director/seedance-vision-director.ts` |
| `lib/seedance/v25/client.ts` ✚ | `components/video/seedance-v4/CostBreakdown.tsx` | `lib/video-inputs/validation.ts` ✚ | `…/EnhancorSettingsPanel.tsx` | `lib/video/display.ts` ✚ | `lib/ai/director/types.ts` |
| `lib/seedance/v25/generate.ts` ✚ | `tests/seedance-v25/settings-video-route.test.ts` ✚ | `lib/video/input-sources.ts` ✚ | `…/modes/*.tsx` (6 existing + `EditExtendMode.tsx` ✚ + `VoiceCloneMode.tsx` ✚) | `components/video/VideoCard.tsx` | `app/api/seedance/director/route.ts` |
| `lib/seedance/v25/db.ts` ✚ | `tests/seedance-v25/cost-format.test.ts` ✚ | `scripts/seed-shopify-references.ts` ✚ | `…/EngineModeSelector.tsx` ✚, `…/OutputSettingsPanel.tsx` ✚ | `components/video/VideoModal.tsx` | `app/api/seedance/director-vision/route.ts` |
| `lib/seedance/webhook-url.ts` ✚ | | `lib/shopify/storefront.ts`, `lib/shopify/types.ts` | `…/pickers/{MediaListPicker,ImageMultiPicker,FromYourVideosGrid}.tsx` ✚ | `app/(protected)/video/gallery/page.tsx` | `components/video/seedance-v4/lib/mode-capabilities.ts` |
| `lib/seedance/completion.ts` | | `lib/brand/product-truth.ts` | `…/lib/{apply-settings,mode-input-rules}.ts` ✚ | `app/api/videos/route.ts` | `lib/seedance/prompt-planner.ts` |
| `lib/costs/tracker.ts` (recordActualCost only) | | `lib/supabase/storage.ts` (add one helper) | `components/ui/{slider,collapsible}.tsx` ✚ | `lib/video/reconcile.ts` | `lib/ai/__tests__/director-prompts.test.ts` |
| `tests/seedance-v25/{client-payload,generate-route-v25,webhook-v25,status-route-v25,rerender-route,completion-cost,db-migration-guard}.test.ts` ✚ | | `scripts/seed-sorrel-references.ts` (delete) | `components/video/seedance-v4/types.ts` (ADDITIVE only) | `tests/seedance-v25/{build-request,display}.test.ts` ✚ | `tests/prompts/seedance-duration-sizing.test.ts` |
| | | `tests/brand/sorrel-reference-images.test.ts`, `tests/brand/category-key-coverage.test.ts` | `components/video/PipelineSelector.tsx`, `app/(protected)/video/page.tsx` | `tests/video/videos-list-engine-filter.test.ts` ✚, `tests/video/gallery-reconcile.test.ts` | `tests/seedance-v25/{script-sizing-30s,director-new-modes,director-route-schema}.test.ts` ✚ |
| | | `tests/seedance-v25/{video-inputs-validation,input-sources,shopify-product-images,video-inputs-routes}.test.ts` ✚ | `tests/seedance-v25/{wizard-apply-settings,mode-input-rules}.test.ts` ✚ | | |

✚ = new file. Frozen for Wave 1 (nobody edits): everything in §0 except where listed above, `lib/seedance/client.ts`, `lib/seedance/types.ts`, `lib/seedance/reference-resolver.ts`, `app/api/seedance/check-references/route.ts`, `lib/costs/estimates.ts`, `middleware.ts`, `next.config.ts`.

Wave 2: **G** cost dashboard (`lib/costs/tracker.ts` getMonthlyCostSummary, `components/settings/CostSummary.tsx`, `app/api/costs/route.ts`), **H** end-to-end verification (`scripts/smoke-seedance25.ts` ✚ + fixes routed by the orchestrator), **I** docs (`docs/seedance-2.5/04-SHIPPED.md` ✚, `.env.example`).

---

### Package A — Backend: 2.5 client, generate branch, webhook/status, completion cost, re-render (size L)

**Goal.** A Seedance 2.5 job can be queued from `POST /api/seedance/generate` `{engine:"2.5",…}`, completes via the shared webhook or status polling with the real credit cost recorded, can be re-rendered as Final, and returns a clear 503 when the migration is missing — while Seedance 2.0 keeps working byte-for-byte.

**Context — import these.** `@/lib/seedance/engines` (`SEEDANCE_25_API_BASE`, `getEngine`), `@/lib/seedance/v25/types`, `@/lib/seedance/v25/schema` (`Seedance25GenerateBodySchema`, `isSeedance25GenerateBody`, `resolveQualityTier`, `extractInputUrls`, `hasVideoInputs`, `parseSeedance25Callback`, `RerenderBodySchema`, `formatZodIssues`), `@/lib/seedance/pricing` (`estimateCredits`, `creditsToUsd`), `@/lib/seedance/mode-allowlist` (`pickAllowed(payload, mode, "2.5")`), `@/lib/settings/video-settings` (`getVideoSettings`), `@/lib/supabase/schema-errors` (all), `@/lib/seedance/types` (`SeedanceError`), `@/lib/supabase/server` (`createAdminClient`), existing `@/lib/seedance/completion`, `@/lib/costs/tracker`. Read `app/api/poc/seedance25/route.ts` for the proven request shape; read the existing 2.0 `lib/seedance/client.ts` for the error-parsing style to mirror.

**Owned files.** See matrix column A. Do NOT touch: `lib/seedance/client.ts`, `lib/seedance/types.ts`, `lib/seedance/reference-resolver.ts`, `check-references/route.ts`, anything under `components/`, `lib/costs/estimates.ts`, `getMonthlyCostSummary` in tracker.ts (Wave 2 G).

**Steps.**
1. `lib/seedance/webhook-url.ts`: move `getEnhancorWebhookUrl()` out of the generate route verbatim (env `ENHANCOR_WEBHOOK_URL` else `${NEXT_PUBLIC_APP_URL}/api/seedance/webhook`, `?token=${ENHANCOR_WEBHOOK_SECRET}`); import it in the generate route and in v25.
2. `lib/seedance/v25/client.ts`:
   ```ts
   export function buildSeedance25QueuePayload(request: Seedance25Request, webhookUrl: string): Seedance25QueuePayload
   // { ...request, duration: String(request.duration), webhook_url } → pickAllowed(payload, request.mode, "2.5") (strips top-level prompt/duration for multi_frame, etc.)
   export async function createSeedance25Task(request, webhookUrl, opts?: { signal?: AbortSignal }): Promise<{ requestId: string; payload: Seedance25QueuePayload }>
   // ONE fetch to `${SEEDANCE_25_API_BASE}/queue`, header x-api-key (throw SeedanceError "missing_api_key" if unset), 60 s AbortController; NO withRetry; log the payload like 2.0 does but with webhook_url REDACTED (never log the token); requestId = requestId ?? request_id ?? id ?? data.*; on !ok throw SeedanceError(`Enhancor 2.5 API error (${status}): …`, status, errorText)
   export async function querySeedance25Task(requestId: string): Promise<Seedance25TaskResult>
   // POST `${SEEDANCE_25_API_BASE}/status` {request_id}; one retry after 1 s on 500/503 is fine (idempotent); parseSeedance25Callback(json, requestId) ?? throw SeedanceError("invalid_response")
   ```
3. `lib/seedance/v25/db.ts`:
   ```ts
   export const SEEDANCE25_COLUMNS = ["engine","seedance_mode","quality_tier","resolution","requested_duration","input_urls","request_payload","credits_cost","error_message","rerender_of","output_format","bitrate_mode","is_uncensored","pass_faces"] as const;
   export async function safeUpdateVideo(supabase, id, patch): Promise<{ error: PostgrestLikeError|null; strippedColumns: boolean }>  // retry without SEEDANCE25_COLUMNS on isMissingColumnError
   export async function insertSeedance25Row(supabase, row): Promise<{ ok: true; id: string } | { ok: false; migrationRequired: boolean; error: PostgrestLikeError }>
   export async function findSeedanceVideoByTaskId(supabase, requestId): Promise<GeneratedVideo | null>  // .eq("seedance_task_id").eq("pipeline","seedance").maybeSingle()
   ```
4. `lib/seedance/v25/generate.ts`: `export async function runSeedance25Generation(body: Seedance25GenerateBody): Promise<NextResponse>` implementing §1.2 exactly (steps 1–8; the lash-guard for ugc only; `seedance_prompt` = `request.prompt` or `multi_frame_prompts.map((s,i)=>\`Shot ${i+1} (${s.duration}s): ${s.prompt}\`).join("\n\n")`; `person_image_url` = influencers[0] ?? images[0] ?? first_frame_image ?? null; `product_image_url` = products[0] ?? null; `duration_seconds` = duration === -1 ? null : duration; `audio_url` = lipsyncing_audio ?? audios?.[0] ?? null; `audio_mode` "script-in-prompt"; `script_text_cache`; `background_type` = campaignType ?? null). Also export `handleSeedance25Generate(rawBody: unknown)` = safeParse → 400 or run. Truncate `error_message` to 500 chars.
5. `app/api/seedance/generate/route.ts`: after `request.json()`, `if (isSeedance25GenerateBody(body)) return handleSeedance25Generate(body);` — nothing else in the legacy handler changes (besides importing `getEnhancorWebhookUrl` from the new module).
6. `lib/seedance/completion.ts`: add params `creditsCost?: number | null; engine?: SeedanceEngine`. After the claim succeeds: if `engine === "2.5"` → `settings = await getVideoSettings(supabase)`; if `creditsCost != null` → `usd = creditsToUsd(creditsCost, settings.usd_per_credit)`, `recordActualCost(video.id, usd, { credits: creditsCost })`; else leave the provisional `processing_cost`. 2.0 branch unchanged. Return object includes `credits_cost`.
7. `lib/costs/tracker.ts`: `recordActualCost(videoId, cost, opts?: { credits?: number | null })` → update `{ processing_cost, ...(credits!=null && { credits_cost: Number(credits.toFixed(3)) }) }`; on `isMissingColumnError` retry without `credits_cost`. Leave `getMonthlyCostSummary` alone.
8. Webhook route (§1.3): `parseSeedance25Callback(payload)`; `findSeedanceVideoByTaskId`; FAILED via `safeUpdateVideo` with `error_message` (only include when `rowHasSeedance25Columns(video)`); COMPLETED → `completeSeedanceVideo({…, creditsCost: result.cost, engine: video.engine ?? "2.0"})`.
9. Status route (§1.3): engine branch; FAILED writes `error_message` via safeUpdate; completed 2.5 row with `credits_cost == null` and a task id → one `querySeedance25Task` → if `cost` → `recordActualCost` (best-effort); `buildStatusResponse` fills the optional fields from the row (`costUsd` = processing_cost).
10. Rerender route (§1.4): `RerenderBodySchema`; load row; 409 rules; build `{ engine:"2.5", request:{...request_payload, resolution:"1080p", ...(duration override)}, qualityTier:"final-1080p", scriptText: row.script_text_cache ?? undefined, scriptId: row.script_id ?? undefined, campaignType: row.background_type ?? undefined, rerenderOf: row.id }` → `Seedance25GenerateBodySchema.safeParse` (400 with issues if the stored payload no longer validates) → `runSeedance25Generation`. Response adds `rerenderOf`.

**Tests (vitest, node env; follow `tests/seedance-director/generate-with-resolver.test.ts` for `vi.mock("@/lib/supabase/server")` chains, `tests/heygen/v3-generate.test.ts` for global fetch capture, `tests/seedance/completion-no-captions.test.ts` for the thenable claim mock).**
- `client-payload.test.ts`: payload for the POC ugc request equals `{mode,prompt,duration:"8",resolution,aspect_ratio,webhook_url,pass_faces,is_uncensored,output_format,bitrate_mode,products,influencers}` (no `type`, no `full_access`); multi_frame payload has no top-level `prompt`/`duration`; edit payload duration `"-1"` + `aspect_ratio "adaptive"` + `output_format "mov"`; `createSeedance25Task` performs EXACTLY ONE fetch even when the response is 503 (assert `fetch` call count 1, rejects with SeedanceError); logs never contain the `token=` value; `querySeedance25Task` parses `{success,requestId,status:"COMPLETED",result,thumbnail,cost:1615.8}`.
- `generate-route-v25.test.ts`: POST with `{engine:"2.5"}` bypasses the legacy validator (no `personImageUrl` error); invalid request → 400 with `formatZodIssues` text; insert error `{code:"PGRST204"}` → 503 `code:"migration_required"` and `fetch` NOT called; happy path inserts the 2.5 columns (assert `insert` arg contains `engine:"2.5"`, `request_payload.mode`, `input_urls.products`, `quality_tier:"draft-720p"`, `requested_duration:8`), calls queue once, updates `seedance_task_id`, returns `estimate.credits === 2154.4` for 720p×8 s; queue failure → row `failed` + `error_message` + 500; legacy body (no `engine`) still reaches the 2.0 path (mock `createSeedanceTask` called).
- `webhook-v25.test.ts`: COMPLETED with cost → `completeSeedanceVideo` receives `creditsCost 1615.8` and `engine "2.5"`; same payload twice → `processVideo` mocked once (second call sees `heygen_status: "completed"`); FAILED on a pre-migration row (no `credits_cost` key) → update patch has NO `error_message`; FAILED on a post-migration row → `error_message` set; bad token → 401; missing id → 400; 2.0 payload without `cost` still completes.
- `status-route-v25.test.ts`: engine 2.5 row → `querySeedance25Task` called (not `querySeedanceTask`); response includes `engine, mode, creditsCost`; completed row with null credits → status poll backfills.
- `rerender-route.test.ts`: 409 for 2.0 row / no payload / already 1080p / not completed; happy path builds request with `resolution "1080p"`, keeps prompt + products byte-identical, sets `rerender_of`, `quality_tier "final-1080p"`; duration override applied except for edit.
- `completion-cost.test.ts`: 2.5 + cost → `recordActualCost(id, 1.6158, {credits:1615.8})` (usd_per_credit from mocked settings 0.001); 2.5 without cost → no recordActualCost; 2.0 → legacy formula unchanged (existing test still green).
- `db-migration-guard.test.ts`: `safeUpdateVideo` retries without the 14 columns on PGRST204 and reports `strippedColumns:true`; `insertSeedance25Row` maps 42703 → `migrationRequired:true`.

**Acceptance.** All existing `tests/seedance*/**` stay green unchanged. `curl -X POST /api/seedance/generate` with a 2.5 body on a DB without the migration returns 503 + the file path and Enhancor is not called. With the migration, a 480p 4 s ugc job queues (one POST), the row shows engine 2.5 + payload, status polling completes it with `credits_cost ≈ 488.8`, and the webhook delivered twice does not re-process. `POST …/rerender` on that row creates a linked 1080p row.

**Gotchas.** Never retry `/queue` (double billing). Never persist or log `webhook_url` (it carries the secret) — store the normalized request (no webhook) as `request_payload`. `pickAllowed` strips unknown fields — build the payload from the NORMALIZED request only. Insert BEFORE queue (a failed insert must never bill). Keep `select("*")` (never select new columns by name in shared paths). `duration` on the wire is a string (`"8"`, `"-1"`), proven by the POC. `maxDuration = 300` stays on the generate route; add `export const runtime = "nodejs"` to the rerender route. Finder `" 2"` files: ignore.

---

### Package B — Global video defaults + pricing settings, cost display (size M)

**Goal.** Admins edit engine/tier/duration/aspect defaults, `usd_per_credit` and the credit tables under Settings; the wizard's cost widgets show credits and ≈USD (and the "Auto assumes 10 s" note); the estimator reads live rates.

**Context — import these.** `@/lib/settings/video-settings` (everything), `@/lib/settings/use-video-settings`, `@/lib/seedance/pricing` (`estimateCredits`, `formatCredits`, `formatUsd`, `SEEDANCE_25_RATES_DEFAULT`), `@/lib/seedance/engines` (`QUALITY_TIERS`, `SEEDANCE_ENGINES`), `@/lib/supabase/schema-errors`, `@/lib/chat/admin-auth` (`requireChatAdmin`), `@/lib/chat/error` (`ChatError`), `@/lib/supabase/server`. Templates: `app/api/chatbot/admin/settings/route.ts` (admin PATCH), `app/api/settings/captions/route.ts` (lazy seed), `components/settings/CaptionSettingsForm.tsx` (collapsible card, Save/Reset pattern, `toast`).

**Owned files.** Matrix column B. Do NOT touch: any wizard file except `CostBreakdown.tsx`, `lib/costs/estimates.ts`, `lib/settings/*` (Wave 0), `tracker.ts`, `CostSummary.tsx` (Wave 2).

**Steps.**
1. `app/api/settings/video/route.ts` (`runtime = "nodejs"`): `GET` → `createAdminClient()` → `loadVideoSettings` → 200 `{settings, fromDatabase, missingTable}`. `PATCH` → `createClient()` → `requireChatAdmin` (map `ChatError` → its status with `{error: err.code}`) → `VideoSettingsSchema.safeParse` (400 `{error:"invalid_settings", issues}`) → `createAdminClient().from("video_settings").update({...patch, updated_at: new Date().toISOString(), updated_by: admin.authUserId}).eq("is_singleton", true).select().maybeSingle()`; if `isMissingTableError` → 503 `migrationRequiredBody`; if no row → `.upsert({ id: VIDEO_SETTINGS_SINGLETON_ID, is_singleton: true, ...patch, updated_by }, { onConflict: "is_singleton" }).select().single()`; 200 `{ ok:true, settings: mergeVideoSettings(row) }`.
2. `lib/costs/format.ts` (pure): `describeCostBreakdown(b: V4CostBreakdown): { headline: string /* "≈ $8.10" */; creditsLine?: string /* "8,079 credits · ≈ $8.08 video" */; note?: string /* "Auto duration — estimated on 10 s" */ }`, `formatCreditsAndUsd(credits, usdPerCredit)`.
3. `CostBreakdown.tsx`: headline variant shows `headline` + `creditsLine` (small, `text-coco-brown-medium/60`) when `breakdown.engine === "2.5"`; detailed variant adds a credits row under the Seedance item and the Auto note. Props unchanged (`breakdown`, `variant`, `className`, `showEstimateBadge`).
4. `components/settings/VideoDefaultsForm.tsx` (`"use client"`): collapsible card (icon `Clapperboard`/`Sparkles`), loads via `useVideoSettings()`; fields: Engine (select 2.5/2.0 with `SEEDANCE_ENGINES[id].label`), Default tier (3 tiles from `QUALITY_TIERS`), Default duration (number 4–30 + "Auto" checkbox → -1), Default aspect (select of `SEEDANCE_25_ASPECT_RATIOS`), USD per credit (number, step 0.0001), Rate tables (two 3×2 grids, numeric inputs, "Reset to Enhancor 2026-09 rates" button = `SEEDANCE_25_RATES_DEFAULT`), live preview line "1080p × 30 s ≈ {formatCredits} credits ≈ {formatUsd}" computed with the form's current values via `estimateCredits`. Save → PATCH only the changed keys (schema is strict/non-empty); toast success/error; `refresh()` afterwards. `missingTable` → amber banner "Run supabase/migrations/20260908_seedance25.sql — settings are read-only until then" (disable Save). Prop `isAdmin: boolean`: non-admins see values read-only with "Ask an admin to change these".
5. `app/(protected)/settings/page.tsx`: mount `<VideoDefaultsForm isAdmin={isAdmin} />` directly above `<CostSummary />`.

**Tests.** `settings-video-route.test.ts` (mock `@/lib/supabase/server` + `@/lib/chat/admin-auth`): GET returns defaults with `missingTable:true` on PGRST205 and status 200; PATCH without admin → 401/403; PATCH `{bogus:1}` → 400; PATCH `{default_duration: 31}` → 400; PATCH valid → update called with `updated_by` and returns merged settings (NUMERIC strings coerced); PATCH on missing table → 503 `migration_required`. `cost-format.test.ts`: 2.5 breakdown → `creditsLine` contains "8,079 credits"; Auto → note; 2.0 breakdown → no creditsLine.

**Acceptance.** Settings page shows the new card; admin edits usd_per_credit to 0.002 → wizard header estimate doubles after refresh (D wires rates → for B: `describeCostBreakdown` is what renders). Non-admin PATCH is refused. All 2.0 cost widgets look identical to before.

**Gotchas.** `video_settings.rates` is JSONB → send the whole table object on change. `usd_per_credit` comes back as a string from PostgREST — `mergeVideoSettings` handles it; use it. Design tokens: `rounded-2xl border border-coco-beige-dark bg-white p-6` card, `text-sm font-semibold text-coco-brown` header, primary `bg-coco-golden text-white hover:bg-coco-golden-dark`.

---

### Package C — Inputs: video-inputs upload/sign, "From your videos", Shopify product images, Sorrel/Fern/Ivy (size L)

**Goal.** Audio/video/image reference inputs actually work (bucket `video-inputs`), users can pick existing finished videos, the product picker can pull live Shopify images, and `sorrel`/`fern`/`ivy` exist as reference categories with Sorrel resolving to its own dark-brown shots.

**Context — import these.** `@/lib/supabase/storage` (`BUCKETS.VIDEO_INPUTS`, `VIDEO_INPUTS_ALLOWED_MIME`, `VIDEO_INPUTS_MAX_BYTES`, `uploadProductImage`), `@/lib/image-processing/enhancor-image` (`toEnhancorCompatibleImage`), `@/lib/supabase/server` (`createAdminClient`), `@/lib/seedance/v25/schema` (`isPublicHttpsUrl`), `@/lib/shopify/storefront` (existing `gqlFetch` pattern, `LruCache`), `@/lib/brand/product-truth`. Existing route templates: `app/api/products/upload/route.ts`, `app/api/images/upload/route.ts`. The client helper that calls your routes is already written: `components/video/seedance-v4/lib/upload.ts` (read it — its request/response expectations are the contract, §2.10/§2.11).

**Owned files.** Matrix column C. Do NOT touch: any `components/video/**` file, `lib/seedance/**`, `middleware.ts`, `next.config.ts`.

**Steps.**
1. `lib/video-inputs/validation.ts` (pure): `type VideoInputKind`; `kindForMime(contentType)`; `validateVideoInput({ kind, contentType, size, filename }) → { ok: true; ext: string } | { ok: false; error: string }` (MIME ∈ `VIDEO_INPUTS_ALLOWED_MIME`, kind matches MIME family, size ≤ 50 MB, image ≤ 10 MB, filename sanitised); `buildVideoInputPath(kind, ext, now = new Date()) → "video/2026/09/<uuid>.mp4"`; `EXT_BY_MIME`.
2. `app/api/video-inputs/sign/route.ts` (POST, `runtime = "nodejs"`): parse JSON with a small zod schema, `validateVideoInput`, `path = buildVideoInputPath`, `admin.storage.from(BUCKETS.VIDEO_INPUTS).createSignedUploadUrl(path)` → `{ path, token, signedUrl, publicUrl: admin.storage.from(bucket).getPublicUrl(path).data.publicUrl, kind, contentType }`.
3. `app/api/video-inputs/upload/route.ts` (POST multipart): `file` + optional `kind` (derive from MIME); validate; image → `toEnhancorCompatibleImage`; upload `{ contentType, cacheControl: "3600", upsert: false }`; respond `{ url, path, kind, contentType, size }`. Document in a header comment that Vercel caps bodies at ~4.5 MB, so the wizard only sends images here.
4. `lib/video/input-sources.ts` (pure): `DEAD_VIDEO_HOST_RULES` (cloudinary path `/dtnvppaty/`; hosts `files.heygen.ai`, `files2.heygen.ai`); `pickPlayableUrl(video: Pick<GeneratedVideo,"final_video_url"|"raw_video_url">): string | null` (first of final → raw that is public https and not dead); `toVideoInputCandidate(video): VideoInputCandidate | null` (label = `${engineLabel} · ${mode ?? campaign} · ${duration}s · ${date}`).
5. `app/api/videos/inputs/route.ts` (GET): `createAdminClient().from("generated_videos").select("*").eq("heygen_status","completed").order("created_at",{ascending:false}).limit(200)` → map/filter → slice(`limit` ≤ 100, default 60) → `{ videos }`.
6. `lib/shopify/types.ts`: `ShopifyProduct.images?: ShopifyProductImage[]` (+ optional `width/height` on `ShopifyProductImage`). `lib/shopify/storefront.ts`: add `images(first: 20) { nodes { url altText width height } }` to `PRODUCT_FRAGMENT` (flatten `.nodes` in `normalizeProduct`, additive — chat code ignores it) and `export async function listProductsWithImages(first = 50): Promise<ShopifyProduct[]>` (paginate with `after` until `hasNextPage` false or 250 products; own 15-min cache key `all-products`; on 429 return cached or `[]`).
7. `app/api/shopify/product-images/route.ts` (GET): map products → §2.11 shape; keep only images whose `new URL(url).pathname` ends in `.png|.jpg|.jpeg`; `503 shopify_not_configured` when `ShopifyError.code === "missing_api_key"`, `502 shopify_unavailable` otherwise.
8. `lib/brand/product-truth.ts`: `ProductCategoryKey` += `"sorrel" | "fern" | "ivy" | "custom-uploads"`; `KNOWN_PRODUCT_CATEGORY_KEYS` += `sorrel, fern, ivy` (leave `custom-uploads` out of KNOWN if `category-key-coverage.test.ts` enumerates seeded keys — check); `sorrel.categoryKey = "sorrel"` (sorrel-4pack stays `multi-lash-book`); add `fern` and `ivy` entries (`displayName` "Fern Half Lash Kit" / "Ivy Half Lash Kit", `productHandle` "fern"/"ivy", `categoryKey` same, `lashType: "kit"`, `bandMaterial: "cotton"`, `magneticClosure: false`, `packagingType: "half lash kit box"`, `colorTone: "black"`, `retired: false`; fill `kitContents` only from the live Shopify description printed by the seed script's `--dry-run`).
9. `lib/supabase/storage.ts`: add `uploadProductImageToPath(supabase, file, storagePath, { upsert = true })` returning `{ url, path }` WITHOUT a `?t=` cache-buster (deterministic public URL). Nothing else in that file changes.
10. `scripts/seed-shopify-references.ts` (`npx tsx scripts/seed-shopify-references.ts --handles sorrel,fern,ivy [--dry-run]`, env `.env.local`): for each handle → `getProductByHandle` (now with images) → ensure `product_categories` row (`key=handle`, `label=title`, `description=productType + first 200 chars`, `sort_order 50+`) → for each PNG/JPEG image `n` → fetch bytes → `toEnhancorCompatibleImage` → `uploadProductImageToPath(…, "products/shopify/<handle>-<n>.<ext>")` → insert `product_reference_images` unless a row with that `image_url` exists (idempotent). Print counts + the product description (so step 8's kitContents can be filled). Delete `scripts/seed-sorrel-references.ts` (superseded).
11. Tests: update `tests/brand/sorrel-reference-images.test.ts` (expect `categoryKey "sorrel"`; keep colour/packaging assertions) and `tests/brand/category-key-coverage.test.ts` if it pins the singles→tray rule (add the sorrel exception) — say so in your report.

**Tests.** `video-inputs-validation.test.ts` (MIME/kind/size matrix, path format, 51 MB rejected, 10.1 MB image rejected, `image/webp` accepted for upload route input); `input-sources.test.ts` (dead cloudinary skipped → raw cloudfront used; heygen expired → null; label format); `video-inputs-routes.test.ts` (sign: bad MIME 400, ok → `{path,token,signedUrl,publicUrl}` with mocked `createSignedUploadUrl`; upload: non-multipart 400, image transcoded (mock `toEnhancorCompatibleImage`) and uploaded to `video-inputs`); `shopify-product-images.test.ts` (mock `listProductsWithImages`: webp filtered, shape, 503 on missing key, 502 on ShopifyError).

**Acceptance.** Uploading a 30 MB .mp4 from the wizard lands in `video-inputs/video/…` and the returned URL plays. `GET /api/videos/inputs` lists finished Seedance videos with working URLs and none from the dead Cloudinary account. `GET /api/shopify/product-images` returns Sorrel (6), Fern (8), Ivy (7) with `cdn.shopify.com` PNG/JPEG URLs. After running the seed script, `/api/product-categories` includes `sorrel`, `fern`, `ivy` with re-hosted `brand-assets` URLs, and `getProductTruthBySku("sorrel").categoryKey === "sorrel"`.

**Gotchas.** `product_reference_images.storage_path` is NOT NULL — always re-host for seeded rows. `brand-assets` caps at 5 MB / image MIME only — never send audio/video there. Shopify CDN `?v=` query strings are part of the URL; keep them. `toEnhancorCompatibleImage` uses `sharp` → server only. Never select the new `generated_videos` columns by name (use `select("*")`) so the inputs route works pre-migration. Do not add `cdn.shopify.com` to `next.config.ts` — pickers render `<img>` (D's rule).

---

### Package D — Wizard UI: engine, 9 modes, tiers, duration/Auto, aspect, Advanced, multi-select inputs, Store products, video/audio pickers (size L)

**Goal.** Step 1 lets the user choose engine (2.5 default) and any of the nine modes, Draft/Final tier, 4–30 s or Auto, all seven aspects, and the Advanced flags; Step 2 shows exactly the inputs each mode accepts with multi-select and live counters; product picker gains a "Store products" tab; video/audio pickers support upload, "From your videos" and URL paste. Global defaults seed a fresh wizard; localStorage still remembers last-used values.

**Context — import these.** `@/components/video/seedance-v4/types` (state, §2.9), `@/lib/seedance/engines` (registry, tiers, `isAdaptiveOnlyMode`, `isDurationValidForEngine`), `@/lib/seedance/v25/types` (`SEEDANCE_25_MODES`, `SEEDANCE_25_MODE_LABELS`, `SEEDANCE_25_LIMITS`, `SEEDANCE_25_ASPECT_RATIOS`), `@/lib/seedance/v25/schema` (`SEEDANCE_25_MODE_MEDIA_FIELDS`, `isPublicHttpsUrl`), `@/lib/settings/use-video-settings`, `@/lib/costs/estimates` (`estimateV4Cost` — pass `engine, isUncensored, hasVideoInputs, multiFrameDurations, rates, usdPerCredit`), `@/components/video/seedance-v4/lib/upload` (`uploadVideoInput`, `validateVideoInputFile`), `@/components/video/seedance-v4/lib/mode-capabilities` (read-only; F rewrites copy), `radix-ui` (`Slider`, `Collapsible` — wrappers you create in `components/ui/`). API contracts you consume (built by C in parallel — code against §2.11, do not import from C): `GET /api/videos/inputs`, `GET /api/shopify/product-images`, `POST /api/video-inputs/*` (via `uploadVideoInput`). Design system: `app/globals.css` `coco-*` tokens; patterns in `Step1ScriptAndMode.tsx` (section card), `UgcMode.tsx` `TabBtn` (pill tabs), `EnhancorSettingsPanel.tsx` (option tiles).

**Owned files.** Matrix column D. Do NOT touch: `Step3PromptReviewAndGenerate.tsx`, `CostBreakdown.tsx`, `lib/**` (except reading), `components/video/VideoCard.tsx`/`VideoModal.tsx`, gallery page, `mode-capabilities.ts`. `types.ts` may gain NEW keys only (never rename/remove Wave-0 keys; E reads it).

**Steps.**
1. `components/ui/slider.tsx`, `components/ui/collapsible.tsx`: thin shadcn-style wrappers over `Slider`/`Collapsible` from `"radix-ui"` (same import style as `components/ui/switch.tsx`), coco-golden track/thumb.
2. `components/video/seedance-v4/lib/mode-input-rules.ts` (pure, tested): `isModeAvailable(engine, mode)`, `inputLimitsFor(engine, mode) → { images, videos, audios, products, influencers, ugcCombined }`, `effectiveResolution(state)` (2.5 → `qualityTierToResolution`, 2.0 → `state.resolution`), `effectiveDuration(state)` (auto → -1; edit → -1), `effectiveScriptDuration(state)` (auto/edit → 10, else duration — always ≥4, this is what `SeedanceScriptStep` and `/api/scripts` receive), `needsScript(mode)` (ugc, multi_reference, multi_frame, first_n_last_frames → true; text_to_video, lipsyncing, voice_clone, edit, extend → optional), `coerceStateForEngine(state, engine)` (switching to 2.0: mode not available → "ugc", aspect not in 2.0 list → "9:16", duration > 15 → 15, durationMode "fixed"; switching to 2.5: no changes), `coerceStateForMode(state, mode)` (edit → durationMode "auto"; adaptive-only → aspectRatio "adaptive"; leaving adaptive-only with aspect "adaptive" → "9:16").
3. `components/video/seedance-v4/lib/apply-settings.ts` (pure, tested): `applyVideoSettingsToState(state, settings) → Partial<state>`: `engine`, `qualityTier` (+ `resolution`), `duration`/`durationMode` (-1 → auto with duration 8), `aspectRatio`, `settingsApplied: true`. Wizard applies it ONCE when localStorage had no saved state (or `settingsApplied` is falsy AND the stored state is the pristine default) — never on a returning user.
4. `SeedanceV4Wizard.tsx`: call `useVideoSettings()`; after hydration, if no stored state → `setStateRaw(prev => ({...prev, ...applyVideoSettingsToState(prev, settings)}))` once settings are loaded. `STEP3_OWNED_KEYS` += `qualityTier, passFaces, isUncensored, outputFormat, bitrateMode, settingsApplied` (do NOT add `engine`, `mode`, `duration`, `durationMode` — they change the Director's brief). Headline estimate: `estimateV4Cost({ mode, durationSeconds: effectiveDuration(state), resolution: effectiveResolution(state), engine: state.engine, isUncensored: state.isUncensored, hasVideoInputs: state.inputVideoUrls.length>0, multiFrameDurations: state.directorMultiFramePrompts?.map(s=>s.duration), rates: settings.rates, usdPerCredit: settings.usd_per_credit, …existing flags })`.
5. `EngineModeSelector.tsx`: segmented control "Seedance 2.5 (default) · Seedance 2.0 (legacy)"; mode tiles for `SEEDANCE_ENGINES[engine].capabilities.modes` in `SEEDANCE_25_MODES` order with `SEEDANCE_25_MODE_LABELS` + one-line `MODE_CAPABILITIES[mode].bestFor`; unavailable modes hidden on 2.0; selecting applies `coerceStateForMode`; engine switch applies `coerceStateForEngine` and toasts what changed.
6. `OutputSettingsPanel.tsx` (replaces the inline "Video Settings" block in Step 1): 2.5 → tier tiles (`QUALITY_TIERS`, labels + `estimateCredits` mini-preview per tile for the current duration), duration `Slider` 4–30 + "Auto" toggle (disabled+forced for `edit`; hidden for `multi_frame` with note "sum of segments, set in Step 3"), aspect tiles (7; locked to `adaptive` with note for adaptive-only modes), `Collapsible` "Advanced": Pass faces (`passFaces`, default on), "Unrestricted content (NSFW)" (`isUncensored`, default off, shows "uncensored rate" note), Output format (select: "Engine default" / mp4 / mov), Bitrate (standard/high). 2.0 → the pre-existing controls (duration 4–15 select, quality, resolution, 4 aspects, Pass Faces, Unrestricted, fast mode) unchanged in behaviour.
7. `Step1ScriptAndMode.tsx`: order = EngineModeSelector → OutputSettingsPanel → (ugc) ProductReferencePicker → Script (`needsScript(mode)` ? required gate as today : optional section with a "Skip — continue to inputs" button); pass `duration={effectiveScriptDuration(state)}` to `SeedanceScriptStep`.
8. `ProductReferencePicker.tsx`: tabs "Library" (existing) | "Store products" (fetch `/api/shopify/product-images`, group by product title, `<img>` tiles, same toggle semantics; loading/empty/error states incl. "Shopify not configured"); `MAX_PRODUCTS = inputLimitsFor(engine,"ugc").ugcCombined - state.ugcInfluencerImageUrls.length` (30 on 2.5, 9 on 2.0); selection reconcile keeps Store-product URLs (they are not in the library).
9. `pickers/ImageMultiPicker.tsx` (`{ urls, onChange, max, title, help, sources: ("upload"|"gallery"|"library"|"url")[] }`): gallery = `/api/images?limit=48&assetTag=ugc-avatar`, library = `/api/product-categories`, upload multiple via `uploadVideoInput(file,"image")`, URL paste validated with `isPublicHttpsUrl`; counter "N / max"; remove; reorder not required.
10. `pickers/MediaListPicker.tsx` (`{ kind: "video"|"audio", urls, onChange, max, title, help }`): upload (`uploadVideoInput`), "From your videos" (`FromYourVideosGrid` → `/api/videos/inputs`, video only), URL paste; `<video controls preload="metadata">` / `<audio controls>` previews; counter; remove.
11. `Step2DynamicInputs.tsx`: 9 cases. `modes/UgcMode.tsx`: Gallery tab becomes multi-select (≤ `ugcCombined - products`), Upload accepts multiple; on Continue set `ugcInfluencerImageUrls` AND `ugcInfluencerImageUrl = urls[0]`. `MultiReferenceMode.tsx`: images via `ImageMultiPicker` (max 30; keep the `{url,role}` array + AtMention), videos/audios via `MediaListPicker` → `inputVideoUrls`/`inputAudioUrls`. `LipsyncMode.tsx` + new `VoiceCloneMode.tsx` (share a base): images (`inputImageUrls`, ≤30; keep `lipsyncImageUrl = urls[0]`), audio (`MediaListPicker kind="audio" max=1` → `lipsyncAudioUrl`; help "≤ 30 s"). `EditExtendMode.tsx` (mode-aware copy): required `MediaListPicker kind="video"` (≤10, "combined < 30 s") → `inputVideoUrls`, `editInstruction` textarea (min 10 chars), optional images/audios; note "Duration: Auto" (edit) / duration control (extend) and "Output follows the source aspect". `MultiFrameMode.tsx`: add optional images/videos/audios pickers on 2.5. `FirstAndLastFrameMode.tsx`: on 2.5 the last frame is optional (Continue enabled with first only) + "aspect follows the first frame" note. `TextToVideoMode.tsx`: unchanged.
12. `EnhancorSettingsPanel.tsx` read-only recap (props unchanged): Engine, Mode label, Tier + resolution, Duration ("Auto" when -1 / "sum of segments"), Aspect, Pass faces, Unrestricted, Output format (effective default shown), Bitrate; 2.0 rows as before. Editable branch (2.0 non-parity modes) unchanged.
13. `PipelineSelector.tsx`: title "Seedance Pipeline", description mentions 2.5, cost line `from ≈ ${formatUsd(estimateCredits({engine:"2.5",mode:"ugc",resolution:"720p",durationSeconds:8}).usd)} / 8 s draft` ; `app/(protected)/video/page.tsx` header "Create Video — Seedance".

**Tests.** `mode-input-rules.test.ts` (limits per engine/mode; `effectiveDuration` auto → -1, edit → -1; `effectiveScriptDuration` never < 4; `coerceStateForEngine("2.0")` fixes mode/aspect/duration; `coerceStateForMode("edit")` forces auto + adaptive; leaving adaptive resets aspect). `wizard-apply-settings.test.ts` (settings → patch; -1 → auto; resolution mirrors tier; `settingsApplied` true).

**Acceptance.** Fresh browser: wizard opens on Seedance 2.5 / UGC / Draft 720p / 8 s / 9:16 (or whatever Settings says); returning browser keeps its last values. Every mode is reachable and Step 2 renders only the inputs in §2.4's "accepts" column with counters (products+influencers ≤30, images ≤30, videos ≤10, audios ≤10). Uploading a video/audio works; "From your videos" lists finished clips; pasting a URL works; "Store products" shows Sorrel/Fern/Ivy images. Switching to 2.0 hides edit/extend/voice_clone and clamps duration to 15. `npx tsc --noEmit` clean; no new lint errors (`<img>` warnings are accepted, errors are not).

**Gotchas.** `SeedanceScriptStep` POSTs `duration` to `/api/scripts` which rejects < 4 — always pass `effectiveScriptDuration`. Keep `ugcInfluencerImageUrl` set (Step 3's vision path keys on it). Do not import anything from package C's new files — call the routes. Never render Shopify CDN images with `next/image` (host not in `remotePatterns`; use `<img>`). `radix-ui` unified package only — no new deps. Keep all existing `data-*`/ids used by `tests/components/**` (none are DOM tests today). Finder `" 2"` files: ignore.

---

### Package E — Step 3 (2.5 request, in-wizard progress, inline result, Re-render as Final) + gallery metadata (size L)

**Goal.** Approve & Generate builds the exact 2.5 request from wizard state, Step 3 shows live progress and the finished video inline (poll every 12 s), completed drafts offer "Re-render as Final", and `VideoCard`/`VideoModal`/gallery show engine, mode, tier/resolution, duration, credits (+≈USD) with engine filters.

**Context — import these.** `@/components/video/seedance-v4/types`, `@/lib/seedance/v25/schema` (`Seedance25GenerateBodySchema`, `formatZodIssues`), `@/lib/seedance/v25/types` (`SEEDANCE_25_MODE_LABELS`, `AUTO_DURATION`), `@/lib/seedance/engines` (`engineLabel`, `QUALITY_TIERS`, `isDraftTier`, `qualityTierToResolution`), `@/lib/seedance/pricing` (`estimateCredits`, `formatCredits`, `formatUsd`, `creditsToUsd`), `@/lib/settings/use-video-settings` (rates for estimates), `@/lib/supabase/schema-errors` (`MIGRATION_REQUIRED_CODE`, `isMissingColumnError`, `migrationRequiredBody`), `@/lib/types` (`VideoStatusResponse`, `GeneratedVideo`), `@/lib/video/reconcile`. API contracts you consume (A builds them in parallel — code against §2.11): generate 2.5 response, `GET /api/seedance/[id]/status` extended fields, `POST /api/seedance/[id]/rerender`. `CostBreakdown` (B) keeps its props — just pass the richer `estimateV4Cost` input. `EnhancorSettingsPanel` (D) keeps its props.

**Owned files.** Matrix column E. Do NOT touch: Step 1/2, modes, pickers, `CostBreakdown.tsx`, `EnhancorSettingsPanel.tsx`, `types.ts`, `lib/seedance/**`, `lib/costs/**`.

**Steps.**
1. `lib/build-request.ts` (pure, tested): move `buildEnhancorBody` / `buildEnhancorBodyV4UGC` here unchanged as `buildSeedance20Body(state, prompt, segments)`; add `buildSeedance25GenerateBody(state, editedPrompt, editedSegments): Seedance25GenerateBody-input` per mode:
   ugc → `products: state.ugcProductImageUrls, influencers: state.ugcInfluencerImageUrls.length ? … : [state.ugcInfluencerImageUrl].filter(Boolean)`; text_to_video → prompt only; multi_reference → `images: state.multiReferenceImages.map(r=>r.url)` (fallback `inputImageUrls`), `videos: inputVideoUrls`, `audios: inputAudioUrls`; first_n_last_frames → `first_frame_image: firstFrameUrl`, `last_frame_image?: lastFrameUrl`; multi_frame → `multi_frame_prompts: editedSegments` (no prompt); edit/extend → `videos: inputVideoUrls`, `images?`, `audios?`; lipsyncing/voice_clone → `images: inputImageUrls.length ? … : [lipsyncImageUrl]`, `lipsyncing_audio: lipsyncAudioUrl`.
   Common: `mode`, `prompt: editedPrompt` (omit for multi_frame), `duration: state.durationMode==="auto" || mode==="edit" ? -1 : state.duration`, `resolution: qualityTierToResolution(state.qualityTier)`, `aspect_ratio: state.aspectRatio`, `pass_faces: state.passFaces`, `is_uncensored: state.isUncensored`, `output_format?: state.outputFormat`, `bitrate_mode: state.bitrateMode`; envelope `{ engine:"2.5", request, qualityTier: state.qualityTier, scriptText, scriptId, campaignType, tone, productSku }`. Run `Seedance25GenerateBodySchema.safeParse` client-side before POST and surface `formatZodIssues` as a toast (fast feedback; server re-validates).
2. `Step3PromptReviewAndGenerate.tsx`: `handleApproveAndGenerate` → `state.engine==="2.5" ? buildSeedance25GenerateBody : buildSeedance20Body`; on 503 `code==="migration_required"` toast the `error` (contains the SQL file path) for 12 s; on success store `{videoId, taskId, estimate}` and render `<SeedanceGenerationProgress>` in place of the static "Submitted" card. Multi-frame editor: segment duration `min 1 max 30`, total must be 4–30 on 2.5 (4–15 on 2.0), disable Approve when out of range. Cost breakdown: pass `engine, isUncensored, hasVideoInputs, multiFrameDurations, durationSeconds: -1 when auto, resolution: qualityTierToResolution(...)`, `rates/usdPerCredit` from `useVideoSettings()`. Director body (`buildDirectorBody`): fill `sourceVideoUrls: inputVideoUrls`, `editInstruction` for edit/extend; `composedPersonProductImage` + `referenceAudioUrl: lipsyncAudioUrl` for voice_clone; `durationSeconds: effective (-1 when auto)`.
3. `SeedanceGenerationProgress.tsx` (`{ videoId, engine, estimate?, onCreateAnother, onRerendered? }`): polls `GET /api/seedance/${videoId}/status` every 12 s (pause when `document.hidden`), shows a progress bar from `progress`, elapsed time, "typically 2–10 min"; on `completed` renders `<video controls src={finalVideoUrl} poster={thumbnailUrl}>` + credits/≈USD (`creditsCost` / `costUsd`; fall back to the estimate with "estimated" label) + Download (`/api/videos/${id}/download`) + `<RerenderButton>` when `isDraftTier(qualityTier)`; on `failed` show `errorMessage ?? error`; stop polling on terminal states. Design: section card + `bg-coco-golden` progress.
4. `components/video/RerenderButton.tsx` (`{ video: Pick<GeneratedVideo,…> | statusLike, onQueued(newVideoId) }`): opens a small confirm (Dialog from `components/ui/dialog`) showing "Final 1080p", duration (editable number 4–30 unless mode edit/multi_frame; prefilled from `requestedDuration`), and the 1080p estimate via `estimateCredits({…resolution:"1080p"})`; POST `/api/seedance/${id}/rerender` `{duration}`; toast; `onQueued(videoId)`.
5. `lib/video/display.ts` (pure): `videoEngineLabel(v)`, `videoModeLabel(v)` (from `seedance_mode`, "UGC" fallback for 2.0), `videoTierLabel(v)` ("Draft 720p" / "Final 1080p" from `quality_tier` else from `resolution`), `videoDurationLabel(v)` ("Auto" when `requested_duration===-1` and no duration, "8s"), `videoCostLabel(v)` ("1,615.8 cr · $1.62" | "$3.08 est." for 2.0 | "—"), `canRerenderAsFinal(v)` (= pipeline seedance && engine 2.5 && completed && request_payload && isDraftTier(quality_tier) ).
6. `VideoCard.tsx`: pipeline badge → "Seedance 2.5"/"Seedance 2.0" (`videoEngineLabel`); add a second small chip `${videoModeLabel} · ${videoTierLabel}`; duration badge uses `videoDurationLabel`; footer right shows `videoCostLabel` in `text-[10px]` next to status when Seedance.
7. `VideoModal.tsx`: metadata grid adds Engine, Mode, Tier, Resolution, Credits (`videoCostLabel`), Error (when `error_message`), "Re-rendered from" (link that opens the source: call `onOpenVideo?(id)` prop, optional); actions add `<RerenderButton>` when `canRerenderAsFinal`; keep Download/Delete.
8. `gallery/page.tsx`: `PIPELINE_FILTERS` → All / HeyGen / Seedance 2.0 / Seedance 2.5 (`{pipeline:"seedance", engine:"2.5"}`); pass `engine` to `/api/videos`; on rerender queued → prepend the new row by fetching `/api/videos/${id}` and let reconcile poll it.
9. `app/api/videos/route.ts`: accept `engine` ∈ {"2.0","2.5"}; on `isMissingColumnError` → `NextResponse.json(migrationRequiredBody(error), { status: 503 })`.
10. `lib/video/reconcile.ts`: `applyStatusUpdate` also merges `credits_cost`, `processing_cost`, `error_message`, `engine`, `seedance_mode`, `quality_tier`, `resolution`, `requested_duration` when present on the response.

**Tests.** `build-request.test.ts`: for each of the 9 modes the built body passes `Seedance25GenerateBodySchema`; auto → -1; edit → -1 regardless; qualityTier ↔ resolution consistent; ugc falls back to the single influencer key; multi_frame has no prompt; 2.0 builder output unchanged vs a snapshot of the old function for a ugc state. `display.test.ts`: labels for 2.0 row without new columns, 2.5 draft/final, auto duration, cost label rounding, `canRerenderAsFinal` matrix. `videos-list-engine-filter.test.ts`: `engine=2.5` adds `eq("engine","2.5")`, invalid engine ignored, 42703 → 503. Extend `gallery-reconcile.test.ts`: merges credits.

**Acceptance.** Draft 480p 4 s UGC on 2.5: Step 3 shows the credits estimate (≈489 cr / $0.49), submits, shows live progress, then the video inline with the actual credits and a "Re-render as Final" button that queues a linked 1080p job which appears in the gallery under "Seedance 2.5". Gallery filter chips work; 2.0 rows still render with "Seedance 2.0". `tests/components/seedance/Step3PromptReviewAndGenerate.test.ts` stays green (it is self-contained).

**Gotchas.** `check-references` returns 400 for edit/extend/voice_clone — existing code treats non-OK as "not degraded"; leave it. Poll interval ≥ 12 s (Enhancor jobs take 2–10 min); clear the interval on unmount. The status route may still return `progress` without new fields for pre-migration rows — all new fields are optional. `next/image` is used by `SafeThumbnail`; thumbnails stay on cloudfront/Cloudinary (already allowed) — do not add hosts. Keep `VideoModal`'s `getPipelineLabel` semantics for HeyGen rows.

---

### Package F — Script sizing 4–30 s + Auto, Director modes edit/extend/voice_clone, capability copy (size M)

**Goal.** Scripts and Director prompts are sized to the chosen 2.5 duration (4–30 s, or Auto ≈ 10 s), the Director understands the three new modes with proper system prompts, the vision director accepts up to 30 product images and several influencers, and `MODE_CAPABILITIES` has real copy for all nine modes.

**Context — import these.** `@/lib/seedance/v25/types` (`SEEDANCE_25_MODES`, `AUTO_DURATION`, `SEEDANCE_25_LIMITS`), `@/lib/ai/director/types` (`DirectorMode`, `DirectorInput` incl. the new optional fields), existing `system-prompts.ts` (`UNIVERSAL_PRELUDE`, registry pattern), `seedance-director.ts` (`validateDirectorInput`, `composeUserMessage`), `lib/prompts/scripts/seedance.ts` (`buildSeedanceDurationRule`).

**Owned files.** Matrix column F. Do NOT touch: routes other than `director`/`director-vision`, any `components/**` other than `mode-capabilities.ts`, `lib/seedance/v25/**`.

**Steps.**
1. `lib/prompts/scripts/seedance.ts`: `buildSeedanceDurationRule(seconds)` → clamp to 4–30 (`-1`/non-finite → 10 with the sentence "Duration is Auto — write for about 10 seconds"); bands: ≤6 single idea · ≤10 hook+one beat+CTA · ≤15 hook+two beats+CTA · ≤30 "Hook + two or three beats + CTA; still short speakable sentences; no filler". Update the header comments (no "caps at 15"). Word band formula unchanged (2.3–3 w/s).
2. `tests/prompts/seedance-duration-sizing.test.ts`: update deliberately — `buildSeedanceDurationRule(30)` contains "30 seconds" and "69-90 words"; `(2)` → "4 seconds"; add `(-1)` → "Auto" + "10 seconds"; keep the 5/10/15 assertions. Record this change in your report (a 2.0-era test that pinned the old cap).
3. `system-prompts.ts`: add `EDIT_DIRECTOR_PROMPT`, `EXTEND_DIRECTOR_PROMPT`, `VOICE_CLONE_DIRECTOR_PROMPT` (prelude + mode rules: edit = describe ONLY the change, keep identity/framing/lighting, reference `@video1`; extend = continue motion and audio naturally from the last frame, no cuts; voice_clone = lipsyncing rules + "voice comes from `@audio1`, do not describe the voice"), registry entries `seedance-director-edit` / `-extend` / `-voice-clone` (surface "/video → Step 3 → Approve & Generate (Edit mode)" etc.), map entries; prelude sentence: "Seedance 2.0/2.5 … clips are 4–30 s (or Auto)". Update the 2.5 wording in the multi_frame prompt: segments 3–8 s, total 4–30, up to 10 segments.
4. `seedance-director.ts`: `validateDirectorInput`: `durationSeconds` must be `-1` or ≥ 4 (was ≥ 5); edit/extend require `sourceVideoUrls?.length ≥ 1` and `editInstruction` (edit only) ; voice_clone requires `composedPersonProductImage` + `referenceAudioUrl`; `requiresScript` list unchanged. `composeUserMessage`: "Total duration: Auto (model decides — plan for ~10 s)" when -1; cases for edit/extend (list `@videoN` sources + instruction), voice_clone (speaker image + `@audio1`); multi_frame planning line uses 3–8 s segments and the 4–30 total.
5. `app/api/seedance/director/route.ts`: `mode: z.enum(SEEDANCE_25_MODES)`, `durationSeconds: z.number().int().refine(d => d === -1 || (d >= 4 && d <= 30))`, `multiFrameSegmentCount max 10`, add `sourceVideoUrls: z.array(url).max(10).optional()`, `editInstruction: z.string().max(2000).optional()`, `referenceAudioUrls`, `referenceVideoUrls`.
6. `director-vision/route.ts` + `seedance-vision-director.ts`: `productImageUrls.max(30)`; add `influencerImageUrls: z.array(url).max(30).optional()` (when present, `influencerImageUrl` defaults to `[0]` and the prompt mentions "N influencer references (@influencer_image1…N)"; keep the single-field contract working).
7. `mode-capabilities.ts`: final copy for all nine modes from `01-API-REFERENCE.md` (inputs / best for / limits incl. counts: images ≤30, videos ≤10 (<30 s combined), audios ≤10, lipsync audio ≤30 s, ugc products+influencers ≤30).
8. `lib/seedance/prompt-planner.ts`: widen `SeedanceDirectorPromptParams.mode` to `SeedanceMode | Seedance25Mode | "text-to-video"` (type only).
9. `lib/ai/__tests__/director-prompts.test.ts`: modes list → all nine.

**Tests.** `script-sizing-30s.test.ts` (30 → "69-90 words", 20 → band + "two or three beats", -1 → Auto/10 s, 45 → clamped 30). `director-new-modes.test.ts` (registry has 9 entries with non-empty text; `validateDirectorInput` rejects edit without sources/instruction, voice_clone without audio; `composeUserMessage` for edit lists `@video1` + instruction, for -1 says "Auto"). `director-route-schema.test.ts` (POST body with `durationSeconds:30` and `mode:"extend"` passes zod; 31 / 3 / "voice" fail — test the schema by importing the route with `runSeedanceDirector` mocked).

**Acceptance.** Generating a script for a 25 s clip yields the 58–75 word band; Director calls succeed for all nine modes (mocked LLM); `/api/seedance/director` accepts `-1`. All existing `tests/seedance-director/**` and `tests/prompts/**` green (one deliberate update).

**Gotchas.** The director route is called by Step 3 with `durationSeconds` from `effectiveDuration` (may be -1). Keep `getSeedanceDirectorPrompt` throwing for unknown modes. Don't change `MODE_CAPABILITIES`' key type (`SeedanceV4Mode | "text_to_video"`).

---

### Wave 2

**G — Cost dashboard by engine (size S).** `lib/costs/tracker.ts` `getMonthlyCostSummary`: select `processing_cost, pipeline, engine, credits_cost`; on `isMissingColumnError` fall back to the old select (no engine split). `PipelineBreakdown` += `seedance20, seedance25, seedance20Count, seedance25Count, seedance25Credits`; `seedance` keeps the combined total (backward compatible). `components/settings/CostSummary.tsx`: "By Pipeline" grid becomes HeyGen / Seedance 2.0 / Seedance 2.5 (credits under 2.5). Test `tests/seedance-v25/cost-summary-engine.test.ts` (split + fallback). Verify E's `VideoCard`/`VideoModal` credits render with real rows.

**H — End-to-end verification (size M).** Runs §4 in full; writes `scripts/smoke-seedance25.ts` (below); triages failures back to the owning package (fixes by the orchestrator at wave boundaries); runs `code-reviewer` + `security-reviewer` over `app/api/video-inputs/**`, `app/api/seedance/**`, `app/api/settings/video`, `app/api/shopify/product-images`.

**I — Docs (size S).** `docs/seedance-2.5/04-SHIPPED.md`: what shipped, the runbook (§5), how costs are computed, how to change rates, known limits (voiceover deferred D13; 2.0-vs-2.5 A/B demo next). `.env.example`: comment that `ENHANCOR_API_KEY` serves both engines and `ENHANCOR_API_BASE_URL` overrides 2.0 only. Do not touch `.planning/`.

---

## 4. Verification plan

**Automated (every wave boundary, in this order):**
```bash
find app components lib tests supabase docs scripts -name "* 2.*" -o -name "* 2"   # must print nothing; delete anything it finds
rm -rf .next                                                                        # stray ".next/types/routes.d 2.ts" breaks tsc
npx tsc --noEmit                                                                    # must be silent
npm test                                                                            # ≥ 62 files / 589 tests after Wave 0; all green
npx eslint app components lib tests scripts                                         # 0 NEW errors (baseline: 37 pre-existing errors outside widget/)
npm run lint                                                                        # informational (widget/ noise)
npm run build                                                                       # before push only (builds the widget too; needs network for npm --prefix widget install)
```

**Manual smoke (local `npm run dev`, logged in with the access password):**
1. Settings → "Video defaults" card visible; change default tier to Draft 480p, Save, reload → persists (or shows the migration banner if SQL not applied).
2. `/video` → Seedance → fresh wizard shows 2.5 / UGC / Draft 480p (from settings) / 8 s / 9:16; header estimate ≈ $1.00 (977.6 cr).
3. Step 1: switch mode to each of the nine; Step 2 shows only the accepted inputs; counters cap at 30/10/10; "Store products" lists Sorrel/Fern/Ivy.
4. Upload a 20 MB .mp4 in Edit mode → lands in `video-inputs`; "From your videos" shows finished clips.
5. UGC Draft 480p 4 s: Step 3 estimate ≈ 489 cr / $0.49 → Approve → progress → video inline → credits ≈ 488.8 → "Re-render as Final" → 1080p row linked in gallery ("Seedance 2.5" filter).
6. Gallery: old rows show "Seedance 2.0"; modal shows Engine/Mode/Tier/Credits; cost dashboard splits engines.
7. Migration-missing drill (before pasting SQL): step 5 must return the 503 toast naming the SQL file and Enhancor must NOT be called (check server log for "/queue").

**Scripted real 2.5 run (`scripts/smoke-seedance25.ts`, package H; orchestrator decides when).** Reuses the `poc/seedance25-ugc.ts` approach but through OUR pipeline: `npx tsx scripts/smoke-seedance25.ts --base http://localhost:3000 --resolution 480p --duration 4` → logs in with `AUTH_PASSWORD` from `.env.local` to obtain the `cocolash-auth` cookie → `POST /api/seedance/generate` with the POC's Dahlia product + studio-avatar influencer at 480p × 4 s → polls `GET /api/seedance/{videoId}/status` every 15 s (webhook cannot reach localhost; status polling completes the row) → prints `credits_cost`, `processing_cost`, `final_video_url`. **Cost: 122.2 × 4 = 488.8 credits ≈ $0.49** (6 s ≈ $0.73). Then `POST …/rerender` is NOT run automatically (1080p × 4 s ≈ $1.95) — flag `--rerender` opts in.

---

## 5. Deploy runbook

1. **Pre-flight (orchestrator):** §4 automated block green; `git status` shows only intended files; no `" 2"` artefacts.
2. **SQL (Harry, BEFORE push):** Supabase Dashboard → SQL Editor → paste `supabase/migrations/20260908_seedance25.sql` → Run. Verify:
   ```sql
   select column_name from information_schema.columns where table_name='generated_videos' and column_name in ('engine','credits_cost','request_payload','rerender_of');  -- 4 rows
   select default_engine, default_quality_tier, default_duration, usd_per_credit from video_settings;                                                             -- 1 row: 2.5 | draft-720p | 8 | 0.001
   select id, public, file_size_limit from storage.buckets where id='video-inputs';                                                                             -- 1 row
   ```
3. **Seed references (orchestrator, local env):** `npx tsx scripts/seed-shopify-references.ts --handles sorrel,fern,ivy --dry-run` → review → run without `--dry-run`.
4. **Commit + push:** `gh auth switch --user ai-harry` → `git add <explicit paths>` (never `git add .`) → conventional commit (`feat(seedance): Seedance 2.5 engine, quality tiers, real credit pricing, inputs bucket`) → `git push origin main` (auto-deploys to Vercel; env vars already present: `ENHANCOR_API_KEY`, `ENHANCOR_WEBHOOK_URL`/`NEXT_PUBLIC_APP_URL`, `ENHANCOR_WEBHOOK_SECRET`, `SHOPIFY_*`, `SUPABASE_SERVICE_ROLE_KEY`).
5. **Post-deploy probes (`BASE=https://cocolash-ai-suite.vercel.app`):**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/settings/video                       # 307 → /login (route exists, auth gate works)
   curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/seedance/webhook -d '{}'      # 401 (public route alive, secret enforced)
   curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/shopify/product-images                # 307
   # logged-in (cookie from the browser devtools):
   curl -s -H "Cookie: cocolash-auth=$AUTH_TOKEN" $BASE/api/settings/video | jq .fromDatabase # true after SQL
   ```
   Then the manual smoke §4 steps 2–6 on production with ONE Draft 480p 4 s job (≈ $0.49).
6. **Rollback:** `git revert <merge sha> && git push` (2.0 keeps working; the new columns are nullable and harmless). SQL rollback block is at the bottom of the migration file — only if truly needed.

---

## 6. Reply to Faith (draft, ≤120 words)

> Hi Faith — quick update on Seedance 2.5 pricing and the plan.
>
> The "$14 per 30-second video" is the **1080p** rate (14,619 credits = $14.62). 720p is about **$8** per 30 s and 480p about **$3.67** — your $35 figure isn't what the account is charged.
>
> The app now defaults to **Draft 720p** so you can iterate cheaply, with a one-click **"Re-render as Final" (1080p)** on any draft you like — same prompt, same images. Duration is 4–30 s or Auto, and the estimate (credits + $) shows before you generate.
>
> **Sorrel is added** to the product library (plus Fern and Ivy).
>
> Next: I'll run your two failure cases side-by-side on 2.0 vs 2.5 so you can see the difference.
>
> — Harry

---

## 7. Assumptions & open items (planner's calls — not locked decisions)

1. **Vercel body limit** drove the upload design (signed-URL direct upload for video/audio; server route for images only). If `createSignedUploadUrl` is unavailable on the project's Storage tier, fall back to an anon INSERT policy on `storage.objects` for bucket `video-inputs` (one extra statement in the migration).
2. **`storage.buckets` INSERT** in the migration assumes the standard column set; it is `ON CONFLICT DO NOTHING` and the bucket already exists — if the SQL editor rejects that statement, delete section 3 of the file and re-run (everything above it is independent).
3. **`aspect_ratio` for adaptive-only modes** is coerced to `"adaptive"` (not rejected); `edit` with a non-`-1` duration IS rejected. Both mirror 01-API-REFERENCE wording ("forced" vs "must").
4. **Auto duration estimate = 10 s** (`AUTO_DURATION_ESTIMATE_SECONDS`), labelled everywhere it is shown.
5. **Reduced-rate input seconds** are unknown server-side (we don't probe video length); the estimate bills output seconds and says so. Actual cost from Enhancor is authoritative.
6. **2.5 skips `resolveSkuReferences`** — the wizard sends explicit URLs; `productSku` is passed only for the Director's product-truth grounding.
7. **`GeneratedVideo.aspect_ratio` widened to `string`** — no consumer narrows it (grep verified).
8. **`updated_by` is TEXT** on `video_settings` (the access-password admin has no `auth.users` row).
9. **Engine '2.0' default also stamps HeyGen rows** (NOT NULL DEFAULT is what keeps the untouched 2.0 insert working pre-migration); every consumer checks `pipeline` first.
10. **Fern/Ivy product-truth facts** (kit contents, magnetic closure) are unknown here — package C fills them from the live Shopify description, otherwise leaves them conservative (no magnetic claims).
