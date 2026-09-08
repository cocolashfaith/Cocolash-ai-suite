# Seedance 2.5 integration — Locked decisions (2026-09-08)

Decided with Harry in a grilling session. These are settled; do not re-open. Anything not listed here is the planner's call.

## Product decisions

| # | Decision |
|---|---|
| D1 | **Both engines.** Add an "Engine" choice: **Seedance 2.5 (default)** and **Seedance 2.0 (legacy)**. 2.0 stays fully working. Every `generated_videos` row records which engine produced it. (Needed for the later 2.0-vs-2.5 A/B demo on Faith's failure cases — that demo itself is OUT of scope for this pass, but store enough on each job to make it trivial: engine, mode, prompt, all input URLs, resolution, duration, credits.) |
| D2 | **All nine 2.5 modes reachable in the UI**: ugc (primary), text_to_video, multi_reference, first_n_last_frames, multi_frame, edit, extend, lipsyncing, voice_clone. Each mode shows exactly the inputs the API accepts for it (per `01-API-REFERENCE.md`). |
| D3 | **Quality tiers (Faith's "draft cheap / final expensive"):** `Draft 720p` (**default**), `Draft 480p` (optional, cheapest), `Final 1080p`. Duration is an independent control. Every completed Draft (480p or 720p) shows a **"Re-render as Final"** button that re-submits with the **identical prompt + identical inputs** (and the same duration, editable before confirming) at 1080p, linked to the original row. |
| D4 | **Real pricing in the app.** 1 credit = $0.001. Seed the credit tables from `01-API-REFERENCE.md` (standard + reduced + uncensored columns). Show **estimated credits and ≈USD before Generate**, record the **actual `cost`** from the webhook/status response on the row, and keep the rates + USD-per-credit editable in an admin settings row (Enhancor says rates can change). Update the stale 2.0 constants to be consistent (2.0 rates stay as they are in `lib/costs/estimates.ts`; label them as engine 2.0). |
| D5 | **Defaults are global, not per-user.** A single "Video defaults" settings row (engine, tier, duration, aspect ratio, + pricing) editable under Settings by admins. The wizard keeps remembering last-used values per browser (existing localStorage behaviour). |
| D6 | **Create a new public Supabase storage bucket `video-inputs`** (audio + video + image, 50 MB) so audio/video reference inputs actually work (`brand-assets` blocks non-image MIME and caps at 5 MB). Add a **"From your videos"** picker (existing completed videos with live public URLs; skip dead `res.cloudinary.com/dtnvppaty/*` finals) and **URL paste** for videos/audio. |
| D7 | **Product image sources:** add a **"Store products"** tab to the product picker that pulls live product images from the Shopify Storefront API for all store products (Sorrel, Fern, Ivy included). Also **seed `sorrel`, `fern`, `ivy` categories** into `product_reference_images` from those Shopify images, and **fix `lib/brand/product-truth.ts`** so Sorrel resolves to its own dark-brown images (not `single-nude-tray`). |
| D8 | **Multi-select everywhere the API allows it:** multiple influencers + multiple products (combined ≤30) in UGC; images ≤30, videos ≤10, audios ≤10 in other modes, with live counters. |
| D9 | **Advanced section** exposes `pass_faces` (default ON), `is_uncensored` (default OFF, labelled "Unrestricted content (NSFW)"), `output_format` (mp4 default; mov default for edit/extend), `bitrate_mode` (standard default). |
| D10 | **Duration:** 4–30 s control + **"Auto"** (-1). Per-segment durations for multi_frame (sum 4–30). `edit` locked to Auto. Script/director generation sized to the chosen duration (extend the 4–15 clamps to 30). No more silent bucketing to 5/8/10/15 for 2.5 (2.0 keeps its current behaviour). |
| D11 | **In-wizard progress:** Step 3 shows live progress and the finished video inline (poll `/api/seedance/[id]/status` every ~12 s), plus the existing gallery reconcile. |
| D12 | **Ship live**: push to `main` = auto-deploy to Faith with 2.5 as the default engine. No admin gating. |
| D13 | **Voiceover generation (ElevenLabs → stored audio URL) is deferred.** Lipsync/voice_clone take uploaded or pasted audio URLs only in this pass. |
| D14 | **Gallery metadata:** engine, mode, tier/resolution, duration, credits (+ ≈USD) on `VideoCard` and in `VideoModal`; cost dashboard splits Seedance by engine. |
| D15 | **Lightweight process** (no GSD ceremony): docs live in `docs/seedance-2.5/`. Tests + code review still required (Harry's global rules: TDD, code-reviewer, security-reviewer on input-handling code). |

## Hard constraints (environment)

- **No SQL execution path from this machine** (no DB URL, no Supabase CLI, no exec RPC, Supabase MCP not authorized). Schema changes → **exactly one migration file** `supabase/migrations/<date>_seedance25.sql` that Harry pastes into the Supabase SQL editor. Bucket creation and row inserts CAN be done via the service-role REST API. Code must **detect the un-applied migration** (Postgres `42703 undefined_column` on insert) and return a clear message ("Run supabase/migrations/…") instead of a generic 500, and the 2.0 path must keep working even before the migration is applied if at all possible.
- **Vercel + Shopify admin access is revoked.** Pushing `main` still auto-deploys. Env var changes must be done by Harry. Assume production has `ENHANCOR_API_KEY`, `ENHANCOR_WEBHOOK_URL` (or `NEXT_PUBLIC_APP_URL`), `ENHANCOR_WEBHOOK_SECRET` set (2.0 works in prod and throws without them). 2.5 reuses the **same** key and the **same** public webhook route `/api/seedance/webhook` (already in the middleware public allow-list).
- **Never retry a `/queue` POST** (double billing). Dedupe webhook callbacks.
- `gh` CLI keeps flipping off the `ai-harry` account → run `gh auth switch --user ai-harry` before pushing.
- Finder creates `" 2"` duplicate files/dirs in source folders. Never `git add .`; delete any `* 2.*` artefacts before committing (`find app components lib -name "* 2.*"`).
- Test baseline: **57 files / 506 tests green** (`npm test`), `npx tsc --noEmit` clean, `npm run lint` clean. Keep them green; when a contract change legitimately breaks a 2.0-shape test, update the test and say so.
- Design system: Tailwind v4 tokens `coco-*` (see `app/globals.css`); shadcn-style primitives in `components/ui/` (`radix-ui` unified package exports Slider/Collapsible/Accordion/Progress — wrappers may be added, no new deps).

## Execution model (Harry's instruction — replaces GSD for this work)

1. **One planner agent on Fable 5.1** writes the detailed plan (`03-PLAN.md`) **and implements the shared contracts** (types, zod schemas, pricing tables, migration SQL, engine registry) so executors code against real modules.
2. **Multiple executor agents on Opus** implement the plan's work packages in parallel waves, each owning a disjoint set of files.
3. Orchestrator (main session) runs typecheck/tests/lint between waves, runs code review + security review agents, fixes, commits, pushes, verifies the deploy.
4. Agents do **not** commit or push. The orchestrator commits at wave boundaries.
