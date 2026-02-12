"use client";

import type { Vibe, ContentCategory } from "@/lib/types";
import { VIBE_OPTIONS } from "@/lib/prompts/modules/vibes";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VibeSelectorProps {
  value: Vibe;
  onChange: (value: Vibe) => void;
  category: ContentCategory;
}

export function VibeSelector({ value, onChange, category }: VibeSelectorProps) {
  // Only relevant for lifestyle
  if (category !== "lifestyle") return null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Vibe / Mood
      </label>
      <div className="flex flex-wrap gap-2">
        {VIBE_OPTIONS.map((opt) => {
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
