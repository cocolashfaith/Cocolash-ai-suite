import { describe, it, expect } from "vitest";
import {
  AUTO_DURATION_ESTIMATE_SECONDS,
  SEEDANCE_20_USD_PER_SECOND,
  SEEDANCE_25_RATES_DEFAULT,
  USD_PER_CREDIT_DEFAULT,
  coerceRateTable,
  creditsToUsd,
  estimateCredits,
  formatCredits,
  formatUsd,
  isReducedRateEligible,
  roundUsd,
  usdToCredits,
} from "@/lib/seedance/pricing";
import { API_COSTS, estimateV4Cost } from "@/lib/costs/estimates";

/**
 * Real Enhancor pricing (docs/seedance-2.5/01-API-REFERENCE.md, 2026-09-08).
 * 1 credit = $0.001. Faith's "$14 per 30 s" = 1080p; 720p/30 s = $8.08; 480p = $3.67.
 */
describe("Seedance 2.5 pricing — seed tables", () => {
  it("1 credit = $0.001 by default", () => {
    expect(USD_PER_CREDIT_DEFAULT).toBe(0.001);
    expect(creditsToUsd(25_000)).toBeCloseTo(25, 6);
    expect(usdToCredits(25)).toBeCloseTo(25_000, 6);
  });

  it("standard rates match the Enhancor pricing page", () => {
    expect(SEEDANCE_25_RATES_DEFAULT.standard["480p"]).toEqual({ standard: 122.2, uncensored: 123.422 });
    expect(SEEDANCE_25_RATES_DEFAULT.standard["720p"]).toEqual({ standard: 269.3, uncensored: 271.993 });
    expect(SEEDANCE_25_RATES_DEFAULT.standard["1080p"]).toEqual({ standard: 487.3, uncensored: 492.173 });
  });

  it("reduced rates (with video inputs) match the Enhancor pricing page", () => {
    expect(SEEDANCE_25_RATES_DEFAULT.reduced["480p"]).toEqual({ standard: 72.9, uncensored: 73.629 });
    expect(SEEDANCE_25_RATES_DEFAULT.reduced["720p"]).toEqual({ standard: 165.5, uncensored: 167.155 });
    expect(SEEDANCE_25_RATES_DEFAULT.reduced["1080p"]).toEqual({ standard: 292.8, uncensored: 295.728 });
  });

  it("2.0 legacy USD/sec constants are unchanged and mirrored (D4)", () => {
    expect(SEEDANCE_20_USD_PER_SECOND["480p"]).toBe(API_COSTS.seedance.videoGeneration480pPerSecond);
    expect(SEEDANCE_20_USD_PER_SECOND["720p"]).toBe(API_COSTS.seedance.videoGeneration720pPerSecond);
    expect(SEEDANCE_20_USD_PER_SECOND["1080p"]).toBe(API_COSTS.seedance.videoGeneration1080pPerSecond);
    expect(API_COSTS.seedance.videoGeneration720pPerSecond).toBe(0.205);
  });
});

describe("estimateCredits — Seedance 2.5 standard rate", () => {
  it("720p × 30 s = 8079 credits = $8.08 (Faith's 720p answer)", () => {
    const est = estimateCredits({ engine: "2.5", mode: "ugc", resolution: "720p", durationSeconds: 30 });
    expect(est.credits).toBe(8079);
    expect(est.usd).toBe(8.08);
    expect(est.rateKind).toBe("standard");
    expect(est.billableSeconds).toBe(30);
    expect(est.assumedAutoDuration).toBe(false);
  });

  it("1080p × 30 s = 14619 credits = $14.62 (Faith's '$14 per 30 s')", () => {
    const est = estimateCredits({ engine: "2.5", mode: "ugc", resolution: "1080p", durationSeconds: 30 });
    expect(est.credits).toBe(14619);
    expect(est.usd).toBe(14.62);
  });

  it("480p × 30 s = 3666 credits = $3.67", () => {
    const est = estimateCredits({ engine: "2.5", mode: "ugc", resolution: "480p", durationSeconds: 30 });
    expect(est.credits).toBe(3666);
    expect(est.usd).toBe(3.67);
  });

  it("reproduces the POC job: 720p × 6 s = 1615.8 credits", () => {
    const est = estimateCredits({ engine: "2.5", mode: "ugc", resolution: "720p", durationSeconds: 6 });
    expect(est.credits).toBe(1615.8);
    expect(est.usd).toBe(1.62);
  });

  it("uses the uncensored column when is_uncensored", () => {
    const est = estimateCredits({
      engine: "2.5",
      mode: "ugc",
      resolution: "720p",
      durationSeconds: 30,
      isUncensored: true,
    });
    expect(est.creditsPerSecond).toBe(271.993);
    expect(est.credits).toBe(8159.79);
    expect(est.isUncensored).toBe(true);
  });

  it("Auto duration (-1) is estimated on 10 s and flagged", () => {
    const est = estimateCredits({ engine: "2.5", mode: "ugc", resolution: "720p", durationSeconds: -1 });
    expect(AUTO_DURATION_ESTIMATE_SECONDS).toBe(10);
    expect(est.assumedAutoDuration).toBe(true);
    expect(est.outputSeconds).toBe(10);
    expect(est.credits).toBe(2693);
    expect(est.note).toMatch(/Auto duration/);
  });

  it("multi_frame sums segment durations", () => {
    const est = estimateCredits({
      engine: "2.5",
      mode: "multi_frame",
      resolution: "480p",
      durationSeconds: 0,
      multiFrameDurations: [4, 6, 5],
    });
    expect(est.outputSeconds).toBe(15);
    expect(est.credits).toBe(1833);
  });

  it("honours live rates + usd_per_credit overrides from video_settings", () => {
    const rates = structuredClone(SEEDANCE_25_RATES_DEFAULT);
    rates.standard["720p"].standard = 300;
    const est = estimateCredits({
      engine: "2.5",
      mode: "ugc",
      resolution: "720p",
      durationSeconds: 10,
      rates,
      usdPerCredit: 0.002,
    });
    expect(est.credits).toBe(3000);
    expect(est.usd).toBe(6);
    expect(est.usdPerCredit).toBe(0.002);
  });
});

describe("estimateCredits — Seedance 2.5 reduced rate (video inputs)", () => {
  it("applies the reduced rate only for multi_reference/edit/extend/multi_frame with videos", () => {
    expect(isReducedRateEligible("multi_reference", true)).toBe(true);
    expect(isReducedRateEligible("edit", true)).toBe(true);
    expect(isReducedRateEligible("extend", true)).toBe(true);
    expect(isReducedRateEligible("multi_frame", true)).toBe(true);
    expect(isReducedRateEligible("multi_reference", false)).toBe(false);
    expect(isReducedRateEligible("ugc", true)).toBe(false);
    expect(isReducedRateEligible("lipsyncing", true)).toBe(false);
  });

  it("bills input + output seconds at the reduced rate", () => {
    const est = estimateCredits({
      engine: "2.5",
      mode: "multi_reference",
      resolution: "720p",
      durationSeconds: 10,
      hasVideoInputs: true,
      inputVideoSeconds: 5,
    });
    expect(est.rateKind).toBe("reduced");
    expect(est.creditsPerSecond).toBe(165.5);
    expect(est.billableSeconds).toBe(15);
    expect(est.credits).toBe(2482.5);
    expect(est.usd).toBe(2.48);
  });

  it("reduced + uncensored uses the reduced uncensored column", () => {
    const est = estimateCredits({
      engine: "2.5",
      mode: "extend",
      resolution: "1080p",
      durationSeconds: 8,
      hasVideoInputs: true,
      isUncensored: true,
    });
    expect(est.creditsPerSecond).toBe(295.728);
    expect(est.rateKind).toBe("reduced");
    expect(est.note).toMatch(/input video length unknown/);
  });

  it("ugc with videos flag still uses the standard rate (ugc never sends videos)", () => {
    const est = estimateCredits({
      engine: "2.5",
      mode: "ugc",
      resolution: "720p",
      durationSeconds: 10,
      hasVideoInputs: true,
    });
    expect(est.rateKind).toBe("standard");
    expect(est.credits).toBe(2693);
  });
});

describe("estimateCredits — Seedance 2.0 legacy mapping", () => {
  it("uses the legacy USD/sec and derives informational credits", () => {
    const est = estimateCredits({ engine: "2.0", mode: "ugc", resolution: "720p", durationSeconds: 15 });
    expect(est.engine).toBe("2.0");
    expect(est.usd).toBe(3.08); // 0.205 × 15 = 3.075
    expect(est.credits).toBe(3075);
    expect(est.rateKind).toBe("standard");
    expect(est.note).toMatch(/2\.0/);
  });

  it("1080p legacy rate is $0.41/s", () => {
    const est = estimateCredits({ engine: "2.0", mode: "ugc", resolution: "1080p", durationSeconds: 10 });
    expect(est.usd).toBe(4.1);
  });
});

describe("formatting + coercion helpers", () => {
  it("formats credits and USD", () => {
    expect(formatCredits(8079)).toBe("8,079");
    expect(formatCredits(1615.8)).toBe("1,615.8");
    expect(formatUsd(8.079)).toBe("$8.08");
    expect(roundUsd(14.619)).toBe(14.62);
  });

  it("coerceRateTable accepts numeric strings from JSONB and rejects bad shapes", () => {
    const ok = coerceRateTable({
      standard: {
        "480p": { standard: "122.2", uncensored: "123.422" },
        "720p": { standard: 269.3, uncensored: 271.993 },
        "1080p": { standard: 487.3, uncensored: 492.173 },
      },
      reduced: SEEDANCE_25_RATES_DEFAULT.reduced,
    });
    expect(ok?.standard["480p"].standard).toBe(122.2);
    expect(coerceRateTable(null)).toBeNull();
    expect(coerceRateTable({ standard: {} })).toBeNull();
    expect(coerceRateTable({ standard: SEEDANCE_25_RATES_DEFAULT.standard })).toBeNull();
    expect(
      coerceRateTable({
        standard: { ...SEEDANCE_25_RATES_DEFAULT.standard, "720p": { standard: -1, uncensored: 1 } },
        reduced: SEEDANCE_25_RATES_DEFAULT.reduced,
      })
    ).toBeNull();
  });
});

describe("estimateV4Cost — engine-aware wizard estimate", () => {
  const base = {
    mode: "ugc" as const,
    resolution: "720p" as const,
    generatesAvatar: false,
    composesProduct: false,
    generatesLastFrame: false,
    generatesScript: false,
  };

  it("engine 2.5 prices the Seedance line in credits and exposes them on the breakdown", () => {
    const b = estimateV4Cost({ ...base, engine: "2.5", durationSeconds: 30 });
    const line = b.items.find((i) => i.id === "seedance")!;
    expect(line.label).toMatch(/Seedance 2\.5/);
    expect(line.hint).toMatch(/8,079 credits/);
    expect(b.engine).toBe("2.5");
    expect(b.credits).toBe(8079);
    expect(b.creditsUsd).toBe(8.08);
    // director line (0.02) + video
    expect(b.total).toBeCloseTo(8.079 + 0.02, 3);
  });

  it("engine 2.5 with Auto duration flags the assumption", () => {
    const b = estimateV4Cost({ ...base, engine: "2.5", durationSeconds: -1 });
    expect(b.assumedAutoDuration).toBe(true);
    expect(b.items.find((i) => i.id === "seedance")!.label).toMatch(/Auto/);
  });

  it("omitting engine keeps the legacy 2.0 numbers exactly", () => {
    const b = estimateV4Cost({ ...base, durationSeconds: 15 });
    const line = b.items.find((i) => i.id === "seedance")!;
    expect(line.cost).toBeCloseTo(0.205 * 15, 6);
    expect(b.engine).toBe("2.0");
    expect(b.credits).toBeUndefined();
  });
});
