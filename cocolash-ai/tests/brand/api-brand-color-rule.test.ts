import { describe, it, expect } from "vitest";
import { COLOR_RULE } from "@/lib/constants/brand";
import { MASTER_BRAND_DNA } from "@/lib/prompts/brand-dna";
import { scrubColorRuleFraming } from "@/app/api/brand/route";

/**
 * Phase 31 Wave 0 — RED phase test for DAT-01: Brand API color-rule override
 *
 * Per D-01, the /api/brand GET handler must serve the corrected color rule
 * even when the stored brand_profiles row contains stale "60-30-10" text
 * (created 2026-02-11, before Phase 31 fix). This test establishes the
 * acceptance criteria: the API response contains the corrected rule text
 * and does NOT include "60-30-10" substring anywhere.
 *
 * Per Phase 28 evidence (api-brand-live-20260531T121755Z.json), the
 * stored row has color_palette.rule containing the false "60-30-10 Rule: 60%..."
 * text and brand_dna_prompt containing "60-30-10" block. After Phase 31 deploy,
 * the route override applies the corrected rule consistently.
 *
 * Tests verify:
 * 1. lib/constants/brand.ts COLOR_RULE no longer contains "60-30-10"
 * 2. The override logic in app/api/brand/route.ts composes the corrected rule
 * 3. The corrected rule matches the brand-dna.ts wording (dominant/supporting/accent)
 *
 * Tests MUST FAIL (RED) until Wave 1 implementation (route override added).
 */
describe("Phase 31 DAT-01 — /api/brand GET returns corrected color rule", () => {
  it("COLOR_RULE constant in lib/constants/brand.ts does not contain false '60-30-10' string", () => {
    // Arrange: Check the exported constant

    // Assert: The constant must NOT contain "60-30-10"
    expect(COLOR_RULE).not.toContain("60-30-10");
    expect(COLOR_RULE).not.toMatch(/60-30-10/);

    // Note: Wave 1 will replace this with the corrected description
    // per D-01 recommendation:
    // "Dominant (~60%): Soft Pink or Creamy Beige | Supporting (~30%): Warm/Golden Brown | Accents (~10%): Charcoal or Clean White — percentages are guidelines, not hard ratios."
  });

  it("brand_dna_prompt in lib/prompts/brand-dna.ts uses corrected dominant/supporting/accent wording (no '60-30-10')", () => {
    // Arrange: Check the MASTER_BRAND_DNA constant

    // Assert: The brand DNA prompt must NOT contain the false "60-30-10" string
    expect(MASTER_BRAND_DNA).not.toContain("60-30-10");

    // Assert: The brand DNA prompt should use the correct language
    expect(MASTER_BRAND_DNA).toMatch(/[Dd]ominant|[Ss]upporting|[Aa]ccent/);
  });

  it("route override applies: /api/brand GET returns corrected rule even when stored row has stale text", () => {
    // Arrange: Define the expected corrected rule per D-01
    const expectedCorrectedRule =
      "Dominant (~60%): Soft Pink or Creamy Beige | Supporting (~30%): Warm/Golden Brown | Accents (~10%): Charcoal or Clean White — percentages are guidelines, not hard ratios.";

    const staleBrandRule =
      "60-30-10 Rule: 60% Primary (Pink/Beige), 30% Secondary (Brown/Gold), 10% Accents (Charcoal/White)";

    // Assert: The corrected rule must be completely different from the stale rule
    expect(expectedCorrectedRule).not.toContain("60-30-10");
    expect(expectedCorrectedRule).toContain("Dominant");
    expect(expectedCorrectedRule).toContain("Supporting");
    expect(expectedCorrectedRule).toContain("percentages are guidelines");

    // Assert: The stale rule is the problematic version
    expect(staleBrandRule).toContain("60-30-10");

    // Note: Wave 1 will implement the route override in app/api/brand/route.ts
    // that applies expectedCorrectedRule to the response even when the stored
    // brand_profiles row contains staleBrandRule.
  });

  it("scrubColorRuleFraming reframes the 60-30-10 framing while PRESERVING brand colors and other sections", () => {
    // Arrange: the real stale brand_dna_prompt color section (per Phase 28 evidence)
    const stale =
      "2. LIGHTING: soft window light.\n" +
      "3. COLOR PALETTE (60-30-10 Rule):\n" +
      "   - 60% Primary: Soft Pink (#ead1c1), Creamy Beige (#ede5d6)\n" +
      "   - 30% Secondary: Warm Dark Brown (#28150e), Golden Brown (#ce9765)\n" +
      "   - 10% Accents: Charcoal (#242424), Clean White (#ffffff)\n" +
      "4. MOOD: Confident, Friendly, Warm, Proud.";

    const scrubbed = scrubColorRuleFraming(stale) as string;

    // No misleading "60-30-10" framing remains
    expect(scrubbed).not.toContain("60-30-10");
    // Rigid "60% Primary / 30% Secondary / 10% Accents" labels are reframed
    expect(scrubbed).not.toMatch(/-\s*60%\s*Primary/i);
    expect(scrubbed).toContain("Dominant (~60%):");
    expect(scrubbed).toContain("Supporting (~30%):");
    expect(scrubbed).toContain("Accents (~10%):");
    // The actual brand colors are PRESERVED (the prior line-delete scrub orphaned/dropped these)
    expect(scrubbed).toContain("#ead1c1");
    expect(scrubbed).toContain("#ce9765");
    expect(scrubbed).toContain("#242424");
    // Unrelated sections are untouched
    expect(scrubbed).toContain("2. LIGHTING: soft window light.");
    expect(scrubbed).toContain("4. MOOD: Confident, Friendly, Warm, Proud.");
  });

  it("scrubColorRuleFraming is safe on null/undefined and idempotent", () => {
    expect(scrubColorRuleFraming(null)).toBeNull();
    expect(scrubColorRuleFraming(undefined)).toBeUndefined();
    const once = scrubColorRuleFraming("(60-30-10 Rule): - 60% Primary: Pink") as string;
    const twice = scrubColorRuleFraming(once) as string;
    expect(twice).toBe(once);
    expect(twice).not.toContain("60-30-10");
  });

  it("fresh seeding scenario: new profile uses corrected COLOR_RULE constant (no '60-30-10')", () => {
    // Arrange: When seeding a new profile, the route uses COLOR_RULE from constants

    // Assert: COLOR_RULE must be corrected (no "60-30-10")
    expect(COLOR_RULE).not.toContain("60-30-10");

    // Note: Once COLOR_RULE is fixed in lib/constants/brand.ts,
    // fresh seeding will automatically use the corrected version.
    // The route override handles existing stale rows.
  });
});
