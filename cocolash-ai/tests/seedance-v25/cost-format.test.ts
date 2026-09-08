import { describe, it, expect } from "vitest";
import {
  describeCostBreakdown,
  formatCreditsAndUsd,
  AUTO_DURATION_NOTE,
} from "@/lib/costs/format";
import { estimateV4Cost, type V4CostBreakdown } from "@/lib/costs/estimates";
import { SEEDANCE_25_RATES_DEFAULT } from "@/lib/seedance/pricing";

/**
 * Package B — cost display (D4).
 *
 * `describeCostBreakdown` is the single place that turns a V4CostBreakdown
 * into the three strings the wizard renders: the USD headline, the credits
 * line (2.5 only) and the Auto-duration caveat.
 */

/** 720p × 30 s, no avatar/script/last-frame → Seedance 8,079 credits + director. */
function breakdown25(overrides: Partial<Parameters<typeof estimateV4Cost>[0]> = {}): V4CostBreakdown {
  return estimateV4Cost({
    mode: "ugc",
    durationSeconds: 30,
    resolution: "720p",
    generatesAvatar: false,
    composesProduct: false,
    generatesLastFrame: false,
    generatesScript: false,
    engine: "2.5",
    rates: SEEDANCE_25_RATES_DEFAULT,
    usdPerCredit: 0.001,
    ...overrides,
  });
}

describe("formatCreditsAndUsd", () => {
  it("renders credits with thousands separators and the USD equivalent", () => {
    expect(formatCreditsAndUsd(8079, 0.001)).toBe("8,079 credits · ≈ $8.08");
  });

  it("keeps fractional credits (Enhancor reports e.g. 1615.8)", () => {
    expect(formatCreditsAndUsd(1615.8, 0.001)).toBe("1,615.8 credits · ≈ $1.62");
  });

  it("defaults usd_per_credit to 0.001 when omitted", () => {
    expect(formatCreditsAndUsd(487.3)).toBe("487.3 credits · ≈ $0.49");
  });

  it("honours a custom usd_per_credit (admin edited the rate)", () => {
    expect(formatCreditsAndUsd(8079, 0.002)).toBe("8,079 credits · ≈ $16.16");
  });
});

describe("describeCostBreakdown — engine 2.5", () => {
  it("headline is the ≈ USD total and creditsLine carries the credits", () => {
    const d = describeCostBreakdown(breakdown25());
    // 269.3 × 30 = 8079 credits = $8.079 + $0.02 director = $8.10
    expect(d.headline).toBe("≈ $8.10");
    expect(d.creditsLine).toBeDefined();
    expect(d.creditsLine).toContain("8,079 credits");
    expect(d.creditsLine).toContain("≈ $8.08");
    expect(d.creditsLine).toContain("video");
  });

  it("labels the Auto-duration assumption", () => {
    const d = describeCostBreakdown(breakdown25({ durationSeconds: -1 }));
    expect(d.note).toBe(AUTO_DURATION_NOTE);
    expect(d.note).toContain("10 s");
  });

  it("has no note when the duration is explicit", () => {
    expect(describeCostBreakdown(breakdown25()).note).toBeUndefined();
  });

  it("tracks a custom usd_per_credit", () => {
    const d = describeCostBreakdown(breakdown25({ usdPerCredit: 0.002 }));
    expect(d.creditsLine).toContain("8,079 credits");
    expect(d.creditsLine).toContain("≈ $16.16");
    expect(d.headline).toBe("≈ $16.18");
  });
});

describe("describeCostBreakdown — engine 2.0 (unchanged)", () => {
  it("shows only the USD headline — no credits line, no Auto note", () => {
    const d = describeCostBreakdown(
      estimateV4Cost({
        mode: "ugc",
        durationSeconds: 8,
        resolution: "720p",
        generatesAvatar: false,
        composesProduct: false,
        generatesLastFrame: false,
        generatesScript: false,
        engine: "2.0",
      })
    );
    // 0.205 × 8 = 1.64 + 0.02 director = 1.66
    expect(d.headline).toBe("≈ $1.66");
    expect(d.creditsLine).toBeUndefined();
    expect(d.note).toBeUndefined();
  });

  it("treats a breakdown with no engine (legacy HeyGen shape) as 2.0", () => {
    const d = describeCostBreakdown({ items: [], total: 1.2 });
    expect(d.headline).toBe("≈ $1.20");
    expect(d.creditsLine).toBeUndefined();
  });
});
