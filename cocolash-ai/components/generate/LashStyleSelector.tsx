"use client";

import type { LashStyle } from "@/lib/types";
import { LASH_STYLE_OPTIONS } from "@/lib/prompts/modules/lash-styles";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LashStyleSelectorProps {
  value: LashStyle;
  onChange: (value: LashStyle) => void;
}

export function LashStyleSelector({ value, onChange }: LashStyleSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Lash Style
      </label>
      <div className="flex flex-wrap gap-2">
        {LASH_STYLE_OPTIONS.map((opt) => {
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
                <p>{opt.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
