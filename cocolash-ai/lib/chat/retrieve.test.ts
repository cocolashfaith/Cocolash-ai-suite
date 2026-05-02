/**
 * Unit tests for the pure helpers in lib/chat/retrieve.ts.
 * The full retrieve() function hits the DB + OpenAI; covered by chat-eval.
 */

import { describe, it, expect } from "vitest";
import { rerankByTier, isAboveThreshold } from "./retrieve";

describe("rerankByTier", () => {
  it("orders by effective score (1 - distance - tier penalty)", () => {
    const out = rerankByTier([
      { tier: 2, distance: 0.10 }, // score 1 - 0.10 - 0.05 = 0.85
      { tier: 1, distance: 0.20 }, // score 1 - 0.20 - 0.00 = 0.80
      { tier: 3, distance: 0.05 }, // score 1 - 0.05 - 0.10 = 0.85
    ]);
    expect(out[0].effective_score).toBeCloseTo(0.85);
    expect(out[1].effective_score).toBeCloseTo(0.85);
    expect(out[2].effective_score).toBeCloseTo(0.80);
  });

  it("prefers a closer tier-1 match over a farther tier-2 match", () => {
    const out = rerankByTier([
      { tier: 2, distance: 0.20 }, // 0.75
      { tier: 1, distance: 0.30 }, // 0.70
    ]);
    expect(out[0].tier).toBe(2);
  });

  it("prefers tier-1 over tier-2 when distances are equal", () => {
    const out = rerankByTier([
      { tier: 2, distance: 0.20 },
      { tier: 1, distance: 0.20 },
    ]);
    expect(out[0].tier).toBe(1);
  });

  it("handles empty input", () => {
    expect(rerankByTier([])).toEqual([]);
  });

  it("respects custom tier bonus", () => {
    const heavyBonus = rerankByTier(
      [
        { tier: 2, distance: 0.20 },
        { tier: 1, distance: 0.30 },
      ],
      0.20
    );
    // tier1 score = 0.70; tier2 score = 0.60; so tier1 wins
    expect(heavyBonus[0].tier).toBe(1);
  });
});

describe("isAboveThreshold", () => {
  it("treats distance below threshold as confident", () => {
    expect(isAboveThreshold(0.4)).toBe(true);
    expect(isAboveThreshold(0.6)).toBe(true);
  });
  it("treats distance above threshold as not confident", () => {
    expect(isAboveThreshold(0.61)).toBe(false);
    expect(isAboveThreshold(1.0)).toBe(false);
  });
  it("respects custom threshold", () => {
    expect(isAboveThreshold(0.7, 0.8)).toBe(true);
    expect(isAboveThreshold(0.85, 0.8)).toBe(false);
  });
});
