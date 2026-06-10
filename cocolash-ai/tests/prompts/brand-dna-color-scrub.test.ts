import { describe, it, expect } from "vitest";
import { getBrandDNA, MASTER_BRAND_DNA } from "@/lib/prompts/brand-dna";

/**
 * Faith reported the brand palette was "injected into every image-generation
 * prompt as a 60-30-10 rule that doesn't add up". The image-generation path
 * resolves the Brand DNA via getBrandDNA(customDNA), where customDNA is the
 * STORED brand_profiles.brand_dna_prompt — a row that predates the fix and is
 * never rewritten by a code change alone. getBrandDNA must therefore sanitise
 * the stale framing before it reaches the model.
 */
describe("getBrandDNA — sanitises stale 60-30-10 framing from stored DNA", () => {
  const staleStoredDNA =
    "[SYSTEM CONTEXT]\n" +
    "3. COLOR PALETTE (60-30-10 Rule):\n" +
    "   - 60% Primary: Soft Pink (#ead1c1), Creamy Beige (#ede5d6)\n" +
    "   - 30% Secondary: Warm Dark Brown (#28150e), Golden Brown (#ce9765)\n" +
    "   - 10% Accents: Charcoal (#242424), Clean White (#ffffff)\n" +
    "4. MOOD: Confident.";

  it("strips the misleading 60-30-10 framing from a custom (stored) DNA string", () => {
    const out = getBrandDNA(staleStoredDNA);
    expect(out).not.toContain("60-30-10");
    expect(out).not.toMatch(/-\s*60%\s*Primary/i);
    expect(out).toContain("Dominant (~60%):");
  });

  it("PRESERVES the actual brand colors and unrelated sections", () => {
    const out = getBrandDNA(staleStoredDNA);
    expect(out).toContain("#ead1c1");
    expect(out).toContain("#ce9765");
    expect(out).toContain("#242424");
    expect(out).toContain("4. MOOD: Confident.");
  });

  it("falls back to the (already-corrected) MASTER_BRAND_DNA when no custom DNA", () => {
    expect(getBrandDNA(null)).toBe(MASTER_BRAND_DNA);
    expect(getBrandDNA("   ")).toBe(MASTER_BRAND_DNA);
    expect(MASTER_BRAND_DNA).not.toContain("60-30-10");
  });
});
