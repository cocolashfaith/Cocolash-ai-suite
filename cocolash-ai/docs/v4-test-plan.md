# v4.0 Test Plan — Seedance Mode-First Pipeline

**For:** Faith
**Date:** 2026-05-04
**Reads in:** ~5 minutes
**Companion document:** `.planning/phases/14-audit/14-AUDIT-REPORT.md` (technical detail)

---

## What this is

This is the test plan for v4.0 — the rewrite of the Seedance video flow on `/video`. It lists every broken behavior we found in the current production deployment, the specific v4.0 phase that fixes it, and what "fixed" looks like from a user's perspective. Once v4.0 ships (Phase 21), Faith will use this list to verify nothing is still broken.

---

## The current flow has 6 confirmed problems

### #1 — The "Show holding product" toggle asks for a description but ignores it

**Today:** When you turn the toggle ON, an input appears asking you to type "e.g. a pink CocoLash box." If you don't type anything, you see this error: `productDescription is required when hasProduct is true`. Even when you DO type something, the AI doesn't actually see your real product image — it just guesses from your words.

**Fixed by:** Phase 17 (MODES). When the toggle is ON, you'll be asked to PICK a product image from your library. Then Gemini composes the avatar + product into ONE image (the avatar already holding the product). No more typing descriptions.

**How to verify after v4.0 ships:**
1. Go to `/video`, pick Seedance.
2. Get to the Avatar+Product step.
3. Turn the toggle ON.
4. Confirm you see a product picker, not a text input.
5. Pick a product image. Confirm a single composed image is generated showing the avatar holding it.

---

### #2 — You're forced to pick a product image even when the toggle is OFF

**Today:** Even with the toggle OFF, the page won't let you click "Continue" until you've selected a product image from the grid below. This makes no sense if you don't want a product in the shot.

**Fixed by:** Phase 17 (MODES). The product picker only appears when the toggle is ON.

**How to verify:**
1. Avatar+Product step.
2. Leave the toggle OFF.
3. Confirm the product picker grid is hidden.
4. Confirm "Continue" is enabled with just an avatar image.

---

### #3 — The Enhancor mode picker is buried at the END of the flow, not the start

**Today:** Step 1 is Script. Step 2 is Avatar+Product (hardcoded for UGC inputs). The picker for the SIX Enhancor modes (UGC, multi-reference, multi-frame, lip-sync, first+last frame, text-to-video) is hidden inside Step 3. So if you wanted to make a multi-reference video, you'd already have wasted time setting up UGC inputs.

**Fixed by:** Phase 16 (FLOW). The mode picker moves to Step 1, right next to the script. Step 2 then shows you ONLY the inputs that mode needs:
- **UGC:** avatar + optional product
- **Multi-reference:** N labeled images (appearance / product / background) + optional audio/video
- **Multi-frame:** AI-proposed editable per-segment prompts (4–15s total)
- **Lip-sync:** image + REQUIRED audio
- **First+last frame:** first frame from your gallery + you describe the destination scene → NanoBanana generates a consistent last frame
- **Text-to-video:** just describe what you want — no images

**How to verify:**
1. Go to `/video`, pick Seedance.
2. Step 1 should now ask you to pick: campaign type + mode + script.
3. Pick "Multi-reference" mode.
4. Step 2 should show image upload slots with role labels — NOT the UGC avatar generator.
5. Repeat for each of the six modes — each should show different inputs.

---

### #4 — Two separate images are sent to Seedance instead of one composed image

**Today (technical):** When the toggle is ON, the avatar URL and the product URL are sent to Seedance as TWO separate inputs. Seedance has to figure out how to merge them, which is why videos sometimes show the avatar holding the wrong thing or holding nothing.

**Fixed by:** Phase 17 (MODES-01). Gemini composes the avatar + product into ONE image FIRST. Only that single composed image is sent to Seedance. This is also why brand grounding will be much more reliable.

**How to verify:**
1. Make a UGC video with a product.
2. Watch the network tab on submit — the request body to `/api/seedance/generate` should send ONE image URL, not two.
3. Watch the resulting video — the avatar should reliably be holding YOUR product, not a generic stand-in.

---

### #5 — Picking 1080p forces 16:9 (no vertical 9:16 option)

**Today:** Selecting 1080p resolution disables every aspect ratio except 16:9. Tooltip says it's an Enhancor limit. We tried to verify against the Enhancor API directly but our audit account didn't have a key, so we couldn't confirm whether this is still a real Enhancor restriction or an old limit we're enforcing on ourselves.

**Fixed by:** Phase 20 (BUGFIX-01). We'll re-test with a real Enhancor key. If the limit is real, we keep the lock with a clearer message ("1080p is 16:9 only — pick 720p for vertical"). If the limit is gone, we relax the lock.

**How to verify:**
1. Go to Step 3 (Generate).
2. Pick 1080p.
3. Confirm the aspect ratio choices match what Enhancor actually allows (and the helper text is honest about WHY anything is disabled).

---

### #6 — There's no "Save Script" button on either pipeline

**Today:** Both flows (Seedance AND the HeyGen "Agent Pipeline") have a saved-scripts panel — but there's no way to save a script INTO it from the script step.

**Fixed by:** Phase 18 (SCRIPT). A `[Save Script]` button is added to Step 1 of BOTH pipelines. Click it → you get to name the script (defaulting to the first 60 chars) → it's saved → it shows up in the saved-scripts panel and can be loaded back into either pipeline.

**How to verify:**
1. Generate a script in the Seedance flow → click `[Save Script]` → name it → confirm it appears in saved scripts.
2. Repeat for the HeyGen ("Agent Pipeline") flow.
3. Load a saved script back into either flow → confirm all fields pre-fill correctly.

---

## On top of those 6 fixes, v4.0 also adds

### A "Seedance Director" AI in the middle (Phase 15)

Before any video is generated, a Claude Opus 4 AI reads your inputs (campaign type, script, all images / audio / video, your specific instructions) and writes the optimal Seedance prompt for the mode you picked. There are SIX different system prompts for this AI — one per mode — each grounded in the SeeDance 2 best-practices guide (e.g., for UGC it knows to write "phone footage, room tone, handheld, conversational pacing"; for multi-frame it knows to use shot labels and global constants).

**You'll see the prompt before it goes to Seedance** (Step 3 of the new flow). You can edit it. Only when you click `[Approve & Generate]` does it actually queue. This gives you full control over what Seedance is being told.

### A "Last-Frame Director" AI for the first+last frame mode (Phase 15)

For the first+last frame mode, you give us a first frame (from your gallery) and a description of the destination scene. A separate Claude AI converts (first frame + your description) into a NanoBanana prompt that maintains environmental consistency (lighting, background, palette). NanoBanana generates the last frame. You can review and regenerate before continuing.

### An admin viewer for every AI prompt in the suite (Phase 19)

A new page at `/admin/prompts` shows every AI system prompt in the entire suite (chatbot, intent classifier, six Seedance Directors, NanoBanana Director, image-gen prompts, video script prompts) — with the model used, the file path, last-modified date, and the full text. Read-only at first; you can ask for editable later.

---

## The full v4.0 phase rollout

| Phase | What ships | Verification gate |
|---|---|---|
| 14 — AUDIT | This document + the technical audit report | This file (you're reading it) |
| 15 — AI Core | The Seedance Director (Claude Opus 4) + the NanoBanana Last-Frame Director | Director generates a non-empty prompt for each of the six modes within 30 seconds; the multi-frame Director returns an editable per-segment array totaling 4–15s |
| 16 — FLOW | The 3-step rewrite: Step 1 = Script + Mode + Campaign; Step 2 = dynamic per mode; Step 3 = prompt review + approve | Back/Next preserves all inputs across navigation; quick-UGC path is no slower than today's flow |
| 17 — MODES | All six modes wired with mode-specific inputs (the headline fixes for #1, #2, #4 are here) | Each mode renders only its own inputs; UGC + toggle-ON sends ONE composed image; first+last frame uses NanoBanana for the last frame with environmental consistency |
| 18 — SCRIPT | Save Script buttons on both pipelines (the fix for #6) | Save → name → confirm in panel → load back → all fields restore |
| 19 — ADMIN | The `/admin/prompts` viewer | Every AI in the suite is listed with model, file path, last-modified, and full prompt text |
| 20 — BUGFIX | The 1080p × aspect-ratio fix (#5) + any audit findings not already covered | Resolution × aspect-ratio matrix in the UI matches what Enhancor actually allows |
| 21 — NOREG | A full smoke test that v3.0 (chatbot, try-on, lead capture, admin), v2.0 (HeyGen video), and v1.0 (image gen) all still work | Every shipped capability has at least one passing smoke test; every BROKEN-NN finding from this audit is NOT REPRODUCIBLE |

---

## What we'd like from Faith between phases

| Need | When | Why |
|---|---|---|
| Test login credentials for `/video` | As soon as possible | The audit had to pivot to code-based evidence because we couldn't get past the auth wall. We'd like to re-run the live Playwright capture for completeness, especially before Phase 21 verification. |
| A real Enhancor API key for the audit environment | Before Phase 20 | To definitively answer whether the 1080p × aspect-ratio lock is still a real Enhancor limit. |
| 5–10 minutes review of each prompt in `/admin/prompts` once Phase 19 ships | Phase 19 | These are the prompts that decide what every video looks like — Faith's voice should be visible in them. |
| Sign-off on the new mode-first flow on a staging branch | Before Phase 21 closes the milestone | Just to confirm the new flow feels right end-to-end before we mark v4.0 shipped. |

---

*Plan generated: 2026-05-04. Companion technical detail in `.planning/phases/14-audit/14-AUDIT-REPORT.md`.*
