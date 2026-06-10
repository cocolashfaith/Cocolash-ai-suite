/**
 * Color-rule framing sanitiser (shared).
 *
 * Faith's feedback (2026-05): the brand color palette was framed as a rigid
 * "60-30-10 Rule" that "doesn't add up", and that framing was being injected
 * into every image-generation prompt. The corrected framing is a loose
 * dominant / supporting / accent guideline — the percentages are not a hard
 * ratio.
 *
 * This helper rewrites any stale "60-30-10" framing in a stored brand string
 * while PRESERVING the actual brand colors (hex values). It is used in two
 * places so a stale `brand_profiles` DB row never reaches the user OR the
 * model, without requiring a production DB write:
 *   1. app/api/brand/route.ts — sanitises what the Settings UI displays.
 *   2. lib/prompts/brand-dna.ts (getBrandDNA) — sanitises the DNA that is
 *      prepended to every Gemini image-generation prompt.
 *
 * Idempotent and safe on null/undefined.
 */
export function scrubColorRuleFraming(
  text: string | null | undefined
): string | null | undefined {
  if (!text) return text;
  return (
    text
      // Parenthetical "(60-30-10 Rule …)" / "(60/30/10 …)" → guideline note.
      .replace(
        /\(60\s*[-/]?\s*30\s*[-/]?\s*10[^)]*\)/gi,
        "(dominant / supporting / accent — guidelines, not hard ratios)"
      )
      // Rigid role labels with a percent — dash optional so we also catch the
      // form without a leading bullet (e.g. "60% Primary:" mid-sentence).
      .replace(/(?:-\s*)?60\s*%\s*Primary\b\s*:?/gi, "- Dominant (~60%):")
      .replace(/(?:-\s*)?30\s*%\s*Secondary\b\s*:?/gi, "- Supporting (~30%):")
      .replace(/(?:-\s*)?10\s*%\s*Accents?\b\s*:?/gi, "- Accents (~10%):")
      // "60-30-10 Rule" / "60 / 30 / 10 rule" → guideline label.
      .replace(
        /60\s*[-/]?\s*30\s*[-/]?\s*10\s*Rule/gi,
        "dominant/supporting/accent guideline"
      )
      // Bare ratio in any separator form: "60-30-10", "60/30/10", "60 30 10".
      .replace(/60\s*[-/]\s*30\s*[-/]\s*10/gi, "dominant/supporting/accent")
      .replace(/60-?30-?10/gi, "dominant/supporting/accent")
  );
}
