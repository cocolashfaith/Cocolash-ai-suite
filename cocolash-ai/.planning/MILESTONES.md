# Milestones

History of completed and active milestones for the CocoLash AI Suite.

---

## v1.0 — Image Generation (System 1)

**Status:** ✓ Shipped (predates GSD planning; reconstructed from codebase 2026-05-02)
**Theme:** Brand-consistent AI image generation with diversity and post-processing.

**What shipped:**
- Gemini-based image generation with five category templates: lash-closeup, lifestyle, product, before-after, application-process
- Diversity tracker for fair "random" selection across skin tone, hair, scene, vibe, ethnicity, age range, composition (`lib/diversity/tracker.ts`)
- Logo overlay (white/dark/gold) and before-after composite via `sharp` (`lib/image-processing/`)
- 4 aspect ratios (1:1, 4:5, 9:16, 16:9) × 3 resolutions (1K, 2K, 4K)
- Generation gallery, favorites, saved templates, captions, hashtags, scheduled posting via Blotato
- Cost tracking via `lib/costs/tracker.ts`

**Key files:** `app/api/generate/route.ts`, `lib/prompts/compose.ts`, `lib/gemini/`, `lib/image-processing/`

---

## v2.0 — Video Generation (System 2)

**Status:** ✓ Shipped (predates GSD planning; latest commit `6ae2f1c — Seedance Pipeline Tested` on 2026-05-01)
**Theme:** Two parallel UGC video pipelines (HeyGen scripted avatars + Seedance text-to-video / image-to-video).

**What shipped:**
- HeyGen pipeline: script → ElevenLabs voice → photo avatar → Avatar IV video → Shotstack caption burn → Cloudinary CDN
- Seedance pipeline: director-prompt planner → Enhancor `/queue` → webhook completion (idempotency by `request_id`) → Supabase Storage
- Video script generation per campaign type (product-showcase, testimonial, promo, educational, unboxing, before-after, brand-story, faq, myths, product-knowledge)
- Person+product image composition via Gemini (`composePersonWithProduct`) — the foundation for v3.0 virtual try-on
- Caption SRT alignment from ElevenLabs word timestamps
- Video gallery and download
- Pipeline-discriminated `generated_videos` table

**Key files:** `app/api/videos/generate/route.ts`, `app/api/seedance/`, `lib/heygen/`, `lib/seedance/`, `lib/gemini/composition.ts`, `lib/elevenlabs/`, `lib/shotstack/`, `lib/video/`

---

## v3.0 — AI Sales Assistant + Virtual Try-On (System 3)

**Status:** ▶ Active (planning, started 2026-05-02)
**Theme:** Custom on-site chatbot for cocolash.com that answers product/order questions in Faith's voice, recommends + adds-to-cart from Shopify, runs virtual try-on inline, and gives Faith and her team an admin dashboard.

**Charter:** See `.planning/PROJECT.md` (Current Milestone section) and `.planning/REQUIREMENTS.md`.

**Phases:** See `.planning/ROADMAP.md`.

---

*Last updated: 2026-05-02 — bootstrap of milestone history.*
