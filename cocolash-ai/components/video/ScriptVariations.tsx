"use client";

import { cn } from "@/lib/utils";
import { Check, Clock, Sparkles } from "lucide-react";
import type { ScriptResult } from "@/lib/types";

interface ScriptVariationsProps {
  scripts: ScriptResult[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function ScriptVariations({
  scripts,
  selectedIndex,
  onSelect,
}: ScriptVariationsProps) {
  if (scripts.length === 0) return null;

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-coco-brown">
        Choose a Script
      </label>
      <div className="space-y-3">
        {scripts.map((script, i) => {
          const isSelected = selectedIndex === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "w-full rounded-xl border-2 p-4 text-left transition-all duration-200",
                isSelected
                  ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                  : "border-coco-beige-dark bg-white hover:border-coco-golden/40 hover:bg-coco-golden/5"
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                      isSelected
                        ? "bg-coco-golden text-white"
                        : "bg-coco-beige text-coco-brown-medium"
                    )}
                  >
                    {isSelected ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="text-sm font-medium text-coco-brown">
                    Variation {i + 1}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-[11px] text-coco-brown-medium/60">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    ~{script.estimated_duration}s
                  </span>
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    {Math.round(script.style_match * 100)}%
                  </span>
                </span>
              </div>

              <p className="text-xs font-semibold text-coco-golden">
                {script.hook}
              </p>
              <p className="mt-1 line-clamp-3 text-xs text-coco-brown-medium/80">
                {script.body}
              </p>
              <p className="mt-1 text-xs font-medium text-coco-brown-medium">
                {script.cta}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
