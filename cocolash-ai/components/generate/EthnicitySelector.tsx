"use client";

import type { Ethnicity } from "@/lib/types";
import { ETHNICITY_OPTIONS } from "@/lib/prompts/modules/ethnicity";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EthnicitySelectorProps {
  value: Ethnicity;
  onChange: (value: Ethnicity) => void;
}

export function EthnicitySelector({
  value,
  onChange,
}: EthnicitySelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Ethnicity
      </label>
      <div className="flex flex-wrap gap-2">
        {ETHNICITY_OPTIONS.map((opt) => {
          const isActive = value === opt.value;
          return (
            <Tooltip key={opt.value}>
              <TooltipTrigger asChild>
                <button
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
              </TooltipTrigger>
              <TooltipContent>
                <p>{opt.desc}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
