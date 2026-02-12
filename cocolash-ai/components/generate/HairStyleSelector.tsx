"use client";

import type { HairStyle } from "@/lib/types";
import { HAIR_STYLE_OPTIONS } from "@/lib/prompts/modules/hair-styles";
import { cn } from "@/lib/utils";
import { Shuffle } from "lucide-react";

interface HairStyleSelectorProps {
  value: HairStyle;
  onChange: (value: HairStyle) => void;
}

const GROUP_LABELS: Record<string, string> = {
  random: "",
  natural: "Natural",
  protective: "Protective",
  styled: "Styled",
};

export function HairStyleSelector({ value, onChange }: HairStyleSelectorProps) {
  // Group the options
  const groups = ["random", "natural", "protective", "styled"] as const;

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Hair Style
      </label>
      <div className="space-y-3">
        {groups.map((group) => {
          const options = HAIR_STYLE_OPTIONS.filter(
            (opt) => opt.group === group
          );
          if (options.length === 0) return null;

          return (
            <div key={group}>
              {group !== "random" && (
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-coco-brown-medium/60">
                  {GROUP_LABELS[group]}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                  const isActive = value === opt.value;
                  const isRandom = opt.value === "random";
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChange(opt.value)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all duration-200",
                        isActive
                          ? "border-coco-golden bg-coco-golden/10 text-coco-brown shadow-sm"
                          : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
                      )}
                    >
                      {isRandom && (
                        <Shuffle className="h-3 w-3" />
                      )}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
