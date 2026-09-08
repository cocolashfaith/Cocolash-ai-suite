/**
 * Package F — script sizing for Seedance 2.5 (D10).
 *
 * 2.5 clips run 4–30 s (or Auto = -1). `buildSeedanceDurationRule` must scale
 * the spoken word band linearly across that whole range (2.3–3 words/sec) and
 * produce a sensible plan for Auto (treated as ~10 s, and it says so).
 *
 * The 2.0-era cap of 15 s is gone — see tests/prompts/seedance-duration-sizing.ts
 * for the (deliberately updated) legacy assertions.
 */

import { describe, it, expect } from "vitest";
import { buildSeedanceDurationRule } from "@/lib/prompts/scripts/seedance";
import { AUTO_DURATION } from "@/lib/seedance/v25/types";

describe("buildSeedanceDurationRule — 4–30 s range", () => {
  it("scales the word band linearly up to 30 seconds", () => {
    const rule = buildSeedanceDurationRule(30);
    expect(rule).toContain("30 seconds");
    expect(rule).toContain("69-90 words");
  });

  it("gives a longer-form structure for 20 s clips", () => {
    const rule = buildSeedanceDurationRule(20);
    expect(rule).toContain("20 seconds");
    expect(rule).toContain("46-60 words");
    expect(rule).toMatch(/two or three beats/i);
  });

  it("keeps the mid bands intact", () => {
    expect(buildSeedanceDurationRule(5)).toContain("12-15 words");
    expect(buildSeedanceDurationRule(10)).toContain("23-30 words");
    expect(buildSeedanceDurationRule(15)).toContain("35-45 words");
  });

  it("clamps above 30 s down to the 30 s plan", () => {
    const rule = buildSeedanceDurationRule(45);
    expect(rule).toContain("30 seconds");
    expect(rule).toContain("69-90 words");
  });

  it("clamps below 4 s up to the 4 s plan", () => {
    expect(buildSeedanceDurationRule(2)).toContain("4 seconds");
  });
});

describe("buildSeedanceDurationRule — Auto (-1)", () => {
  it("treats Auto as ~10 seconds and says so", () => {
    const rule = buildSeedanceDurationRule(AUTO_DURATION);
    expect(rule).toMatch(/Auto/);
    expect(rule).toContain("10 seconds");
    expect(rule).toContain("23-30 words");
    // Auto is not a hard cut-off — do not threaten a mid-sentence cut.
    expect(rule).not.toMatch(/HARD LENGTH LIMIT/);
  });

  it("treats non-finite input as Auto rather than crashing", () => {
    const rule = buildSeedanceDurationRule(Number.NaN);
    expect(rule).toMatch(/Auto/);
    expect(rule).toContain("10 seconds");
  });
});
