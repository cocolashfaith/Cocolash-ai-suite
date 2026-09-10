/**
 * Shared authoring rules for all Seedance Directors.
 *
 * ⚠️ These are rules for the Director (the prompt AUTHOR). They are NOT text to
 * be copied into the prompt it emits.
 *
 * Why that distinction matters (2026-09-10): Seedance/Enhancor has no
 * `negative_prompt` field — the video model receives ONE prompt string. This
 * block used to be headed "append to every output", so a Director could
 * faithfully append "no lash strips when product is clusters" to the prompt,
 * putting the word *strips* on the wire. Video models routinely render the
 * noun you negate, which is a plausible contributor to the client's
 * "cluster lashes rendered as a strip lash" complaint.
 *
 * Decision G5 (docs/seedance-2.5/05-GROUNDING-FIX.md): what we send Seedance is
 * POSITIVE DESCRIPTION ONLY. Forbidden concepts are enforced on our side, by
 * these authoring rules and by `lib/brand/prompt-validator.ts`, never by
 * negation in the outgoing prompt.
 *
 * Phase 27 — Product Truth grounding. Keeps all Director prompts aligned.
 */

export const BRAND_NEGATIVE_PROMPT = `AUTHORING RULES — these govern how YOU write. Never copy these lines, or any
"no …" phrasing, into the prompt you output. The prompt you emit goes straight
to the video model, and a negated noun is often rendered anyway.

Product accuracy (the important ones):
- Name the lash format ONLY as it appears in the reference images. If you cannot
  see whether it is a cluster, a band or a half lash, say "lashes" and move on.
- Describe packaging, closures, lids, mirrors and materials ONLY when visible in
  the images or stated in \`productTruth\`. Say what IS there; never write what
  is absent.
- Kit contents: list only items you can see or that \`productTruth\` lists.
- If the creator's script claims a feature the images do not show, do not stage
  it. Reword the line so it makes no visual claim.

Craft (express these as positive direction, e.g. "steady framing", "natural
hands", "consistent face and lighting across the shot"):
- anatomy stays correct and hands stay natural
- framing stays steady; no warping, flicker or identity drift between shots
- brand text stays legible and unaltered; no invented overlays
- colour stays natural and true to the reference images`;
