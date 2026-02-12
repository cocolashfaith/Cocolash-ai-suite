"use client";

import type { Scene, ContentCategory } from "@/lib/types";
import { SCENES_BY_CATEGORY, SCENE_OPTIONS } from "@/lib/prompts/modules/scenes";
import { cn } from "@/lib/utils";

interface SceneSelectorProps {
  value: Scene;
  onChange: (value: Scene) => void;
  category: ContentCategory;
}

export function SceneSelector({ value, onChange, category }: SceneSelectorProps) {
  // Product category doesn't show scene selector (handled internally)
  if (category === "product") return null;

  // Lash close-ups auto-select "studio" and show limited options
  const availableScenes = SCENES_BY_CATEGORY[category];
  const filteredOptions = SCENE_OPTIONS.filter((opt) =>
    availableScenes.includes(opt.value)
  );

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Scene / Environment
      </label>
      <div className="flex flex-wrap gap-2">
        {filteredOptions.map((opt) => {
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
