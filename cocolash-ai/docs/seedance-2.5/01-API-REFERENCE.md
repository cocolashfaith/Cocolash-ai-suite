# Seedance 2.5 (Enhancor) — API Reference

Source: Enhancor "Seedance 2.5 Unrestricted New API" docs (pasted by Harry 2026-09-08) + Enhancor pricing page + credit top-up screen (screenshots 2026-09-08). Proven end-to-end by the POC in `app/api/poc/seedance25/route.ts` / `poc/seedance25-ugc.ts` (request `6a95874de2790f515a8f104a` → 720p 6 s UGC video, cost 1615.8 credits = 269.3 × 6).

## Base URL + auth

```
POST https://apireq.enhancor.ai/api/seedance2.5/v1/queue
POST https://apireq.enhancor.ai/api/seedance2.5/v1/status   body: {"request_id": "..."}
header: x-api-key: <ENHANCOR_API_KEY>   (same key as 2.0)
```

- `/status` **is confirmed working** for 2.5 (probed 2026-09-08). Response:
  `{"success":true,"requestId":"…","status":"COMPLETED","result":"https://d2i9jqncnkplwq.cloudfront.net/videos/<uuid>.mp4","thumbnail":"https://d2i9jqncnkplwq.cloudfront.net/thumbnails/<uuid>.webp","cost":1615.8}`
- `GET /status?request_id=` → 404 (POST only).
- No balance / credits endpoint exists (`/api/balance`, `/api/credits` → 404).
- Queue response: `{"success":true,"requestId":"<24-hex>"}`.
- **Send ONE POST to `/queue` — never retry a queue call** (a retry = a second billed job).

## Differences from the 2.0 client we run today

| | 2.0 (`lib/seedance/client.ts`) | 2.5 |
|---|---|---|
| base | `…/api/enhancor-ugc-full-access/v1` | `…/api/seedance2.5/v1` |
| `type` field | `"text-to-video"` / `"image-to-video"` | **none** — `mode` only |
| modes | ugc, multi_reference, multi_frame, first_n_last_frames, lipsyncing | + `text_to_video`, `edit`, `extend`, `voice_clone` |
| faces flag | `full_access` | `pass_faces` (bool, default false) |
| NSFW flag | `unrestricted` (dropped by allow-list today) | `is_uncensored` (bool, default false; uses the uncensored rate) |
| quality | `quality: standard|high`, `fast_mode` | `bitrate_mode: standard|high`; no fast_mode |
| output format | — | `output_format: mp4|mov` (default mov for edit/extend) |
| duration | 4–15 (server buckets to 5/8/10/15) | **4–30** or `-1` auto; `edit` requires `-1` |
| aspect | 9:16,16:9,3:4,4:3 (UI) | 21:9,16:9,4:3,1:1,3:4,9:16,adaptive; forced `adaptive` for edit/extend/first_n_last_frames |
| webhook | optional | **required** (`webhook_url`) |
| webhook payload | `{request_id,status,result,thumbnail,error}` | `{request_id,result,status:"COMPLETED",cost}` / `{request_id,status:"FAILED",error}` — may arrive **multiple times**, dedupe on first |

## Modes × media fields

| Mode | images | videos | audios | Special fields |
|---|---|---|---|---|
| `text_to_video` | — | — | — | prompt only |
| `first_n_last_frames` | — | — | — | `first_frame_image` required; `last_frame_image` optional; aspect forced adaptive |
| `multi_reference` | opt† | opt† | opt† | cite as `@image1 @video1 @audio1` in prompt |
| `edit` | opt | **required ≥1** | opt | `duration` must be `-1`; aspect forced adaptive; default output mov; input video 4–30 s |
| `extend` | opt | **required ≥1** | opt | aspect forced adaptive; default output mov |
| `multi_frame` | opt | opt | opt | `multi_frame_prompts: [{prompt,duration}]` required, durations sum 4–30; top-level prompt/duration unused |
| `lipsyncing` | **required ≥1** | — | — | `lipsyncing_audio` URL required (≤30 s) |
| `voice_clone` | **required ≥1** | — | — | `lipsyncing_audio` URL required (≤30 s) |
| `ugc` | — (use `products`/`influencers`) | — | — | `products[]` and/or `influencers[]` required; combined ≤30; do NOT send videos/audios |

† `multi_reference` requires at least one of images/videos/audios.

Limits: images ≤30 (ugc: products+influencers ≤30), videos ≤10 (combined duration <30 s), audios ≤10 (combined <30 s), `lipsyncing_audio` ≤30 s. All media must be **public URLs**. Images: PNG/JPEG (keep using `toEnhancorCompatibleImage`).

## Full parameter list

Required: `prompt` (except multi_frame), `mode`, `webhook_url`.
Optional: `duration` (string|number, default "10"; 4–30 or -1), `resolution` (`480p|720p|1080p`, default 720p), `aspect_ratio` (default 16:9), `images[]`, `videos[]`, `audios[]`, `multi_frame_prompts[]`, `lipsyncing_audio`, `products[]`, `influencers[]`, `first_frame_image`, `last_frame_image`, `pass_faces` (bool), `is_uncensored` (bool), `output_format` (`mp4|mov`), `bitrate_mode` (`standard|high`, default standard).

## Pricing (REAL, from Enhancor account — 2026-09-08)

**1 credit = $0.001 USD** (top-up: $25 = 25,000 credits … $250 = 250,000 credits; pricing page: "credits = USD × 1000"). Auto top-up is ON on the account.

Credits are charged **per second**. Total = credits/sec × billable seconds.

### Standard rates — no video inputs (billable = output duration)

| Resolution | credits/sec | uncensored credits/sec | $/sec | $ per 30 s |
|---|---|---|---|---|
| 480p | 122.2 | 123.422 | $0.1222 | **$3.67** |
| 720p | 269.3 | 271.993 | $0.2693 | **$8.08** |
| 1080p | 487.3 | 492.173 | $0.4873 | **$14.62** |

### Reduced rates — WITH video inputs, modes `multi_reference | edit | extend | multi_frame` (billable = input video duration + output duration)

| Resolution | credits/sec | uncensored credits/sec | $/sec |
|---|---|---|---|
| 480p | 72.9 | 73.629 | $0.0729 |
| 720p | 165.5 | 167.155 | $0.1655 |
| 1080p | 292.8 | 295.728 | $0.2928 |

When `is_uncensored: true` the uncensored column applies. Rates "update when pricing is changed in admin" → keep them editable in app settings, seed with these values.

**Answer to Faith's pricing question:** "$14 per 30-second video" = **1080p** (14,619 credits = $14.62). 720p/30 s = $8.08. 480p/30 s = $3.67. Her "$35 for 1080p" is not what the account is charged.

## Webhook delivery notes

- `User-Agent: node-fetch/1.0`, `Content-Type: application/json`, origin AWS us-east-1.
- Callbacks may repeat for the same `request_id` → idempotent handling (first wins).
- Typical completion 2–10 min (POC: 6.7 min for 6 s @720p).

## Copy-ready UGC example (proven shape)

```json
{
  "mode": "ugc",
  "prompt": "The influencer holds the product and smiles at the camera",
  "duration": "8",
  "resolution": "720p",
  "aspect_ratio": "9:16",
  "webhook_url": "https://cocolash-ai-suite.vercel.app/api/seedance/webhook?token=…",
  "pass_faces": true,
  "products": ["https://cdn.shopify.com/s/files/1/0660/8646/9831/files/dahlia-915557.jpg"],
  "influencers": ["https://exkdmmxbrsgefpciyqkz.supabase.co/storage/v1/object/public/generated-images/cocolash/<uuid>-studio-avatar.jpg"]
}
```
