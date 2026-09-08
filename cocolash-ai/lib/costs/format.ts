/**
 * Cost display strings (D4) — the ONE place that turns a `V4CostBreakdown`
 * into the text the wizard renders, so the headline chip, Step 3 and the
 * gallery all say the same thing.
 *
 * Seedance 2.5 is billed in Enhancor credits (1 credit = `usd_per_credit`,
 * default $0.001) → show BOTH credits and ≈ USD. Seedance 2.0 has no credit
 * concept → USD only, exactly as before.
 *
 * Pure + client-safe.
 */

import {
  AUTO_DURATION_ESTIMATE_SECONDS,
  USD_PER_CREDIT_DEFAULT,
  creditsToUsd,
  formatCredits,
  formatUsd,
} from "@/lib/seedance/pricing";
import type { V4CostBreakdown } from "@/lib/costs/estimates";

/** Shown whenever the estimate had to assume a length because duration was Auto (-1). */
export const AUTO_DURATION_NOTE = `Auto duration — estimated on ${AUTO_DURATION_ESTIMATE_SECONDS} s`;

export interface CostBreakdownDisplay {
  /** Always present, e.g. "≈ $8.10" — the full run total. */
  headline: string;
  /** Engine 2.5 only, e.g. "8,079 credits · ≈ $8.08 video". */
  creditsLine?: string;
  /** Present only when the duration was Auto. */
  note?: string;
}

/** "8,079 credits · ≈ $8.08" */
export function formatCreditsAndUsd(
  credits: number,
  usdPerCredit: number = USD_PER_CREDIT_DEFAULT
): string {
  const rate = usdPerCredit > 0 ? usdPerCredit : USD_PER_CREDIT_DEFAULT;
  return `${formatCredits(credits)} credits · ≈ ${formatUsd(creditsToUsd(credits, rate))}`;
}

/** "≈ $8.10" */
export function formatApproxUsd(usd: number): string {
  return `≈ ${formatUsd(usd)}`;
}

/**
 * Describe a breakdown for the UI. Engine 2.0 (and legacy breakdowns with no
 * `engine`) get the USD headline only — their widgets look identical to before.
 */
export function describeCostBreakdown(breakdown: V4CostBreakdown): CostBreakdownDisplay {
  const headline = formatApproxUsd(breakdown.total);

  if (breakdown.engine !== "2.5" || breakdown.credits == null) {
    return { headline };
  }

  const usdPerCredit =
    breakdown.usdPerCredit && breakdown.usdPerCredit > 0
      ? breakdown.usdPerCredit
      : USD_PER_CREDIT_DEFAULT;

  return {
    headline,
    creditsLine: `${formatCreditsAndUsd(breakdown.credits, usdPerCredit)} video`,
    ...(breakdown.assumedAutoDuration ? { note: AUTO_DURATION_NOTE } : {}),
  };
}
