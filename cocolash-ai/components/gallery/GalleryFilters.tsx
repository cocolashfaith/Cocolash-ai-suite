"use client";

import { Eye, Camera, Package, Images } from "lucide-react";
import type { ContentCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GalleryFiltersProps {
  category: ContentCategory | "all";
  onCategoryChange: (category: ContentCategory | "all") => void;
  favoritesOnly: boolean;
  onFavoritesChange: (value: boolean) => void;
}

const FILTER_OPTIONS: {
  value: ContentCategory | "all";
  label: string;
  icon: React.ElementType;
}[] = [
  { value: "all", label: "All", icon: Images },
  { value: "lash-closeup", label: "Close-Up", icon: Eye },
  { value: "lifestyle", label: "Lifestyle", icon: Camera },
  { value: "product", label: "Product", icon: Package },
];

export function GalleryFilters({
  category,
  onCategoryChange,
  favoritesOnly,
  onFavoritesChange,
}: GalleryFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Category filter pills */}
      <div className="flex gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = category === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onCategoryChange(opt.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-all duration-200",
                isActive
                  ? "border-coco-golden bg-coco-golden/10 text-coco-brown"
                  : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Favorites toggle */}
      <button
        onClick={() => onFavoritesChange(!favoritesOnly)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-medium transition-all duration-200",
          favoritesOnly
            ? "border-coco-golden bg-coco-golden/10 text-coco-brown"
            : "border-coco-beige-dark bg-white text-coco-brown-medium hover:border-coco-golden/40"
        )}
      >
        <span className={favoritesOnly ? "" : "grayscale"}>&#9829;</span>
        Favorites
      </button>
    </div>
  );
}
