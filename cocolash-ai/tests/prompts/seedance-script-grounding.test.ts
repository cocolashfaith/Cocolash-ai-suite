/**
 * Phase 34.1 Group D (R-34.1-04) — the script prompt is grounded in the
 * vision-extracted product facts when they are provided, and the facts take
 * precedence over the generic brand description.
 */

import { describe, it, expect } from "vitest";
import { buildSeedanceScriptUserPrompt } from "@/lib/prompts/scripts/seedance";

const FACTS_BLOCK = `WHAT THE PRODUCT ACTUALLY IS (analyzed from its own images — this is the source of truth):
- Product: multi-lash book
- Packaging: black book-style box with rose-gold lettering
- Do NOT claim (not present in the images): no magnetic closure
Ground every product reference in these facts.`;

describe("buildSeedanceScriptUserPrompt product grounding", () => {
  it("embeds the product facts block when provided", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "unboxing",
      tone: "casual",
      duration: 10,
      productFacts: FACTS_BLOCK,
    });
    expect(prompt).toContain("book-style box with rose-gold lettering");
    expect(prompt).toContain("no magnetic closure");
  });

  it("places the facts before the generic brand facts and marks them authoritative", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "product-showcase",
      tone: "casual",
      duration: 10,
      productFacts: FACTS_BLOCK,
    });
    const factsIdx = prompt.indexOf("WHAT THE PRODUCT ACTUALLY IS");
    const brandIdx = prompt.indexOf("BRAND FACTS TO WEAVE IN");
    expect(factsIdx).toBeGreaterThan(-1);
    expect(brandIdx).toBeGreaterThan(-1);
    expect(factsIdx).toBeLessThan(brandIdx);
    expect(prompt).toMatch(/defer to the product facts above/i);
  });

  it("omits the facts block entirely when no facts are provided", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "product-showcase",
      tone: "casual",
      duration: 10,
    });
    expect(prompt).not.toContain("WHAT THE PRODUCT ACTUALLY IS");
  });
});
