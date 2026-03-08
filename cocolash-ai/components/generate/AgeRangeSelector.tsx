"use client";

import type { SoloDuoAgeRange } from "@/lib/types";
import { SOLO_DUO_AGE_OPTIONS } from "@/lib/prompts/modules/age-range";
import { cn } from "@/lib/utils";

interface AgeRangeSelectorProps {
  value: SoloDuoAgeRange;
  onChange: (value: SoloDuoAgeRange) => void;
}

export function AgeRangeSelector({
  value,
  onChange,
}: AgeRangeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Age Range
      </label>
      <div className="flex flex-wrap gap-2">
        {SOLO_DUO_AGE_OPTIONS.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all duration-200",
                isActive
                  ? "border-coco-golden bg-coco-golden/10 text-coco-brown shadow-sm"
                  : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
