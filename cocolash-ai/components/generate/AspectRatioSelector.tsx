"use client";

import type { AspectRatio } from "@/lib/types";
import { ASPECT_RATIO_OPTIONS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AspectRatioSelectorProps {
  value: AspectRatio;
  onChange: (value: AspectRatio) => void;
}

export function AspectRatioSelector({
  value,
  onChange,
}: AspectRatioSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Aspect Ratio
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ASPECT_RATIO_OPTIONS.map((opt) => {
          const isActive = value === opt.value;
          // Visual ratio preview dimensions
          const previewW = opt.width > opt.height ? 28 : Math.round(28 * (opt.width / opt.height));
          const previewH = opt.height > opt.width ? 28 : Math.round(28 * (opt.height / opt.width));

          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all duration-200",
                isActive
                  ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                  : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
              )}
            >
              {/* Visual ratio preview */}
              <div className="flex h-8 items-center justify-center">
                <div
                  className={cn(
                    "rounded-sm border",
                    isActive
                      ? "border-coco-golden bg-coco-golden/20"
                      : "border-coco-brown-medium/30 bg-coco-beige"
                  )}
                  style={{ width: previewW, height: previewH }}
                />
              </div>
              <p
                className={cn(
                  "text-xs font-semibold",
                  isActive ? "text-coco-brown" : "text-coco-brown-medium"
                )}
              >
                {opt.value}
              </p>
              <p className="text-[10px] text-coco-brown-medium/70 leading-tight text-center">
                {opt.platform}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
