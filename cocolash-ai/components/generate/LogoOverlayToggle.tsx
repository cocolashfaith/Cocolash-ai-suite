"use client";

import { Switch } from "@/components/ui/switch";
import type { LogoOverlaySettings, LogoPosition, LogoVariant } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LogoOverlayToggleProps {
  value: LogoOverlaySettings;
  onChange: (value: LogoOverlaySettings) => void;
}

const POSITIONS: { value: LogoPosition; label: string }[] = [
  { value: "top-left", label: "Top Left" },
  { value: "top-right", label: "Top Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right" },
  { value: "center", label: "Center" },
];

const VARIANTS: { value: LogoVariant; label: string }[] = [
  { value: "white", label: "Light Pink" },
  { value: "dark", label: "Dark" },
  { value: "gold", label: "Beige" },
];

export function LogoOverlayToggle({ value, onChange }: LogoOverlayToggleProps) {
  const update = (patch: Partial<LogoOverlaySettings>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-coco-brown">
          Logo Overlay
        </label>
        <Switch
          checked={value.enabled}
          onCheckedChange={(checked) => update({ enabled: checked })}
        />
      </div>

      {value.enabled && (
        <div className="space-y-3 rounded-xl border border-coco-beige-dark bg-white p-3">
          {/* Variant picker */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-coco-brown-medium/60">
              Logo Variant
            </p>
            <div className="flex gap-2">
              {VARIANTS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => update({ variant: v.value })}
                  className={cn(
                    "rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-all",
                    value.variant === v.value
                      ? "border-coco-golden bg-coco-golden/10 text-coco-brown"
                      : "border-coco-beige-dark text-coco-brown-medium hover:border-coco-golden/40"
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Position picker */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-coco-brown-medium/60">
              Position
            </p>
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => update({ position: p.value })}
                  className={cn(
                    "rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-all",
                    value.position === p.value
                      ? "border-coco-golden bg-coco-golden/10 text-coco-brown"
                      : "border-coco-beige-dark text-coco-brown-medium hover:border-coco-golden/40"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
