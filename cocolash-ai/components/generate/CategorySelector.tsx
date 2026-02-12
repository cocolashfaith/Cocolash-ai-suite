"use client";

import { Eye, Camera, Package } from "lucide-react";
import type { ContentCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CategorySelectorProps {
  value: ContentCategory;
  onChange: (value: ContentCategory) => void;
}

const CATEGORIES: {
  value: ContentCategory;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    value: "lash-closeup",
    label: "Lash Close-Up",
    description: "Macro eye & lash detail",
    icon: Eye,
  },
  {
    value: "lifestyle",
    label: "Lifestyle",
    description: "Editorial portraits & scenes",
    icon: Camera,
  },
  {
    value: "product",
    label: "Product",
    description: "Premium product staging",
    icon: Package,
  },
];

export function CategorySelector({ value, onChange }: CategorySelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Content Category
      </label>
      <div className="grid grid-cols-3 gap-3">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = value === cat.value;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => onChange(cat.value)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200",
                isActive
                  ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                  : "border-coco-beige-dark bg-white hover:border-coco-golden/40 hover:bg-coco-golden/5"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                  isActive
                    ? "bg-coco-golden text-white"
                    : "bg-coco-beige text-coco-brown-medium"
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isActive ? "text-coco-brown" : "text-coco-brown-medium"
                  )}
                >
                  {cat.label}
                </p>
                <p className="mt-0.5 text-[11px] text-coco-brown-medium/70">
                  {cat.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
