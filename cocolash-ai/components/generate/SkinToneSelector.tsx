"use client";

import type { SkinTone } from "@/lib/types";
import { SKIN_TONE_OPTIONS } from "@/lib/prompts/modules/skin-tones";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SkinToneSelectorProps {
  value: SkinTone;
  onChange: (value: SkinTone) => void;
}

export function SkinToneSelector({ value, onChange }: SkinToneSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Skin Tone
      </label>
      <div className="flex flex-wrap gap-2">
        {SKIN_TONE_OPTIONS.map((opt) => {
          const isActive = value === opt.value;
          return (
            <Tooltip key={opt.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onChange(opt.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 px-3 py-2 transition-all duration-200",
                    isActive
                      ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                      : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                  )}
                >
                  <div
                    className="h-5 w-5 rounded-full border border-black/10 shrink-0"
                    style={{ background: opt.swatchColor }}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isActive ? "text-coco-brown" : "text-coco-brown-medium"
                    )}
                  >
                    {opt.label}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{opt.label} skin tone</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
