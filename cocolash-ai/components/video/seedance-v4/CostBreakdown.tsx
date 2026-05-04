"use client";

import { cn } from "@/lib/utils";
import { Coins } from "lucide-react";
import type { V4CostBreakdown } from "@/lib/costs/estimates";

interface CostBreakdownProps {
  breakdown: V4CostBreakdown;
  /** "headline" mode — shown at the top of a pipeline before any choices.
   *  Compact single-line summary. */
  variant?: "headline" | "detailed";
  className?: string;
  /** When true, label this as an estimate (the real cost can vary slightly). */
  showEstimateBadge?: boolean;
}

/**
 * Used both at the top of the Seedance v4 wizard (variant="headline" — small
 * total-only chip) AND on Step 3 (variant="detailed" — itemized lines so the
 * user sees exactly where every dollar goes before approving).
 *
 * Faith's intent: pricing is transparent and the user knows what they're
 * paying for at every step.
 */
export function CostBreakdown({
  breakdown,
  variant = "detailed",
  className,
  showEstimateBadge = true,
}: CostBreakdownProps) {
  if (variant === "headline") {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 px-4 py-2",
          className
        )}
      >
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-coco-golden" />
          <span className="text-xs font-semibold text-coco-brown">
            Estimated cost
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-coco-brown">
            ~${breakdown.total.toFixed(2)}
          </span>
          {showEstimateBadge && (
            <span className="text-[10px] text-coco-brown-medium/60">
              estimate
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "space-y-3 rounded-xl border-2 border-coco-beige-dark bg-white/60 p-4",
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-coco-brown">
          <Coins className="h-4 w-4 text-coco-golden" />
          Cost breakdown
        </h3>
        <span className="text-[10px] uppercase tracking-wide text-coco-brown-medium/50">
          Estimate
        </span>
      </div>

      <ul className="divide-y divide-coco-beige">
        {breakdown.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-coco-brown">
                {item.label}
                {item.count && item.count > 1 && (
                  <span className="ml-1 text-coco-brown-medium/60">
                    × {item.count}
                  </span>
                )}
              </p>
              {item.hint && (
                <p className="mt-0.5 text-[10px] text-coco-brown-medium/60">
                  {item.hint}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-mono text-coco-brown">
                ${(item.cost * (item.count ?? 1)).toFixed(3)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between border-t-2 border-coco-beige-dark pt-2">
        <span className="text-sm font-semibold text-coco-brown">Estimated total</span>
        <span className="text-base font-bold text-coco-brown">
          ${breakdown.total.toFixed(2)}
        </span>
      </div>
    </section>
  );
}
