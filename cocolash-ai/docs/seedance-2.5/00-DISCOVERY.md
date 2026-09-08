# Discovery — current state of the video pipeline (2026-09-08)

Four explorer agents mapped the codebase. Facts below are file:line-referenced; verify before relying on any single line number (code moves). Repo root = `cocolash-ai/`. Ignore any file/dir whose name ends with `" 2"` (Finder duplicates).

---

## A. Backend (Seedance 2.0 / Enhancor)

### Routes

Auth model: `middleware.ts:18-28` gates every path with Supabase session OR legacy `cocolash-auth` cookie. Public allow-list (`pathname.startsWith`): `/login`, `/api/auth`, `/auth`, **`/api/seedance/webhook`**, `/api/shopify/products-webhook`, `/api/chat`, `/api/chat/config`, `/widget.js`, `/coco-test.html`. No route below does a per-user check; they use `createAdminClient()` (service role) after middleware, except the POC which uses `requireChatAdmin`.

| Route | Method | Validation | Calls | Response |
|---|---|---|---|---|
| `app/api/seedance/generate/route.ts` | POST (`maxDuration=300` L24) | hand-rolled `validateRequest()` L517-652, **no zod**; body interface `SeedanceGenerateBody` L61-117 | `generateVideoScript` → `validateScriptAgainstProductTruth` → `generateSeedanceDirectorPrompt` (or `overridePrompt`) → DB insert → `resolveSkuReferences` → `createSeedanceTask` → DB update | `{ videoId, taskId, status:"processing", estimatedCost, degraded?, degradedMessage? }` L476-482; on Enhancor error marks row `failed`, 500 `{error}` L483-507 |
| `app/api/seedance/[id]/status/route.ts` | GET | none | `querySeedanceTask` → `completeSeedanceVideo` | `VideoStatusResponse` `{videoId,status,progress?,finalVideoUrl?,thumbnailUrl?,error?}` L148-175 (fake progress 10/50/85/100) |
| `app/api/seedance/webhook/route.ts` | POST (public) | secret via `x-webhook-secret` header or `?token=` (timing-safe L101-125) | `completeSeedanceVideo` | `{received:true, processed:bool}`; 401 bad token; 400 missing request_id; unknown id → 200 processed:false |
| `app/api/seedance/director/route.ts` | POST | zod `BodySchema` L34 (mode enum L35) | Claude director → prompt | `{success, requestId, prompt/segments, diagnostics}` |
| `app/api/seedance/director-vision/route.ts` | POST | zod L38 | vision prompt writer (UGC) | prompt |
| `app/api/seedance/last-frame/route.ts` | POST | zod L68 | NanoBanana last frame | `{success, requestId, …}` |
| `app/api/seedance/check-references/route.ts` | GET `?sku=` | — | reference resolver | degraded flag |
| `app/api/seedance/extract-product-facts/route.ts` | POST | zod L20 | LLM | `{facts}` |
| `app/api/seedance/generate-ugc-image/route.ts` | POST | hand-rolled | Gemini avatar gen → `generated_images` tag `ugc-avatar` | image url |
| `app/api/videos/route.ts` | GET | `status`, `pipeline` (`heygen`\|`seedance` only, L31) | list | `{videos,total,limit,offset}` |
| `app/api/videos/[id]/route.ts` | GET / DELETE | — | detail; DELETE also Cloudinary delete L106-115 | `{video, script}` / `{success, deletedId}` |
| `app/api/videos/[id]/status/route.ts` | GET | — | HeyGen only | `VideoStatusResponse` |
| `app/api/videos/generate/route.ts` | POST | hand-rolled | HeyGen pipeline | — |
| `app/api/costs/route.ts` | GET `?year&month` | — | `getMonthlyCostSummary` | `CostSummary` |
| `app/api/poc/seedance25/route.ts` | POST / GET | zod L29-32; `requireChatAdmin` L34-37 | **2.5** `/queue` + `/status` + webhook.site | POC only |

`app/api/videos/webhook` referenced in `lib/video/reconcile.ts:15` does not exist (HeyGen is poll-only).

### Enhancor client — `lib/seedance/client.ts`

- `DEFAULT_API_BASE = "https://apireq.enhancor.ai/api/enhancor-ugc-full-access/v1"` L21-22, override `ENHANCOR_API_BASE_URL` L37. Env: `ENHANCOR_API_KEY` L25 (header `x-api-key` L105), `ENHANCOR_WEBHOOK_URL`, `ENHANCOR_WEBHOOK_SECRET` (`.env.example:48-54`).
- `POST {base}/queue` L101; `POST {base}/status` `{request_id}` L396-403.
- `withRetry` L44-58: one retry after 1 s on 500/503 (**a retried queue call double-bills — 2.5 must not retry queue**). No idempotency key.
- Queue response parse: `requestId ?? request_id ?? id ?? data.*` L130-136.
- `buildEnhancorQueueRequest` L201-368 always sends `type` (`"text-to-video"` L207 or `"image-to-video"`), `mode`, `prompt`, `duration` (string), `resolution`, `aspect_ratio`, `webhook_url`, `full_access`, optional `unrestricted`/`quality`, `fast_mode`, then mode fields: `ugc` L350-367 (`products[]`, `influencers[]`, opt videos/audios); `multi_reference` L285-313 (`images[]` + `@imageN/@videoN/@audioN` tokens via `addReferenceTokens` L370-389); `multi_frame` L221-237; `first_n_last_frames` L239-258; `lipsyncing` L260-283; legacy fallback L315-348.
- Every payload filtered by `pickAllowed()` from `lib/seedance/mode-allowlist.ts:108-122`; `UNIVERSAL_FIELDS` L59-67 = `type, mode, resolution, aspect_ratio, webhook_url, full_access, fast_mode` → **`unrestricted` and `quality` are silently dropped today.**
- Status normalisation L406-453: `status` (uppercased; unknown → PROCESSING), `result | video_url | output.video_url`, `thumbnail | thumbnail_url`, `error`. **Does not read `cost`.**
- Types `lib/seedance/types.ts`: `SeedanceMode` L23-28 (5 modes; no edit/extend/voice_clone/text_to_video), `SeedanceDuration` L21 = `"4".."15"`, `SeedanceInput` L35-66, `SeedanceCreateTaskRequest` L68-93, `SeedanceWebhookPayload` L126-133 (no `cost`), `SEEDANCE_COSTS` L170-176 (stale USD constants).
- Results received both ways: webhook + polling; both converge on `completeSeedanceVideo`.

### DB — single table `generated_videos` (no jobs table)

Base `supabase/migrations/20260321_upgrade_one_system_two.sql:23-47`:
```sql
id UUID PK, script_id UUID REFERENCES video_scripts(id), person_image_id UUID,
person_image_url TEXT, product_image_url TEXT (nullable since 20260421), composed_image_url TEXT, avatar_image_url TEXT,
heygen_video_id VARCHAR(100), heygen_status VARCHAR(30) -- no CHECK; pending|processing|captioning|completed|failed
raw_video_url TEXT, final_video_url TEXT, thumbnail_url TEXT, duration_seconds INTEGER, aspect_ratio VARCHAR(10),
has_captions BOOLEAN, has_watermark BOOLEAN, has_background_music BOOLEAN, voice_id VARCHAR(50),
background_type VARCHAR(30), background_value TEXT, processing_cost DECIMAL(10,4), created_at, completed_at
```
Seedance columns `20260408_seedance_columns.sql:4-12`: `pipeline TEXT DEFAULT 'heygen'`, `seedance_task_id TEXT`, `seedance_prompt TEXT`, `audio_mode TEXT`, `audio_url TEXT` + indexes on pipeline & seedance_task_id. Also `caption_srt TEXT`, `script_text_cache TEXT`. `video_scripts.pipeline` CHECK `('heygen','seedance')` (`20260429_add_video_script_pipeline.sql:27-30`).
TS mirror: `GeneratedVideo` `lib/types/index.ts:587-622`; `VideoPipeline = "heygen"|"seedance"` L553; `VideoDuration 15|30|60|90`; `VideoAspectRatio "9:16"|"1:1"|"16:9"` (narrower than Seedance).
**Not stored today:** engine/model, mode, resolution, requested duration (only script-level `duration_seconds`), input URL arrays, Enhancor `cost`, error text, flags.
Live columns verified 2026-09-08: `id, script_id, person_image_id, person_image_url, product_image_url, composed_image_url, avatar_image_url, heygen_video_id, heygen_status, raw_video_url, final_video_url, thumbnail_url, duration_seconds, aspect_ratio, has_captions, has_watermark, has_background_music, voice_id, background_type, background_value, processing_cost, created_at, completed_at, script_text_cache, caption_srt, pipeline, seedance_task_id, seedance_prompt, audio_mode, audio_url`.

### Status lifecycle

1. `generate/route.ts:334-357` inserts `heygen_status:"pending"`, `pipeline:"seedance"`.
2. After `/queue` → `{seedance_task_id, heygen_status:"processing"}` L457-463; submit error → `"failed"` L485-488.
3. Completion (either wins): webhook (lookup by `seedance_task_id` + `pipeline='seedance'` L31-36; FAILED → failed; COMPLETED+result → `completeSeedanceVideo`) or poll status route L68-139.
4. `lib/seedance/completion.ts:46-59` atomic claim `UPDATE … WHERE heygen_status IN (pending,processing,captioning)` → `completed`, `raw_video_url`, provisional `final_video_url`; then Cloudinary re-host L81-100 (`lib/video/processor.ts:36-107` → `lib/cloudinary/video.ts:79-106`, folder `cocolash-videos`) and `recordActualCost` L105-113 (**hardcodes 720p rate × duration, ignores real resolution & Enhancor cost**).
5. Client polling: v4 wizard does **not** poll (toasts "check gallery"); gallery `app/(protected)/video/gallery/page.tsx:26,116-148` reconciles every 15 s via `lib/video/reconcile.ts:50-54`.

### Hardcoded vs selectable (server side)

- Resolution 480p/720p/1080p (`VALID_RESOLUTIONS` L54; default 720p L164; "1080p requires fastMode false" L586-588).
- Aspect: route accepts 6 incl. 1:1/21:9 L50-52; UI offers 4.
- Duration: route requires `duration ∈ {15,30,60}` (`VALID_DURATIONS` L49) and derives `seedanceDuration` by ≤5/≤8/≤10/else 15 bucket L256-258; `VALID_SEEDANCE_DURATIONS` L53 = `["5","8","10","15"]`; multi-frame sum 4–15 L622-630; script sizing clamps 4–15 (`lib/prompts/scripts/seedance.ts:143-144`); director requires ≥5 (`lib/ai/director/seedance-director.ts:110-113`).
- Mode: `VALID_SEEDANCE_MODES` L56-58 (5); text-to-video expressed as `generationType:"text-to-video"` + `seedanceMode:"ugc"`.
- Defaults L165-170: `seedanceMode="ugc"`, `generationType="image-to-video"`, `fullAccess=true`, `fastMode=false`.

### Cost/credits in code

- `lib/costs/estimates.ts:27-32` `API_COSTS.seedance` USD/sec: 480p 0.10 / 720p 0.205 / 1080p 0.41; `estimateV4Cost` L93-160 (mode-aware line items, used in Step 3), `estimateV4Headline` L168-185, `calculateSeedanceCost` L323-364.
- `lib/costs/tracker.ts:39-53` `recordActualCost(videoId, cost)` → `processing_cost`; `getMonthlyCostSummary` L57-152 splits by pipeline (heygen/seedance) → `GET /api/costs` → `components/settings/CostSummary.tsx` (By-Pipeline cards L163-204, hardcoded to two pipelines).
- No Enhancor balance endpoint call anywhere.

### Public URL / webhook

`generate/route.ts:654-673 getEnhancorWebhookUrl()`: `ENHANCOR_WEBHOOK_URL` else `${NEXT_PUBLIC_APP_URL}/api/seedance/webhook`; throws if neither; appends `?token=${ENHANCOR_WEBHOOK_SECRET}`. `VERCEL_URL` unused. Production 2.0 works → these are set in Vercel.

### 2.5 POC (proven)

`app/api/poc/seedance25/route.ts` + `poc/seedance25-ugc.ts`: base `https://apireq.enhancor.ai/api/seedance2.5/v1`; payload `{ mode:"ugc", prompt, duration:"6", resolution, aspect_ratio:"9:16", webhook_url, pass_faces:true, products:[url], influencers:[url] }` — no `type`, no `full_access`. `POST /status` confirmed 200 with `{success, requestId, status, result, thumbnail, cost}`. Page `app/poc/seedance25/page.tsx` (hidden, images hard-coded: influencer = studio-avatar in `generated-images/cocolash/…`, product = Shopify CDN Dahlia).

### What breaks when adding engine/mode/inputs

- `pipeline` filter in `app/api/videos/route.ts:31`, `lib/video/reconcile.ts:51`, `tracker.ts:95-96` know only heygen|seedance (keep `pipeline='seedance'`, add engine column).
- Webhook lookup keys on `seedance_task_id` — 2.0/2.5 request ids share the route; store engine on the row and branch status polling by engine.
- `SeedanceMode` union, `VALID_SEEDANCE_MODES`, `MODE_ALLOWLIST` (`mode-allowlist.ts:24-45`), `reference-resolver.ts:142-195` per-mode shaping, `V4CostInput.mode` (`estimates.ts:65-71`), director `BodySchema` mode enum (`director/route.ts:35`) all need `edit|extend|voice_clone|text_to_video`.
- `pickAllowed` would strip `pass_faces`, `is_uncensored`, `output_format`, `bitrate_mode` unless the allow-list is versioned.
- Tests pinned to 2.0 shape: `tests/seedance/enhancor-payload-shape.test.ts`, `tests/seedance-payloads/{client-payload-shape,ugc,multi-reference,multi-frame,lipsyncing,first-and-last-frame,text-to-video,check-references-endpoint}.test.ts`, `tests/seedance-director/generate-with-resolver.test.ts`, `tests/seedance/completion-no-captions.test.ts`, `tests/seedance/types.test.ts`.
- Docs: `.planning/research/enhancor-capability-matrix.md`, `.planning/phases/29-*/29-ENHANCOR-API-REFERENCE.md` (`.planning/` is gitignored).

---

## B. Frontend (video wizard)

### Routes + tree

- `app/(protected)/video/page.tsx` — creation page (nav `components/layout/Sidebar.tsx:44-48`, `MobileNav.tsx:15`). `app/(protected)/video/gallery/page.tsx` — history.
```
VideoPage (page.tsx:87) → VideoWizard (page.tsx:101), pipeline state "select"|"heygen"|"seedance" (:108)
  ├─ PipelineSelector (:254; components/video/PipelineSelector.tsx)   [labels "Seedance 2.0" at PipelineSelector.tsx:38, page.tsx:230]
  ├─ [seedance] SeedanceV4Wizard (:261; components/video/seedance-v4/SeedanceV4Wizard.tsx:39)
  │    ├─ CostBreakdown variant="headline" (:174)
  │    ├─ stepper "Script + Mode / Inputs / Prompt Review" (:12-16, :178-231); steps stay mounted, hidden via CSS (:233-261)
  │    ├─ Step1ScriptAndMode (:236) — inline "Video Settings" panel (Step1ScriptAndMode.tsx:31-137), ProductReferencePicker (:140), SeedanceScriptStep (:153; components/video/seedance/SeedanceScriptStep.tsx — ScriptVariations, ScriptLibraryPicker)
  │    ├─ Step2DynamicInputs (:244) — switch on state.mode (Step2DynamicInputs.tsx:35-53): modes/UgcMode.tsx (only reachable), TextToVideoMode, MultiReferenceMode, LipsyncMode, MultiFrameMode, FirstAndLastFrameMode (unreachable); each renders CapabilityCard (lib/mode-capabilities.ts)
  │    └─ Step3PromptReviewAndGenerate (:253) — EnhancorSettingsPanel read-only recap (Step3:488-493), CostBreakdown detailed (:497-515)
  └─ [heygen] ScriptGenerator → AvatarSetup → VoiceAndStyle → GenerateVideo (page.tsx:321-368)
```
Wizard state persisted in `localStorage["cocolash:seedance-v4-wizard"]` (`SeedanceV4Wizard.tsx:25,48-76`). `setState` patch wrapper (:93-114) bumps `inputsVersion` on non-Step-3 keys → Director re-run.

### Live vs dead

| Unit | Status |
|---|---|
| `seedance-v4/SeedanceV4Wizard` | LIVE (`page.tsx:261`) |
| `seedance/SeedanceScriptStep.tsx` | LIVE (reused in v4 Step 1) |
| `seedance/SeedanceAvatarStep.tsx`, `SeedanceGenerateStep.tsx` | DEAD (no importers) |
| `GenerateVideo.tsx` + ScriptGenerator/AvatarSetup/VoiceAndStyle | LIVE, HeyGen only |
| v4 modes other than ugc | dead-reachable: dispatched by Step2 but mode picker removed (D-34-13); `DEFAULT_V4_STATE.mode="ugc"` (`types.ts:119`); nothing sets `mode` |
| `CapabilityCard`, `AtMentionTextarea`, `seedance-v4/lib/upload.ts` | only used by dead-reachable modes |
Hard-coded "Seedance 2.0" labels: `page.tsx:230`, `PipelineSelector.tsx:38`, `EnhancorSettingsPanel.tsx:56`, `VideoModal.tsx:49`.

### Selectable options today (state = `SeedanceV4WizardState` `components/video/seedance-v4/types.ts:24-113`; defaults `:115-134`)

| Option | UI | Values | Default | key |
|---|---|---|---|---|
| Duration | select `Step1ScriptAndMode.tsx:47-58` | 4…15 | 15 | `duration` |
| Quality | select `:66-74` | standard/high | standard | `quality` |
| Resolution | select `:82-91` | 480p/720p/1080p | 720p | `resolution` |
| Aspect | select `:99-109` | 9:16,16:9,3:4,4:3 (type `:102`) | 9:16 | `aspectRatio` |
| Pass faces | checkbox `:115-124` | bool | true | `fullAccess` |
| Unrestricted | checkbox `:126-135` | bool | false | `unrestricted` |
| Fast mode | only in editable `EnhancorSettingsPanel.tsx:267-298` (hidden in UGC) | bool | false | `fastMode` |
| Mode | no UI | `DirectorMode` (`lib/ai/director/types.ts:14-20`) | ugc | `mode` |
| Products | `ProductReferencePicker.tsx` (MAX_PRODUCTS=9 `:34`) | urls | [] | `ugcProductImageUrls` |
| Script campaign/tone/source | `SeedanceScriptStep.tsx:56-80` | product-showcase/testimonial/promo/educational/unboxing; casual/energetic/calm/professional; Generate (`POST /api/scripts`)/Saved/Write | — | `campaignType`,`tone`,`script`,`scriptText`,`scriptId` |
| Influencer | `UgcMode.tsx:70-72` tabs Generate/Gallery/Upload | url | generate | `ugcInfluencerImageUrl` |
| Avatar traits | `UgcMode.tsx:75-81,266-299` (from `lib/seedance/ugc-image-prompt.ts`) | — | Latina/Medium/25-34/… | local |
| Director prompt | textarea `Step3:474-479`, Regenerate `:456-469` | text | vision output | `directorPrompt` |
| Multi-frame segments | `Step3:391-449` (unreachable) | `{prompt,duration 1–15}`, total 4–15 | — | `directorMultiFramePrompts` |
Duration duplication: `EnhancorSettingsPanel.tsx:127-132` offers only 5/8/10/15 in editable mode.

### Input sourcing + uploads

- **Product picker** `ProductReferencePicker.tsx`: `GET /api/product-categories` → flattens `cat.images[]` (`:54-67`) = `product_reference_images`. Upload: hidden `<input type=file accept=image/* multiple>` `:242-249` → `POST /api/products/upload` (FormData `file`) → `app/api/products/upload/route.ts` → `uploadProductImage()` → bucket `brand-assets`, path `products/product-{ts}-{uuid}` (`lib/supabase/storage.ts:91-118`); row under "Custom Uploads"; 10 MB; PNG/JPEG transcode (`toEnhancorCompatibleImage`).
- **Influencer picker** `UgcMode.tsx`: Generate → `POST /api/seedance/generate-ugc-image` (`:137-152`); Gallery → `GET /api/images?limit=24&assetTag=ugc-avatar` (`:108-110`); Upload → `InfluencerPicker` (`:502-589`) → `POST /api/images/upload` → bucket `generated-images`, path `cocolash/{uuid}-influencer-upload.{ext}` (no DB row inserted).
- `components/video/seedance-v4/lib/upload.ts:22-54` `uploadSeedanceMedia(file, "audio"|"image"|"video")` client-side direct upload (anon key) → `brand-assets/audio/v4-*` or `brand-assets/products/v4-*` (video also lands in `products/`), 50 MB cap — **blocked in practice**: `brand-assets` allows only image MIME and 5 MB. Used by MultiReferenceMode (`:55`), LipsyncMode (`:36,60`), FirstAndLastFrameMode (`:124`).
- Existing audio upload UI: `LipsyncMode.tsx:111-181` `UploadCard` (accept audio/*, 15 MB, `<audio controls>`). **No video-file upload UI exists**; `multiReferenceVideoUrl`/`lipsyncVideoUrl` state keys never set.
- Other `<input type=file>`: `components/settings/ProductImageUploader.tsx:186`, `ProductCategoryManager.tsx:208`, `LogoUploader.tsx:199`, `components/generate/ProductSubCategorySelector.tsx:194`. No dropzone lib.
- Buckets enum `lib/supabase/storage.ts:17-24`: `generated-images`, `brand-assets`, `chat-kb-uploads`, `chat-selfies`. **New bucket `video-inputs` created 2026-09-08** (public, 50 MB, video/mp4|quicktime|webm|x-m4v, audio/mpeg|mp3|wav|x-wav|wave|mp4|x-m4a|m4a|aac|ogg|webm|flac, image/png|jpeg|webp) — not yet in the enum.

### Submit / progress / results

- Submit `Step3PromptReviewAndGenerate.tsx:247-284` → `POST /api/seedance/generate`. UGC body via `buildEnhancorBodyV4UGC` `:693-721`: `{type:"image-to-video", seedanceMode:"ugc", prompt, duration, resolution, aspectRatio, fullAccess, unrestricted, quality, influencers:[url], products:[…], scriptText, campaignType, tone, fastMode, personImageUrl, productImageUrl, overridePrompt}`. Other modes `buildEnhancorBody` `:723-812` add `images[]`, `videos[]`, `audios[]`, `firstFrameImage`, `lastFrameImage`, `multiFramePrompts[]`, `productSku`. Prompt authored first via `POST /api/seedance/director-vision` (`:77-99`, UGC) or `/api/seedance/director` (`:135-139`).
- Progress: none in wizard (static "Submitted… open /video/gallery" card `:533-560`). Gallery reconcile 15 s. POC polls 12 s.
- Results: `gallery/page.tsx` → `GET /api/videos?limit&offset&status&pipeline` → `VideoCard` (badge "Seedance" `:129-133`, thumb from `thumbnail_url|composed_image_url|person_image_url` `:45`) → `VideoModal` (`<video src={final_video_url ?? raw_video_url}>` `:72,123-133`, metadata grid `:158-198`, download `/api/videos/[id]/download`, delete). No mode/resolution/engine shown.

### Shared types / schemas

`lib/seedance/types.ts`; `lib/seedance/mode-allowlist.ts:24-67`; `lib/ai/director/types.ts` (`DirectorMode` :14-20, `DirectorInput` :30-104); `components/video/seedance-v4/types.ts`; `lib/types/index.ts:542-681`; `lib/costs/estimates.ts`. Zod only on director/director-vision/last-frame/extract-product-facts/POC. **No zod on `/api/seedance/generate`; nothing shared UI↔API.**

### Design system

Tokens `app/globals.css:57-78`: `coco-pink[-light|-dark|-soft]`, `coco-brown[-light|-medium]`, `coco-golden[-light|-dark]`, `coco-beige[-light|-dark]`, `coco-charcoal`, `coco-white`, `coco-cream`, `coco-red`, `coco-red-500`. Patterns: section card `rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4` + `text-sm font-semibold text-coco-brown` header (Step1:31-39); segmented pill tabs `flex gap-1.5 rounded-lg bg-coco-beige/50 p-1` + active `bg-white text-coco-brown shadow-sm` (UgcMode `TabBtn` :443-469); option tiles `rounded-lg border-2 … active: border-coco-golden bg-coco-golden/10` (EnhancorSettingsPanel:153-176); primary CTA `bg-coco-golden py-5 text-white hover:bg-coco-golden-dark`; hand-rolled toggle EnhancorSettingsPanel:276-297. `components/ui/`: badge, button, card, dialog, dropdown-menu, image-lightbox, image-loader, input, label, safe-thumbnail, scroll-area, select, separator, skeleton, sonner, switch, tabs, toggle, toggle-group, tooltip — no slider/collapsible/accordion/progress wrappers (radix-ui exports them). "Advanced" collapsible pattern `ScriptGenerator.tsx:124,498-521`; native `<details>` at `FirstAndLastFrameMode.tsx:420-427`. Mode explainer: `CapabilityCard.tsx` + `lib/mode-capabilities.ts`.

### Gaps vs 2.5

Mode selector (none); duration 4–30/-1 (select 4–15, types cap "15", server buckets); aspect 21:9/1:1/adaptive (UI type limited); images ≤30 (MultiReference caps 6, products 9); videos (no upload UI, `lib/upload.ts` misroutes to products/); audios (single only); products+influencers ≤30 (1 + 9 today); first/last frame only in unreachable mode; multi_frame list only in unreachable Step 3 branch; `lipsyncing_audio` sent as `audios[]` by client (`Step3:790`); `pass_faces` vs `full_access` naming; `is_uncensored` vs `unrestricted`; `output_format` none; `bitrate_mode` vs `quality`; no in-wizard progress; no result metadata.

---

## C. Input assets & storage (live data, 2026-09-08)

### Product reference library

Tables (DDL only in `scripts/migrate-product-categories.mjs:15-40`; migration file is empty): `product_categories(id, key UNIQUE, label, description, prompt_template, sort_order, …)`, `product_reference_images(id, category_id FK, image_url NOT NULL, storage_path NOT NULL, sort_order, created_at)`.
Writers: `POST /api/product-categories/[id]/images` (`app/api/product-categories/[id]/images/route.ts:11-83`, JSON `{image_url, storage_path}`); `POST /api/products/upload`; scripts `scripts/upload-category-images.mjs`, **`scripts/seed-sorrel-references.ts` (idempotent, creates category `sorrel` from `--images`/`--urls`; never run)**. No Shopify sync.
Storage: `brand-assets` (public, 5 MB, image MIME). URL `https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/brand-assets/products/…`. 75 rows, all HEAD 200.
Consumers: `lib/brand/get-product-references.ts:39-51`; `lib/seedance/reference-resolver.ts:56-130` (library = product shots only; influencers only from request); `lib/brand/product-truth.ts:36-53` (7 allowed keys; `custom-uploads` not in type).

Live contents (keyed by PACKAGING category, not SKU): single-black-tray 5 ("Dahlia, Poppy, Marigold, Orchid, Rose"), single-nude-tray 5 ("Daisy, Iris, Jasmine, Peony, Violet"), multi-lash-book 5, full-kit-pouch 4, full-kit-box 11, storage-pouch 3, branding-flatlay 6, custom-uploads 36.
**Sorrel: absent.** Only mapping: `product-truth.ts:213-226` sku `sorrel` → `categoryKey:"single-nude-tray"` (wrong: Sorrel is dark brown); `sorrel-4pack` → `multi-lash-book` (:228-241). **Fern, Ivy: absent** from library and product-truth. Nothing named 4-pack/cluster/half in the library; product-truth has 11 `*-4pack` SKUs → `multi-lash-book`.

### Shopify

`lib/shopify/storefront.ts` — `searchProducts`, `getProductByHandle`, `getProductsByHandles`; private-token header auto-detect (:68-73); version `SHOPIFY_STOREFRONT_API_VERSION` default 2025-01 (:46); fetches only `featuredImage` (:136); chatbot-only.
Live store = 16 products: daisy-lash-kit (5 imgs), violet-subtle-charm (5), peony-soft-sophistication (6), jasmine-delicate-beauty (6), marigold-radiant-warmth (5), dahlia-lash-extensions (5), orchid-exotic-sophistication (9), poppy-dramatic-allure (7), iris-striking-drama (6), rose-romantic-boldness (5), cocolash-kit-ultimate-lash-essentials (10), Bond + Sealant Duo (3), fan (0), **sorrel (6)**, **fern — "Fern Half Lash Kit" (8)**, **ivy — "Ivy Half Lash Kit" (7)**.
**Sorrel** = `gid://shopify/Product/8600089526471`, type "Brown Volume Lash", 6 public 800×800 images on `cdn.shopify.com/s/files/1/0660/8646/9831/files/` (`Sorel_Dark_Brown_Extreme_Closeup_…png`, `…EyeCloseup…`, `…Dark_Brown_…png`, `…FullFace…`, `…Product…png`, `Productwithbox2_…jpg`), all HEAD 200.
Mismatch: `product-truth.ts` `productHandle` values (`violet`, `daisy`, `dahlia`, `*-4pack`) don't match live handles — only `sorrel` and `cocolash-kit-ultimate-lash-essentials` resolve.

### Generated images / gallery

`generated_images` (368 rows; `image_url, raw_image_url, storage_path, category, tags, selections, is_composite, brand_id, user_id`). Bucket `generated-images` (public, 10 MB). URL builder `lib/supabase/storage.ts:27-56`. `cocolash/` prefix = video-wizard assets: `-studio-avatar.jpg` ×17 (tag `studio-avatar`), `-ugc.jpg` ×18 (tag `ugc-avatar`), `-composed.jpg` ×2, `-influencer-upload.jpg` ×43 (**no DB row**), `-lastframe.jpg`. `chatbot-tryon/` ×36 = customer selfies (privacy — never use). "Influencer" concept = `selections.heygenAsset.kind ∈ {studio-avatar, ugc-avatar, heygen-composition}` (`lib/video/insert-gallery-asset.ts:29-47`); `GET /api/images?assetTag=…` (`app/api/images/route.ts:41-50`).

### HeyGen avatars / audio

`avatar_image_url` (63 rows): 53 on `files2.heygen.ai` are expired signed URLs (403); 10 Supabase. `voice_options` = 2,317 HeyGen voices with public `.wav` previews. ElevenLabs `lib/elevenlabs/client.ts:217` `synthesizeToAudio` → mp3 buffer → HeyGen `uploadAudioAsset`; **never persisted** → no reusable audio URL exists. `brand-assets/audio/` empty; 0/155 `audio_url` set.

### Generated videos

155 rows (86 seedance / 69 heygen; 125 completed / 27 failed). Seedance `raw_video_url` = `https://d2i9jqncnkplwq.cloudfront.net/videos/<uuid>.mp4` (74 rows, public, oldest 2026-04-29 still 200). `final_video_url` = Cloudinary: **`dtnvppaty` 59 rows → 401 (dead account)**, `dyianrt0w` 52 live, `dum01wgok` 1. HeyGen raws expired. Nothing in the UI picks from `generated_videos`.

### Summary matrix

| Input | Exists today | Missing |
|---|---|---|
| Product image | library (75, category-keyed); wizard upload; Shopify CDN (Sorrel 6/Fern 8/Ivy 7, public) only hard-coded in POC | SKU entries for Sorrel/Fern/Ivy; Shopify picker; `custom-uploads` in resolver type |
| Influencer image | gallery ugc-avatar 18 / studio-avatar 17 / composition 2; 43 orphan uploads | persistent influencer library |
| Generic reference image | any Supabase image; v4 uploads (`products/v4-*`, 21) | DB tracking |
| First / last frame | ugc-avatar gallery or upload; NanoBanana last frame | — |
| Reference video | URL text field only; 74 CloudFront + 52 live Cloudinary results usable | upload path (now: `video-inputs` bucket), picker from `generated_videos` |
| Reference audio | HeyGen preview .wavs only | working upload (now: `video-inputs`), stored brand audio |
| Lipsync audio | ElevenLabs pipeline exists | persisted TTS (deferred, D13) |

---

## D. Infrastructure

- **Tests:** vitest 2.x, `vitest.config.ts` (`**/*.test.ts(x)`, node env, alias `@`), `npm test` = `vitest run`. **Baseline 57 files / 506 tests / 0 failed / 2.1 s.** Layout `tests/<area>/*.test.ts` (+ a few co-located). Mock patterns: route handler + `vi.mock("@/lib/supabase/server")` chain mocks (`tests/api/publish.test.ts:1-75`, `tests/api/settings-blotato-status.test.ts:18-60`); thenable Supabase chain for atomic claim (`tests/seedance/completion-no-captions.test.ts:32-67`); global fetch capture (`tests/heygen/v3-generate.test.ts:18-33`); pure payload-shape tests (`tests/seedance/enhancor-payload-shape.test.ts`); config regression (`tests/config/next-image-hosts.test.ts` asserts `next.config.ts` `remotePatterns` — currently `res.cloudinary.com`, `**.heygen.ai`, `**.cloudfront.net`; add `cdn.shopify.com` + supabase host if `next/image` will render them).
- **Settings:** no `lib/settings/`, no per-user table. Settings page `app/(protected)/settings/page.tsx` composes `BrandProfileForm`, `CaptionSettingsForm`, `CostSummary`, `UserManager`; admin gating via `/api/auth/me` (`isAdmin` = `admin@cocolash.com` or `user_metadata.role==="admin"`, `app/api/auth/me/route.ts:4-18`). Global singleton tables: `brand_profiles` (no DDL in repo), `caption_settings` (`20260307…:62-71`, lazy seed + PATCH whitelist `app/api/settings/captions/route.ts:30-166`), **`chat_settings` (`20260502_chatbot_foundation.sql:181-194`, `is_singleton UNIQUE`, accessors `lib/chat/db.ts:23-58`, admin PATCH with zod + `requireChatAdmin` `app/api/chatbot/admin/settings/route.ts:10-40`) — best template for a global settings row.** Wizard defaults are client constants (`seedance-v4/types.ts:102-132`) + server defaults (`generate/route.ts:153-175`).
- **Feature flags:** none. Env refs: `ENHANCOR_API_KEY`, `ENHANCOR_API_BASE_URL`, `ENHANCOR_WEBHOOK_URL`, `ENHANCOR_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, `HEYGEN_*`, `CLOUDINARY_*`, `SHOTSTACK_*`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`. `.env.local` has all Enhancor/Cloudinary/Supabase/ElevenLabs keys; **no DATABASE_URL, no Supabase CLI, no exec-SQL RPC** → migrations must be pasted into the Supabase SQL editor by Harry.
- **Auth for routes:** middleware + `createClient()`/`getCurrentUserId` (`lib/supabase/server.ts:5-12`); privileged writes `createAdminClient()` (:46-69); admin-only `requireChatAdmin` (`lib/chat/admin-auth.ts:40-64`).
- **Background jobs:** none (`vercel.json` = `{ "fluid": true }`); webhook + client polling with self-heal. `maxDuration` 300 on generate routes; status/webhook default.
- **Lint/typecheck:** `npm run lint` (eslint flat), `npx tsc --noEmit` (strict; excludes `widget`). `npm run build` = widget build + `next build`. No CI. Stray `.next/**/* 2.ts` files break tsc → `rm -rf .next`.
- **Docs conventions:** `.planning/` gitignored (GSD; not used for this work per D15). `docs/` committed.
