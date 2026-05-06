import { describe, it, expect } from "vitest";
import { BRAND_NEGATIVE_PROMPT } from "@/lib/ai/director/negative-prompts";
import {
  UGC_DIRECTOR_PROMPT,
  MULTI_REFERENCE_DIRECTOR_PROMPT,
  MULTI_FRAME_DIRECTOR_PROMPT,
  LIPSYNCING_DIRECTOR_PROMPT,
  FIRST_N_LAST_FRAMES_DIRECTOR_PROMPT,
  TEXT_TO_VIDEO_DIRECTOR_PROMPT,
} from "@/lib/ai/director/system-prompts";

describe("No Magnetic Closure on Non-Magnetic Packaging", () => {
  it("BRAND_NEGATIVE_PROMPT includes rule against magnetic claims on non-magnetic products", () => {
    // The negative constraint block must explicitly prohibit
    // "magnetic closure on non-magnetic packaging"
    expect(BRAND_NEGATIVE_PROMPT).toMatch(/no magnetic closure on\s+non-magnetic packaging/i);
  });

  it("BRAND_NEGATIVE_PROMPT includes rule against lash strips when product is clusters", () => {
    // Prevent hallucinating lash strips when the product is actually clusters
    expect(BRAND_NEGATIVE_PROMPT).toMatch(/no lash strips when product is clusters/i);
  });

  it("BRAND_NEGATIVE_PROMPT includes rule against kit contents not in productTruth", () => {
    // Prevent hallucinating kit contents that don't exist
    expect(BRAND_NEGATIVE_PROMPT).toMatch(/no kit contents that aren't in/i);
  });

  it("BRAND_NEGATIVE_PROMPT is appended to all Director system prompts", () => {
    // Verify the negative constraints are actually part of all system prompts
    const prompts = [
      UGC_DIRECTOR_PROMPT,
      MULTI_REFERENCE_DIRECTOR_PROMPT,
      MULTI_FRAME_DIRECTOR_PROMPT,
      LIPSYNCING_DIRECTOR_PROMPT,
      FIRST_N_LAST_FRAMES_DIRECTOR_PROMPT,
      TEXT_TO_VIDEO_DIRECTOR_PROMPT,
    ];

    for (const prompt of prompts) {
      expect(prompt, "Each Director prompt should include BRAND_NEGATIVE_PROMPT").toContain(
        BRAND_NEGATIVE_PROMPT
      );
    }
  });

  it("BRAND_NEGATIVE_PROMPT is a non-empty string", () => {
    expect(typeof BRAND_NEGATIVE_PROMPT).toBe("string");
    expect(BRAND_NEGATIVE_PROMPT.length).toBeGreaterThan(0);
  });
});
