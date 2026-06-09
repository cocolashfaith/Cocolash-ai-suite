/**
 * Phase 34.1 Group B — R-34.1-02 acceptance.
 *
 * The script must be sized to the real Seedance clip duration (4–15s), not the
 * legacy 15/30/60/90 buckets. buildSeedanceDurationRule turns a seconds value
 * into a concrete word band (~2.5–3 words/sec) + structure guidance, and is the
 * single source the script generator and word-count hints rely on.
 */

import { describe, it, expect } from "vitest";
import {
  buildSeedanceDurationRule,
  buildSeedanceScriptUserPrompt,
} from "@/lib/prompts/scripts/seedance";

describe("buildSeedanceDurationRule", () => {
  it("scales the word band to the clip length", () => {
    expect(buildSeedanceDurationRule(5)).toContain("12-15 words");
    expect(buildSeedanceDurationRule(10)).toContain("23-30 words");
    expect(buildSeedanceDurationRule(15)).toContain("35-45 words");
  });

  it("gives single-idea guidance for very short clips", () => {
    expect(buildSeedanceDurationRule(5)).toMatch(/one single idea/i);
  });

  it("allows more structure for longer clips", () => {
    expect(buildSeedanceDurationRule(15)).toMatch(/two quick beats/i);
  });

  it("clamps to the 4–15s Seedance range", () => {
    // 30s no longer exists — it must be treated as the 15s cap.
    expect(buildSeedanceDurationRule(30)).toContain("15 seconds");
    expect(buildSeedanceDurationRule(2)).toContain("4 seconds");
  });

  it("rounds fractional seconds", () => {
    expect(buildSeedanceDurationRule(7.4)).toContain("7 seconds");
  });
});

describe("buildSeedanceScriptUserPrompt sizes to the duration", () => {
  it("embeds the seconds-based word band for the chosen duration", () => {
    const prompt = buildSeedanceScriptUserPrompt({
      campaignType: "product-showcase",
      tone: "casual",
      duration: 8,
    });
    expect(prompt).toContain("8 seconds");
    expect(prompt).toMatch(/\d+-\d+ words/);
    // No legacy bucket language should survive.
    expect(prompt).not.toContain("30 seconds");
    expect(prompt).not.toContain("60 seconds");
  });
});
