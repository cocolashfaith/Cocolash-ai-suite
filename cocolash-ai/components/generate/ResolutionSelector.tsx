"use client";

import type { ImageResolution } from "@/lib/types";
import { IMAGE_RESOLUTION_OPTIONS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MonitorSmartphone, Monitor, MonitorUp } from "lucide-react";

const RESOLUTION_ICONS: Record<ImageResolution, typeof Monitor> = {
  "1K": MonitorSmartphone,
  "2K": Monitor,
  "4K": MonitorUp,
};

interface ResolutionSelectorProps {
  value: ImageResolution;
  onChange: (value: ImageResolution) => void;
}

export function ResolutionSelector({
  value,
  onChange,
}: ResolutionSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Output Resolution
      </label>
      <div className="grid grid-cols-3 gap-2">
        {IMAGE_RESOLUTION_OPTIONS.map((opt) => {
          const isActive = value === opt.value;
          const Icon = RESOLUTION_ICONS[opt.value];

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
              <Icon
                className={cn(
                  "h-5 w-5",
                  isActive ? "text-coco-golden" : "text-coco-brown-medium/50"
                )}
              />
              <p
                className={cn(
                  "text-xs font-semibold",
                  isActive ? "text-coco-brown" : "text-coco-brown-medium"
                )}
              >
                {opt.label}
              </p>
              <p className="text-[10px] text-coco-brown-medium/70 leading-tight text-center">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>
      {value !== "1K" && (
        <p className="text-[10px] text-coco-brown-medium/50">
          {value === "2K"
            ? "Higher resolution may take slightly longer to generate."
            : "4K resolution takes longer and uses more storage."}
        </p>
      )}
    </div>
  );
}
