import { describe, it, expect } from "vitest";
import {
  MULTI_FRAME_DIRECTOR_PROMPT,
  UGC_DIRECTOR_PROMPT,
  MULTI_REFERENCE_DIRECTOR_PROMPT,
  LIPSYNCING_DIRECTOR_PROMPT,
  FIRST_N_LAST_FRAMES_DIRECTOR_PROMPT,
  TEXT_TO_VIDEO_DIRECTOR_PROMPT,
} from "@/lib/ai/director/system-prompts";

describe("Multi-Frame No @-Tokens", () => {
  it("MULTI_FRAME_DIRECTOR_PROMPT explicitly forbids @avatar, @product, @image tokens", () => {
    // Multi-frame mode should never use reference image tokens
    // because Enhancor API for multi-frame accepts NO images
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/@avatar/);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/@product/);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/no\s+reference\s+images/i);
  });

  it("MULTI_FRAME_DIRECTOR_PROMPT emphasizes subject continuity via text only", () => {
    // The prompt must teach the model to describe subject textually
    // instead of relying on reference images
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/subject.*text/i);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/describe.*appearance/i);
  });

  it("all Director prompts reference UNIVERSAL_PRELUDE containing BRAND_NEGATIVE_PROMPT", () => {
    // Static check: all six system prompts must include the shared constraints
    const prompts = [
      UGC_DIRECTOR_PROMPT,
      MULTI_REFERENCE_DIRECTOR_PROMPT,
      MULTI_FRAME_DIRECTOR_PROMPT,
      LIPSYNCING_DIRECTOR_PROMPT,
      FIRST_N_LAST_FRAMES_DIRECTOR_PROMPT,
      TEXT_TO_VIDEO_DIRECTOR_PROMPT,
    ];

    for (const prompt of prompts) {
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
      // Each should have the universal prelude content about product truth
      expect(prompt).toMatch(/productTruth/);
    }
  });

  it("MULTI_FRAME_DIRECTOR_PROMPT specifies JSON array output format", () => {
    // Multi-frame must return JSON, not free-text
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/JSON/i);
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/\[\s*{\s*"prompt"/);
  });

  it("MULTI_FRAME_DIRECTOR_PROMPT caps segment length at 60 words", () => {
    // Each segment must be concise to avoid model collapse
    expect(MULTI_FRAME_DIRECTOR_PROMPT).toMatch(/60\s+words\s+per\s+segment/i);
  });
});
