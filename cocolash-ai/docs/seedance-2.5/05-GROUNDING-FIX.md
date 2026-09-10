# Product hallucination — diagnosis + fix plan (2026-09-10)

Harry: "the script says this box has a glass cover, but it doesn't… the product is hallucinating and not rendering correctly." He confirmed **the false claim was already in the script text at Step 1**, before the Director ran.

---

## 1. GROUND TRUTH — what the CocoLash full kit actually looks like

Established by opening the 8 product images that job `a136f22f-5e92-451b-b5e0-ea81b0596c12` actually sent (`brand-assets/products/full-kit-box/*`), and looking at them.

| Feature | Reality |
|---|---|
| Box exterior | **Tan / camel** rigid board, black "COCOLASH" wordmark, side text "Experience the long lasting lash technology." |
| Box lid | **Book-style lid that folds open**, tan inner face. Consistent with `magneticClosure: true` for full kits. |
| **Mirror in the lid** | **REAL.** A rectangular mirror is set into the inside of the lid; it visibly reflects the tray contents. |
| Interior | Black rigid tray, tan die-cut insert with fitted cut-outs per tool, black base printed `www.cocolash.com` |
| Contents (6) | Bond+Sealant dual black pen · white Remover pen · black tweezers · pink angled applicator · black scissors · round black lash case with rose-gold "COCOLASH" |
| Round lash case | Black base; lashes sit under a **clear plastic inner cover** (visible in the laid-out shot). Plastic, **not glass**. |
| **Glass anything** | **DOES NOT EXIST.** No glass panel, no glass cover, no glass lid, anywhere on the product. |

### Which of the generated phrases were actually wrong

| Phrase found in shipped prompts | Verdict |
|---|---|
| "mirror inside the lid" / "mirrored interior" | ✅ TRUE — visible in the images |
| "magnetic lid" / "magnetic gift box" | ✅ TRUE for full kits (`product-truth.ts` agrees) |
| "hinged lid" / "flips the lid open" | ✅ TRUE |
| "fitted tray of tools" | ✅ TRUE |
| "pops the clear lid" (round lash case) | ✅ Substantially true — clear **plastic**, not glass |
| **"glass cover" (in the Step-1 script)** | ❌ **FALSE — pure invention** |

**Conclusion that reframes the whole fix: the Vision Director is doing its job.** Every claim it made is supported by the images it was shown. The hallucination came from the **script writer, which sees nothing**. Do not over-constrain the Director; ground the script writer.

---

## 2. ROOT CAUSES (ranked, all independently confirmed in code)

1. **The script writer is blind.** `POST /api/scripts` accepts no image, no SKU, no product name from the Seedance wizard (`components/video/seedance/SeedanceScriptStep.tsx:144-155` sends only `campaignType, tone, duration, pipeline, productFacts?, excludeHooks?`). `lib/prompts/scripts/seedance.ts:246` therefore falls back to the literal string `"CocoLash premium false lashes"`. The system prompt (`:188-220`) contains **no honesty rule whatsoever**, temperature is **0.8** (`lib/openrouter/captions.ts:183`), and the `unboxing` framework (`:92-110`) explicitly orders "Tactile detail: fibers, softness, band, tray, packaging" and "opening or presenting packaging". **This is where "glass cover" was born.**
2. **`productFacts` — the one real grounding path — is optional and fails silently.** Extraction only runs behind the AI-script button (`SeedanceScriptStep.tsx:126-142`), never for manual or library scripts; failures are swallowed (`catch { /* ignore */ }` `:139-141`); capped at 9 images (`product-fact-extractor.ts:56`) while the picker allows 30, so selecting 10+ silently 400s and drops all grounding.
3. **Generic brand claims are injected into every script regardless of product** (`seedance.ts:257-262`: cotton band, 25+ wears, vegan).
4. **The Director is ordered to copy the script verbatim** (`seedance-vision-director.ts:362-363`, `:415`, `:443`) and is never told to reconcile it against the images. A false script claim is guaranteed to reach the video.
5. **The product-truth DB is switched off on the live path.** `productSku` is never set in the wizard (`seedance-v4/types.ts:181`, no writer) so `truthContext` is always `""` (`seedance-vision-director.ts:111-118`) — the `Magnetic Closure`, `kitContents` and `lengthRange` guards never render.
6. **Server-side "strips" injection.** `app/api/seedance/generate/route.ts:337-347` and `lib/seedance/v25/generate.ts:47-67` prepend "CocoLash false-lash extension **strips** … small cluster lash strip" to any prompt lacking a lash token, *after* the user approves it. `DEFAULT_PRODUCT_DESCRIPTION` (`generate/route.ts:129`) says "strip" too. **Prime suspect for Faith's cluster-rendered-as-strip failure.**
7. **The validator is a no-op.** `validateScriptAgainstProductTruth` is 4 regexes (magnetic, plastic band, cotton band, leather case), warn-only, never surfaced, and called **only from the 2.0 route** (`generate/route.ts:282`) — the live 2.5 path never validates. The schema also has no field for lids/covers/finish, so "glass cover" is literally unrepresentable.
8. **The Director under-uses the images.** It cited 5 of 8, 5 of 8, 3 of 8, 4 of 8, 5 of 9 images across real jobs. All images DO reach Enhancor (verified end-to-end); the prompt simply doesn't describe them all, leaving gaps the video model fills by inventing.
9. **Only 1 influencer image reaches the prompt writer** (`Step3:138`) while all of them reach Enhancor (`build-request.ts:102`).
10. **Regeneration loosens grounding**: temperature 0.9 and an explicit request for new "props" (`seedance-vision-director.ts:139,149`).

---

## 3. DECISIONS (approved by Harry 2026-09-10 — "go with all of the recommendations")

| # | Decision |
|---|---|
| G1 | **Scripts never describe physical appearance.** The script owns *what the creator says* (hook, benefit, CTA). Packaging, materials, closures, colours and construction are the visual prompt's job. The script prompt gets an explicit ban. |
| G2 | **Fact extraction becomes mandatory and blocking** for any script generated with products selected. Raise the cap from 9 to 30 to match the picker. On failure, surface a real error and refuse to silently generate an ungrounded script. |
| G3 | **Truth precedence: manual override → extracted-from-images → Shopify description → generic brand copy.** Generic brand claims are only used when nothing better exists, and never contradict the layers above. |
| G4 | **Auto-correct, don't block.** A violated fact is rewritten at the prompt layer and the user is shown what changed. Hard-block only when the product cannot be identified at all. |
| G5 | **Positive description only** in what we send Seedance — no "do not show X" (video models render negated nouns). The forbidden list stays on our side as a validator. |
| G6 | **Auto-attach all images** for the selected product, user can deselect. |
| G7 | Scope: **UGC on engine 2.5 first**. Verification budget **~$15**. |

---

## 4. FIX PACKAGES

Ownership is disjoint. Executors never `git add`/commit/push, never touch `.planning/`, ignore any path ending `" 2"`, and never call Enhancor.

### A — Ground the script writer (PRIMARY FIX)
Own: `app/api/scripts/route.ts`, `lib/prompts/scripts/seedance.ts`, `lib/ai/director/product-fact-extractor.ts`, `app/api/seedance/extract-product-facts/route.ts`, `components/video/seedance/SeedanceScriptStep.tsx`.
- Accept + require `productImageUrls` (and optional `productName`, `productSku`) on the Seedance script path; send them from the wizard.
- Raise `MAX_IMAGES` 9 → 30 in the extractor and its route schema.
- Run extraction for **every** script path (AI, manual, library) whenever products are selected; make failure visible, not swallowed.
- Inject the extracted facts + `isNot` list into the script prompt as the authoritative product description.
- Add a hard honesty rule to the script system prompt implementing **G1**: never describe packaging, materials, closures, transparency, mirrors or construction; refer to the product by name only.
- Drop the five generic brand claims when real facts exist (**G3**).
- Rewrite the `unboxing` framework so its beats are about reaction and result, not invented packaging detail.
- Lower script temperature from 0.8 to ~0.5.

### B — Make the Director audit, and use every image
Own: `lib/ai/director/seedance-vision-director.ts`, `app/api/seedance/director-vision/route.ts`, `lib/ai/director/system-prompts.ts`, `components/video/seedance-v4/Step3PromptReviewAndGenerate.tsx`.
- Instruct the Director to **audit the script against the images**: any script claim it cannot see must be dropped from the visual staging (the spoken line may stay only if it makes no visual claim).
- Require it to `@`-reference **every** supplied product image, and describe each briefly.
- Visibility-gate the action menu: "opens the box" etc. only if a box is actually visible.
- Delete the three hardcoded brand assertions framed as "Based on what you see in the images"; replace with facts passed in.
- Send `productSku`, all influencer images, and `productFacts` from Step 3 every time.
- Raise `max_tokens` (1024 → 2048) and fail loudly on a truncated `finish_reason`.
- Register the prompt in `PROMPT_REGISTRY` so it is visible in `/admin/prompts`.
- Keep regeneration's variety but hold the honesty rules constant (no new *product* props).

### C — Turn the truth database on, and give it a real schema
Own: `lib/brand/product-truth.ts`, NEW `lib/brand/prompt-validator.ts`, `components/video/seedance-v4/ProductReferencePicker.tsx`, `components/video/seedance-v4/types.ts`.
- Extend `ProductTruthEntry` with the fields this bug needed: `lidType`, `hasMirror`, `transparentWindow`, `exteriorColor`, `interiorColor`, `boxMaterial`, `finish`.
- Populate the full-kit entries from §1 ground truth (tan exterior, black interior, book lid, **mirror: true**, no glass).
- Fix the 10 wrong `productHandle` values so Shopify actually resolves; wire `getProductTruthByHandle`.
- Set `productSku` in the wizard when a library category is chosen.
- New `prompt-validator.ts`: given a prompt + facts + truth, return `{ prompt, corrections[] }` — rewrite forbidden claims into accurate ones (**G4/G5**), never emit negations into the outgoing prompt.

### D — Remove the bad server-side injections and wire the validator
Own: `lib/seedance/v25/generate.ts`, `app/api/seedance/generate/route.ts`, `lib/seedance/prompt-planner.ts`.
- **Delete the "strips" prepend** on both engines; replace with a neutral, product-accurate guard that never asserts a lash format.
- Fix `DEFAULT_PRODUCT_DESCRIPTION` to stop saying "strip".
- Call `prompt-validator` before `/queue`, persist `corrections` on the row, and return them so Step 3 can display them.

---

## 5. VERIFICATION

- Unit tests per package; whole suite must stay green (baseline 89 files / 1061 tests).
- A "glass cover" regression test: a script containing an invented feature must be corrected before it reaches the wire.
- Real runs (budget **$15**): one 480p/4s before-and-after on the full kit, then Faith's two failure cases (4-pack magnetic closure, cluster-vs-strip) once the pipeline is clean.
