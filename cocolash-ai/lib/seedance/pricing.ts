/**
 * Seedance pricing — REAL Enhancor credit tables (2026-09-08) + estimator.
 *
 *   1 credit = $0.001 USD (top-up: $25 = 25,000 credits). Credits are charged
 *   PER SECOND: total = credits/sec × billable seconds.
 *
 *   Standard rate (no video inputs): billable = output duration.
 *   Reduced rate (videos[] present in multi_reference | edit | extend |
 *   multi_frame): billable = input video seconds + output seconds.
 *   `is_uncensored: true` uses the "uncensored" column.
 *
 *   Sanity anchors (Faith's question): 1080p × 30 s = 14,619 credits = $14.62;
 *   720p × 30 s = 8,079 = $8.08; 480p × 30 s = 3,666 = $3.67.
 *
 * Rates can change on Enhancor's side (D4) → the live table is editable in
 * `video_settings.rates` (lib/settings/video-settings.ts) and passed in via
 * `EstimateCreditsInput.rates`. The constants here are the SEED values.
 *
 * Seedance 2.0 has no credit pricing; its USD/sec numbers are the existing
 * legacy constants (unchanged, D4) — `SEEDANCE_20_USD_PER_SECOND` mirrors
 * `API_COSTS.seedance` in lib/costs/estimates.ts (a test pins them equal).
 *
 * Client-safe (pure functions).
 */

import type { SeedanceEngine } from "@/lib/types";
import {
  AUTO_DURATION,
  SEEDANCE_25_REDUCED_RATE_MODES,
  type Seedance25Resolution,
} from "./v25/types";

// ── Constants ────────────────────────────────────────────────

export const USD_PER_CREDIT_DEFAULT = 0.001;

/** When duration is Auto (-1) we cannot know the length up front; estimate on 10 s and say so. */
export const AUTO_DURATION_ESTIMATE_SECONDS = 10;

export interface CreditRate {
  /** credits per second, normal content */
  standard: number;
  /** credits per second when is_uncensored = true */
  uncensored: number;
}

export type RateResolutionTable = Record<Seedance25Resolution, CreditRate>;

export interface Seedance25RateTable {
  /** No video inputs — billable = output seconds. */
  standard: RateResolutionTable;
  /** With video inputs (multi_reference/edit/extend/multi_frame) — billable = input + output seconds. */
  reduced: RateResolutionTable;
}

/** Seed values from the Enhancor pricing page + credit top-up screen (2026-09-08). */
export const SEEDANCE_25_RATES_DEFAULT: Seedance25RateTable = {
  standard: {
    "480p": { standard: 122.2, uncensored: 123.422 },
    "720p": { standard: 269.3, uncensored: 271.993 },
    "1080p": { standard: 487.3, uncensored: 492.173 },
  },
  reduced: {
    "480p": { standard: 72.9, uncensored: 73.629 },
    "720p": { standard: 165.5, uncensored: 167.155 },
    "1080p": { standard: 292.8, uncensored: 295.728 },
  },
};

/**
 * Seedance 2.0 legacy USD/sec (engine 2.0 only). MUST stay equal to
 * `API_COSTS.seedance.videoGeneration{480,720,1080}pPerSecond` in
 * lib/costs/estimates.ts — do not change these numbers (D4).
 */
export const SEEDANCE_20_USD_PER_SECOND: Record<Seedance25Resolution, number> = {
  "480p": 0.1,
  "720p": 0.205,
  "1080p": 0.41,
};

// ── Estimator ────────────────────────────────────────────────

export interface EstimateCreditsInput {
  engine: SeedanceEngine;
  /** App/Enhancor mode name ("ugc", "edit", …). Only matters for the reduced-rate rule. */
  mode: string;
  resolution: Seedance25Resolution;
  /** Output length. -1 = Auto → assumed AUTO_DURATION_ESTIMATE_SECONDS. */
  durationSeconds: number;
  /** True when videos[] will be sent (reduced rate for eligible modes). */
  hasVideoInputs?: boolean;
  /** Combined length of the input videos, if known (adds to billable seconds on the reduced rate). */
  inputVideoSeconds?: number;
  isUncensored?: boolean;
  /** multi_frame: per-segment durations; their sum overrides durationSeconds when present. */
  multiFrameDurations?: number[];
  /** Live table from video_settings; defaults to the seed constants. */
  rates?: Seedance25RateTable;
  /** Live USD-per-credit from video_settings; defaults to 0.001. */
  usdPerCredit?: number;
}

export interface CreditEstimate {
  engine: SeedanceEngine;
  /** Credits, rounded to 3 dp (matches NUMERIC(12,3)). For 2.0: usd / usdPerCredit, informational. */
  credits: number;
  /** USD rounded to cents. */
  usd: number;
  /** Unrounded USD for callers that sum many estimates. */
  usdExact: number;
  usdPerCredit: number;
  creditsPerSecond: number;
  /** Seconds actually billed (output, plus input video seconds on the reduced rate). */
  billableSeconds: number;
  outputSeconds: number;
  inputVideoSeconds: number;
  rateKind: "standard" | "reduced";
  isUncensored: boolean;
  /** True when durationSeconds was -1 and we assumed AUTO_DURATION_ESTIMATE_SECONDS. */
  assumedAutoDuration: boolean;
  /** Short human note for the UI ("Auto duration — estimated on 10 s"). */
  note: string;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function creditsToUsd(credits: number, usdPerCredit: number = USD_PER_CREDIT_DEFAULT): number {
  return credits * usdPerCredit;
}

export function usdToCredits(usd: number, usdPerCredit: number = USD_PER_CREDIT_DEFAULT): number {
  if (usdPerCredit <= 0) return 0;
  return usd / usdPerCredit;
}

export function roundUsd(usd: number): number {
  return round(usd, 2);
}

export function roundCredits(credits: number): number {
  return round(credits, 3);
}

/** "8,079" / "1,615.8" */
export function formatCredits(credits: number): string {
  return roundCredits(credits).toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/** "$8.08" */
export function formatUsd(usd: number): string {
  return `$${roundUsd(usd).toFixed(2)}`;
}

/** Reduced rate applies only to these modes AND only when videos[] are sent. */
export function isReducedRateEligible(mode: string, hasVideoInputs: boolean | undefined): boolean {
  return !!hasVideoInputs && (SEEDANCE_25_REDUCED_RATE_MODES as readonly string[]).includes(mode);
}

/** Resolve the effective output seconds (handles Auto + multi_frame sums). */
export function resolveOutputSeconds(
  durationSeconds: number,
  multiFrameDurations?: number[]
): { seconds: number; assumedAuto: boolean } {
  if (multiFrameDurations && multiFrameDurations.length > 0) {
    const sum = multiFrameDurations.reduce((s, d) => s + (Number.isFinite(d) ? d : 0), 0);
    if (sum > 0) return { seconds: sum, assumedAuto: false };
  }
  if (durationSeconds === AUTO_DURATION || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { seconds: AUTO_DURATION_ESTIMATE_SECONDS, assumedAuto: true };
  }
  return { seconds: durationSeconds, assumedAuto: false };
}

/**
 * Estimate credits + USD BEFORE generating (D4). Deterministic and pure.
 *
 *  - engine "2.5": credits/sec from the (live or seed) rate table, × billable seconds.
 *  - engine "2.0": USD/sec from the legacy constants; credits = usd / usdPerCredit
 *    (informational only — Enhancor does not report credits for 2.0 jobs).
 */
export function estimateCredits(input: EstimateCreditsInput): CreditEstimate {
  const usdPerCredit =
    input.usdPerCredit && input.usdPerCredit > 0 ? input.usdPerCredit : USD_PER_CREDIT_DEFAULT;
  const isUncensored = !!input.isUncensored;
  const { seconds: outputSeconds, assumedAuto } = resolveOutputSeconds(
    input.durationSeconds,
    input.multiFrameDurations
  );

  if (input.engine === "2.0") {
    const usdPerSecond = SEEDANCE_20_USD_PER_SECOND[input.resolution] ?? SEEDANCE_20_USD_PER_SECOND["720p"];
    const usdExact = usdPerSecond * outputSeconds;
    const credits = roundCredits(usdToCredits(usdExact, usdPerCredit));
    return {
      engine: "2.0",
      credits,
      usd: roundUsd(usdExact),
      usdExact,
      usdPerCredit,
      creditsPerSecond: roundCredits(usdToCredits(usdPerSecond, usdPerCredit)),
      billableSeconds: outputSeconds,
      outputSeconds,
      inputVideoSeconds: 0,
      rateKind: "standard",
      isUncensored: false,
      assumedAutoDuration: assumedAuto,
      note: `Seedance 2.0 legacy rate ≈ $${usdPerSecond.toFixed(3)}/s (estimate; 2.0 does not report credits)`,
    };
  }

  const rates = input.rates ?? SEEDANCE_25_RATES_DEFAULT;
  const reduced = isReducedRateEligible(input.mode, input.hasVideoInputs);
  const table = reduced ? rates.reduced : rates.standard;
  const row = table[input.resolution] ?? SEEDANCE_25_RATES_DEFAULT.standard[input.resolution];
  const creditsPerSecond = isUncensored ? row.uncensored : row.standard;
  const inputVideoSeconds =
    reduced && input.inputVideoSeconds && input.inputVideoSeconds > 0
      ? input.inputVideoSeconds
      : 0;
  const billableSeconds = outputSeconds + inputVideoSeconds;
  const credits = roundCredits(creditsPerSecond * billableSeconds);
  const usdExact = creditsToUsd(credits, usdPerCredit);

  const noteParts: string[] = [];
  noteParts.push(
    `${reduced ? "Reduced" : "Standard"} rate ${creditsPerSecond} credits/s${isUncensored ? " (uncensored)" : ""}`
  );
  if (assumedAuto) noteParts.push(`Auto duration — estimated on ${AUTO_DURATION_ESTIMATE_SECONDS} s`);
  if (reduced && inputVideoSeconds === 0) {
    noteParts.push("input video length unknown — add ≈ input seconds × rate");
  } else if (reduced) {
    noteParts.push(`${inputVideoSeconds} s input + ${outputSeconds} s output billed`);
  }

  return {
    engine: "2.5",
    credits,
    usd: roundUsd(usdExact),
    usdExact,
    usdPerCredit,
    creditsPerSecond,
    billableSeconds,
    outputSeconds,
    inputVideoSeconds,
    rateKind: reduced ? "reduced" : "standard",
    isUncensored,
    assumedAutoDuration: assumedAuto,
    note: noteParts.join(" · "),
  };
}

/**
 * Validate an arbitrary object as a rate table (used when reading
 * video_settings.rates from JSONB). Returns null when the shape is wrong so
 * callers fall back to the seed table.
 */
export function coerceRateTable(value: unknown): Seedance25RateTable | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const kinds = ["standard", "reduced"] as const;
  const resolutions: Seedance25Resolution[] = ["480p", "720p", "1080p"];
  const out: Partial<Record<(typeof kinds)[number], Partial<RateResolutionTable>>> = {};
  for (const kind of kinds) {
    const table = v[kind];
    if (!table || typeof table !== "object") return null;
    const t = table as Record<string, unknown>;
    const rows: Partial<RateResolutionTable> = {};
    for (const res of resolutions) {
      const cell = t[res];
      if (!cell || typeof cell !== "object") return null;
      const c = cell as Record<string, unknown>;
      const standard = Number(c.standard);
      const uncensored = Number(c.uncensored);
      if (!Number.isFinite(standard) || standard <= 0) return null;
      if (!Number.isFinite(uncensored) || uncensored <= 0) return null;
      rows[res] = { standard, uncensored };
    }
    out[kind] = rows;
  }
  return out as Seedance25RateTable;
}
