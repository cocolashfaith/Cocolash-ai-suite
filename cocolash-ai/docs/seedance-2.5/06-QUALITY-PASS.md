# Quality pass — compose option + review findings (2026-09-16)

Harry approved ("go with your recommendations"): the opt-in compose feature and 12 of the 15
quality-review findings now; findings F5 (cap product refs at 4), F11 (multi-frame Director
rewrite + routing long clips through multi_frame) and F12 (reference quality filter/dedupe)
are deliberately HELD until after the A/B so we change one variable at a time.

## Decisions

| # | Decision |
|---|---|
| H1 | **Compose is opt-in.** A "Generate holding the product" toggle in the UGC avatar step. When on, the avatar generator receives the first selected product image (`hasProduct: true`) and renders the influencer already holding it. The compose infrastructure already exists (`app/api/seedance/generate-ugc-image/route.ts:55-94`); the caller just stopped sending the product. |
| H2 | **Composed shot = FIRST influencer reference, added alongside** — never replacing the clean product photos, which stay authoritative for product detail. It enters via the normal influencer array and rides `influencers[]` untouched. |
| H3 | **Two gates on the composed image**: (a) the user sees it and approves/regenerates before continuing; (b) it is fact-checked by the same product-fact extractor used for scripts — if the composed product contradicts the real refs, warn before use. |
| H4 | **The Director is told** when the influencer reference already holds the product (`influencerAlreadyHoldsProduct`), so it stops staging a pickup and doesn't double-describe the product. |
| H5 | Default stays OFF until an A/B on the kit proves it (~$4.30: compose-off vs compose-on, same script/settings). Flip the default only on evidence. |

## Findings implemented now (from the 15-point quality review)

| F# | What | Where |
|---|---|---|
| F1 | `bitrate_mode: "high"` whenever `qualityTier === "final-1080p"` — free per Enhancor pricing (rate tables key on resolution/duration/video-inputs only). Applies to the wizard build AND Re-render as Final. | build-request.ts, rerender route |
| F2 | Vision Director receives `durationSeconds` + `aspectRatio`; ≥10 s prompts must be structured into timed beats (`[0–5s] …`), mirroring the text Director. | vision director + route + Step 3 |
| F3 | Camera vocabulary in the vision prompt: one camera-move clause (slow push-in / handheld follow / tilt), shot size, "handheld phone footage" framing. | system-prompts |
| F4 | The craft half of the authoring rules (natural hands/anatomy, steady framing, no identity drift, legible brand text, true colour) appended to the vision system prompt — it currently only reaches the text Director. | system-prompts / vision director |
| F6 | Initial vision-director run at temperature 0.35 (was provider default ≈1.0); Regenerate keeps 0.9. | vision director |
| F7 | Mixed-identity guard: warn when selected influencer refs are not the same generated look (different faces blend on render); nudge to one identity. | UgcMode |
| F8 | Identity front-loaded: the prompt must open with the subject; `applyProductGuard` appends its category sentence as a TAIL clause, never a prefix ahead of identity. | system-prompts, v25/generate.ts |
| F9 | Spoken script goes in a delimited block and the prompt CLOSES with a one-line visual constraint tail (framing/identity/product stability), so dialogue is not the last thing the model reads. | vision director |
| F10 | Avatar generated at 2K (was 1K) and the identity reference is no longer deliberately degraded — "jpeg compression artifacts / motion blur / grain" move OUT of the image prompt (keep pores, asymmetry, flyaways); authenticity texture belongs in the video prompt. | generate-ugc-image route, ugc-image-prompt |
| F13 | Every `@product_imageN` / `@influencer_image1` token paired with a plain-noun restatement ("@product_image1, the tan lash kit box") — tokens are documented on 2.0 but unverified on 2.5, so the prompt must read correctly even if 2.5 treats them as text. | system-prompts / vision director |
| F14 | Thumbnails derive dimensions from the video's real aspect (9:16 videos no longer centre-cropped to 16:9 cards). | cloudinary/video.ts |
| F15 | Drop the unused eager mp4/webm transforms on Cloudinary upload (wasted work; nothing references them). Re-host confirmed NOT lossy — `final_video_url` serves the original bytes. | cloudinary/video.ts |

## Held (after the A/B)

- F5 cap UGC product refs (~4) + hero-first description style
- F11 multi-frame Director rewrite for 2.5 + routing >12 s clips through multi_frame
- F12 minimum-resolution filter + near-duplicate warning on reference selection

## Verification plan (spend ≈ $8.20 of the approved budget)

1. Compose-off vs compose-on: same kit, same script, 720p/8s each ($2.15 ×2).
2. One Final-1080p at the new high bitrate, 8 s ($3.90) — hair/lash/skin gradient check vs the standard-bitrate final.
3. Then (separate go): Faith's two failure cases, 2.0 vs 2.5.

## Codex note

Harry asked for the Codex plugin as reviewer. It is currently unusable: his ChatGPT-account
Codex rejects every CLI-nameable model, and the account's own `gpt-6-astra` requires a CLI
newer than any public build (stable 0.154.0 and alpha 0.155.0-alpha.9 both reject it — the
desktop app channel is ahead of npm). CLI left at 0.154.0 stable (was 0.146.1); his
`~/.codex/config.toml` untouched. The review above was run by Claude with the same brief;
rerun via the plugin when OpenAI ships the matching CLI.
