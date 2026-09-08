# Seedance 2.5 — What shipped (04-SHIPPED.md)

Status: Waves 0 + 1 committed (`bdbb836`, `88bc1d7`). This file describes what is
**in the code**, not what was planned. Plan: `03-PLAN.md` · Locked decisions:
`02-DECISIONS.md` · API + real pricing: `01-API-REFERENCE.md`.

---

## 1. What shipped

**A second video engine.** `Seedance 2.5` is now the default; `Seedance 2.0`
stays fully working as "legacy". Every `generated_videos` row records which
engine produced it (`engine` column, DB default `'2.0'`), plus mode, tier,
resolution, duration, all input URLs, the normalized request payload and the
real credit cost — enough to run the 2.0-vs-2.5 comparison later without
re-deriving anything.

| Area | What's there |
|---|---|
| Modes | All 9: `ugc` (default), `text_to_video`, `multi_reference`, `first_n_last_frames`, `multi_frame`, `edit`, `extend`, `lipsyncing`, `voice_clone`. 2.0 still offers only its 6. |
| Quality tiers | `Draft 480p` · `Draft 720p` (default) · `Final 1080p`, plus **Re-render as Final** on any finished draft. |
| Duration | 4–30 s slider **or Auto** (`-1`). `edit` is locked to Auto; `multi_frame` length = sum of its segments. |
| Aspect | 7 ratios (21:9, 16:9, 4:3, 1:1, 3:4, 9:16, adaptive); forced `adaptive` for edit / extend / first+last frame. |
| Advanced | `pass_faces` (on), `is_uncensored` (off, labelled "Unrestricted content"), `output_format` (mp4; mov default for edit/extend), `bitrate_mode`. |
| Inputs | New public `video-inputs` bucket (50 MB) for video/audio/image; "From your videos" picker; URL paste; "Store products" tab pulling live Shopify images. |
| Pricing | Real Enhancor credit tables in-app: estimate before Generate, **actual** cost recorded from the callback. Rates and $/credit are editable in Settings. |
| Products | `scripts/seed-shopify-references.ts` seeds `sorrel` / `fern` / `ivy` reference categories; Sorrel now resolves to its own dark-brown imagery. |
| Gallery | Engine / mode / tier / duration / credits on `VideoCard` + `VideoModal`; engine filter chips (Seedance 2.5 / Seedance 2.0 / HeyGen). |

Tests recorded at the Wave-1 commit: **83 files / 906 tests green** (baseline
before this work: 57 / 506).

### Routes

| Route | Method | Auth |
|---|---|---|
| `/api/seedance/generate` | POST | signed-in (middleware). Branches on the body: `isSeedance25GenerateBody(body)` → 2.5 path, else the untouched 2.0 handler. `maxDuration = 300`. |
| `/api/seedance/[id]/status` | GET | signed-in. Branches on the row's `engine`; backfills `credits_cost`. |
| `/api/seedance/[id]/rerender` | POST | signed-in. `runtime = "nodejs"`. |
| `/api/seedance/webhook` | POST | **public** (middleware allow-list) — guarded by `?token=` / `x-webhook-secret`, 401 otherwise. Shared by both engines. |
| `/api/settings/video` | GET | signed-in — returns defaults + rates (never fails). |
| `/api/settings/video` | PATCH | **admin only** (`requireChatAdmin`) — 401 not authenticated, 403 forbidden. |
| `/api/video-inputs/sign` | POST | signed-in — mints a signed direct-upload URL for video/audio. |
| `/api/video-inputs/upload` | POST | signed-in — multipart image upload, transcoded to PNG/JPEG. |
| `/api/videos/inputs` | GET | signed-in — finished videos with a live public URL ("From your videos"). |
| `/api/shopify/product-images` | GET | signed-in — live Storefront images, PNG/JPEG only, 15-min cache. |
| `/api/videos?engine=2.0\|2.5` | GET | signed-in — engine filter for the gallery. |

Everything except the webhook sits behind the app's dual auth (Supabase session
**or** the `cocolash-auth` password cookie). No admin gating on generation —
2.5 is live for everyone (D12).

---

## 2. How to use it (Faith-facing walkthrough)

`/video` → **Seedance** → 3-step wizard. A fresh wizard picks up the global
defaults from Settings; after that the browser remembers your last-used values.

**Step 1 — Script + Mode**
1. **Engine**: Seedance 2.5 (default) or Seedance 2.0 (legacy). Switching
   engines auto-corrects anything the other engine can't do (e.g. a 30 s
   duration drops to 15 s on 2.0) and a toast says what changed.
2. **Mode**: pick one of the nine tiles. UGC is the default — influencer +
   product images. The tile copy says exactly what each mode needs.
3. **Script**: write it or let the Director write it. Script length is sized to
   the duration you choose (4–30 s), not bucketed.

**Step 2 — Inputs** shows only the fields the chosen mode actually accepts.
- Images: upload, paste a URL, pick from the saved library, or the **Store
  products** tab (live Shopify photos — Sorrel, Fern and Ivy included).
- Video/audio: upload (up to 50 MB, straight to storage), paste a public URL, or
  **From your videos** — any finished clip that still has a working link.
- Counters cap where the API caps: 30 images (UGC: products + influencers
  combined ≤ 30), 10 videos, 10 audios.

**Step 3 — Prompt review + Generate**
- **Quality**: Draft 480p (cheapest) · Draft 720p (default) · Final 1080p.
- **Duration**: 4–30 s slider, or Auto (Auto is estimated at 10 s for the price
  shown, and labelled as such).
- **Advanced** (collapsed): keep faces, unrestricted content, output format,
  bitrate.
- The **estimate in credits and ≈ USD** is shown in the wizard header and again
  above the Generate button. Approve → progress appears in-wizard (polled every
  12 s) and the finished video plays inline. Typical wait 2–10 minutes.
- The finished draft shows **Re-render as Final**. That re-submits the
  *identical* prompt and *identical* inputs at 1080p — only the duration can be
  changed first — and shows the 1080p price before it queues anything. The new
  video is linked to the original in the gallery.

**Gallery** (`/video/gallery`): chips filter Seedance 2.5 / Seedance 2.0 /
HeyGen. Each card shows engine, mode, tier and credits; the modal adds
resolution, duration and ≈ USD.

---

## 3. Runbook (Harry)

### 3.1 Apply the SQL — **before** pushing

There is no SQL execution path from this machine, so the schema change ships as
one file: `supabase/migrations/20260908_seedance25.sql`.

> Supabase Dashboard → **SQL Editor** → **New query** → paste the **entire**
> file → **Run**.

It is idempotent — safe to run twice. It adds the 14 `generated_videos` columns
+ 2 indexes, creates the single-row `video_settings` table (seeded, RLS on,
authenticated SELECT), and re-asserts the `video-inputs` bucket.

Verify:

```sql
select column_name from information_schema.columns
 where table_name='generated_videos'
   and column_name in ('engine','credits_cost','request_payload','rerender_of');
-- 4 rows

select default_engine, default_quality_tier, default_duration, usd_per_credit
  from video_settings;
-- 1 row: 2.5 | draft-720p | 8 | 0.001

select id, public, file_size_limit from storage.buckets where id='video-inputs';
-- 1 row
```

If the SQL editor rejects the `storage.buckets` insert (section 3 of the file),
delete that section and re-run — the bucket already exists and everything above
it is independent.

### 3.2 Seed the product references

```bash
npx tsx scripts/seed-shopify-references.ts --handles sorrel,fern,ivy --dry-run
npx tsx scripts/seed-shopify-references.ts --handles sorrel,fern,ivy
```

Reads the Storefront API, re-hosts each PNG/JPEG into
`brand-assets/products/shopify/<handle>-<n>.<ext>` and attaches it to a
`product_categories` row keyed by handle. Idempotent — re-running changes
nothing. `--dry-run` writes nothing and prints each product description.

### 3.3 Push

```bash
gh auth switch --user ai-harry
git add <explicit paths>          # never `git add .`
git push origin main              # auto-deploys to Vercel
```

Env vars are already set in production (`ENHANCOR_API_KEY`,
`ENHANCOR_WEBHOOK_URL` or `NEXT_PUBLIC_APP_URL`, `ENHANCOR_WEBHOOK_SECRET`,
`SHOPIFY_*`, `SUPABASE_SERVICE_ROLE_KEY`). 2.5 reuses the same Enhancor key and
the same webhook route as 2.0 — nothing new to add.

### 3.4 Post-deploy probes

```bash
BASE=https://cocolash-ai-suite.vercel.app

curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/settings/video
# 307 → /login  (route exists, auth gate works)

curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/seedance/webhook -d '{}'
# 401  (public route alive, secret enforced)

curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/shopify/product-images
# 307

# logged in (cookie from browser devtools):
curl -s -H "Cookie: cocolash-auth=$AUTH_TOKEN" $BASE/api/settings/video | jq .fromDatabase
# true once the SQL has run
```

Then one real job on production: UGC, **Draft 480p, 4 s ≈ 489 credits ≈ $0.49**.
Confirm the video plays, the credits land on the row, and Re-render as Final
creates a linked 1080p row.

### 3.5 Rollback

`git revert <sha> && git push`. 2.0 keeps working — the new columns are nullable
and unused by the legacy path. A SQL rollback block is commented at the bottom
of the migration file; it is almost never needed (the bucket is deliberately
left in place because it may hold uploads).

---

## 4. How costs work

**1 credit = $0.001.** Enhancor charges **per second**: credits/sec × billable
seconds.

| Resolution | standard cr/sec | uncensored | reduced cr/sec | 30 s @ standard |
|---|---|---|---|---|
| 480p | 122.2 | 123.422 | 72.9 | $3.67 |
| 720p | 269.3 | 271.993 | 165.5 | $8.08 |
| 1080p | 487.3 | 492.173 | 292.8 | $14.62 |

The **reduced** column applies to `multi_reference` / `edit` / `extend` /
`multi_frame` when the request carries `videos[]`; billable seconds then include
the input video duration as well as the output.

**Estimated (before Generate).** `estimateCredits()` in `lib/seedance/pricing.ts`
reads the live rates from `video_settings`, multiplies by billable seconds, and
converts with `usd_per_credit`. It is shown in the wizard header, on Step 3 and
in the Re-render dialog, and is written to `processing_cost` when the row is
inserted so a job is never free-looking while it runs.

**Actual (after completion).** The 2.5 callback (and the status poll) carries
`cost`. `completeSeedanceVideo` writes it to `credits_cost` and sets
`processing_cost = creditsToUsd(cost, usd_per_credit)` — the actual number
replaces the estimate. If a completed 2.5 row still has no `credits_cost`, the
next status poll asks Enhancor once and backfills it.

Seedance 2.0 pricing is unchanged (its own $/second constants; it reports no
cost).

Anchors to sanity-check against: 720p × 8 s = 2,154.4 credits; 480p × 4 s =
488.8; the POC's 720p × 6 s = 1,615.8.

---

## 5. How to change rates

Enhancor can change its prices. Nothing is hard-coded at the call site — the
numbers above are **seeds**, and the live values live in the single
`video_settings` row.

**Settings → "Video defaults"** (admins only; everyone else sees it read-only):

- Default **engine**, **quality tier**, **duration** (or Auto) and **aspect
  ratio** — these seed a *fresh* wizard; a returning browser keeps its own
  last-used values.
- **USD per credit** (default 0.001).
- **Rate tables** — both grids (standard and reduced), standard and uncensored
  columns, all six resolutions. A live preview line prices 1080p × 30 s with
  whatever is currently in the form, and a **"Reset to Enhancor 2026-09 rates"**
  button restores the seeded values.

Save writes only the changed keys via `PATCH /api/settings/video`. The change is
global and takes effect on the next estimate; jobs already completed keep the
cost they were actually charged.

If the migration has not been applied the card shows an amber banner naming the
SQL file and Save is disabled.

---

## 6. Operations

**Webhook.** `POST /api/seedance/webhook` is the single public callback for both
engines (in the middleware allow-list; secret via `?token=` or
`x-webhook-secret`, else 401). Enhancor may deliver the same `request_id` more
than once — completion is claimed atomically (`WHERE heygen_status IN
(pending, processing, captioning)`), so the first callback wins and repeats are
no-ops. The webhook never calls `/queue` and never retries anything.

**Status polling.** `GET /api/seedance/[id]/status` branches on the row's
engine: 2.5 hits `POST {2.5 base}/status` (idempotent, one retry is fine), 2.0
keeps its existing client. The wizard polls every 12 s; the gallery reconciles
as before. This is also how a job completes in local dev, where the webhook
cannot reach `localhost`.

**Never retry `/queue`.** A retried queue POST is a second billed job. The 2.5
client sends exactly one POST, with no retry wrapper, and the row is inserted
*before* the queue call so a failed insert can never bill. The webhook URL
carries the secret, so it is redacted in logs and excluded from the stored
`request_payload`.

**Migration guard.** Every write that touches a new column goes through
`lib/seedance/v25/db.ts`. Before the SQL is applied:
- a 2.5 generate returns **503 `{ code: "migration_required" }`** naming the SQL
  file, and **Enhancor is never called**;
- `PATCH /api/settings/video` returns 503; `GET` returns defaults with
  `missingTable: true`;
- `/api/videos?engine=…` returns the same 503 body;
- updates to legacy rows strip the new columns and retry;
- **Seedance 2.0 and HeyGen keep working**, before and after.

**Buckets.** `video-inputs` (public, 50 MB) holds video/audio/image references,
laid out as `<kind>/<yyyy>/<mm>/<uuid>.<ext>`. Video and audio never pass
through a route handler — Vercel caps request bodies around 4.5 MB — so
`/api/video-inputs/sign` mints a signed upload URL and the browser uploads
directly. Images (≤ 10 MB) go through `/api/video-inputs/upload` so they are
normalised to PNG/JPEG, which is all Enhancor accepts. Product reference images
still live in `brand-assets`.

**Re-render.** `POST /api/seedance/[id]/rerender` replays the stored
`request_payload` at 1080p. It refuses with 409 `not_rerenderable` if the row is
not Seedance 2.5, has no stored payload, is not completed, or is already 1080p.

---

## 7. Known limits / next

1. **Voiceover generation is deferred (D13).** Lip-sync and voice-clone take an
   uploaded or pasted audio URL only — there is no ElevenLabs "generate the
   voiceover for me" step yet.
2. **2.0-vs-2.5 A/B demo is the next workstream.** Every row already stores
   engine, mode, prompt, all input URLs, resolution, duration and credits, so
   re-running Faith's two failure cases side by side is a UI job, not a data
   job.
3. **Auto duration is estimated at 10 s.** Enhancor decides the real length, so
   the pre-flight price for Auto is an estimate and is labelled everywhere it is
   shown. The actual cost from the callback is authoritative.
4. **Reduced-rate input seconds are not probed.** For modes billed on input +
   output seconds we do not measure the uploaded video's duration, so the
   estimate bills output seconds only and says so. Expect the actual cost to be
   higher than the estimate for `edit` / `extend` / `multi_frame` /
   `multi_reference` with video inputs.
5. **Prices can drift.** The tables are seeded from the Enhancor account on
   2026-09-08. If a bill looks wrong, compare `credits_cost` against the
   estimate and update the rates in Settings (§5).
6. **Cost dashboard split by engine** (Wave 2 G) and the scripted end-to-end
   smoke run (`scripts/smoke-seedance25.ts`, Wave 2 H) are the remaining pieces
   of this pass.
