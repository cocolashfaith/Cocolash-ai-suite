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

  // Updated 2026-09-10 for decision G3: the generic brand claims are no longer
  // emitted alongside extracted facts at all — they are a fallback used only
  // when nothing better exists, so they can never contradict the real product.
  it("replaces the generic brand facts entirely when facts exist", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "product-showcase",
      tone: "casual",
      duration: 10,
      productFacts: FACTS_BLOCK,
    });
    expect(prompt.indexOf("WHAT THE PRODUCT ACTUALLY IS")).toBeGreaterThan(-1);
    expect(prompt).not.toMatch(/GENERIC BRAND FACTS/);
    expect(prompt).toMatch(/these facts win/i);
  });

  it("omits the facts block entirely when no facts are provided", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "product-showcase",
      tone: "casual",
      duration: 10,
    });
    expect(prompt).not.toContain("WHAT THE PRODUCT ACTUALLY IS");
    // ...and only then does the generic fallback appear (G3).
    expect(prompt).toMatch(/GENERIC BRAND FACTS/);
  });
});
