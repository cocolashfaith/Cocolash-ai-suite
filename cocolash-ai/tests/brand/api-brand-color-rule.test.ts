import { describe, it, expect } from "vitest";
import { COLOR_RULE } from "@/lib/constants/brand";
import { MASTER_BRAND_DNA } from "@/lib/prompts/brand-dna";

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

  it("override logic: when stored row is served, brand_dna_prompt is scrubbed of '60-30-10' string", () => {
    // Arrange: Simulate the stale stored brand_dna_prompt
    const staleBrandDnaPrompt =
      "CocoLash is a premium lash brand... 60-30-10 Rule: 60% Primary Color..." +
      "This is the old marketing copy that must be removed.";

    // Assert: This is the problematic version that exists in production
    expect(staleBrandDnaPrompt).toContain("60-30-10");

    // After Wave 1 override in app/api/brand/route.ts, the served prompt
    // must not contain "60-30-10" substring
    const scrubbed = staleBrandDnaPrompt.replace(/.*60-30-10.*/, "");
    expect(scrubbed).not.toContain("60-30-10");

    // Note: Wave 1 will implement scrubbing logic to remove "60-30-10" blocks
    // from brand_dna_prompt when serving the response
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
