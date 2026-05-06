/**
 * Shared negative-prompt constraints for all Seedance Directors.
 *
 * This block is appended to every Director system prompt's output guidance
 * section. It prevents common hallucination patterns specific to CocoLash
 * product videos: magnetic closures on non-magnetic packaging, lash strips
 * when the product is clusters, mismatched kit contents, identity drift, etc.
 *
 * Phase 27 — Product Truth grounding. Keeps all six Director prompts
 * aligned on the same anti-drift rules.
 */

export const BRAND_NEGATIVE_PROMPT = `NEGATIVE CONSTRAINTS — append to every output:
- no extra fingers, no deformed hands, no melting edges
- no jitter, no warping, no flickering, no identity drift
- no logos morphing, no text overlays, no garbled brand text
- no lash strips when product is clusters, no magnetic closure on
  non-magnetic packaging, no kit contents that aren't in \`productTruth\`
- no neon over-saturation, no cartoon look unless explicitly requested
- no faces blending between shots`;
