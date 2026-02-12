"use client";

import { useState, useEffect } from "react";
import {
  Circle,
  CircleDot,
  BookOpen,
  ShoppingBag,
  Box,
  Briefcase,
  Layers,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductCategoryKey } from "@/lib/types";

interface ProductSubCategorySelectorProps {
  value: ProductCategoryKey | undefined;
  onChange: (value: ProductCategoryKey) => void;
}

/** Icon map for each product sub-category */
const ICON_MAP: Record<ProductCategoryKey, React.ElementType> = {
  "single-black-tray": Circle,
  "single-nude-tray": CircleDot,
  "multi-lash-book": BookOpen,
  "full-kit-pouch": ShoppingBag,
  "full-kit-box": Box,
  "storage-pouch": Briefcase,
  "branding-flatlay": Layers,
};

interface CategoryData {
  id: string;
  key: ProductCategoryKey;
  label: string;
  description: string | null;
  imageCount: number;
}

export function ProductSubCategorySelector({
  value,
  onChange,
}: ProductSubCategorySelectorProps) {
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch("/api/product-categories");
        const data = await res.json();
        if (data.categories) {
          setCategories(data.categories);
        }
      } catch (err) {
        console.error("Failed to fetch product categories:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCategories();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Product Type
        </label>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
          <span className="ml-2 text-sm text-coco-brown-medium">
            Loading product types...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Product Type
      </label>
      <p className="text-xs text-coco-brown-medium/70">
        Select which product style to generate. Only categories with uploaded
        reference images will produce accurate results.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {categories.map((cat) => {
          const Icon = ICON_MAP[cat.key] || Box;
          const isActive = value === cat.key;
          const hasImages = cat.imageCount > 0;

          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => onChange(cat.key)}
              className={cn(
                "relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all duration-200",
                isActive
                  ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                  : hasImages
                    ? "border-coco-beige-dark bg-white hover:border-coco-golden/40 hover:bg-coco-golden/5"
                    : "border-dashed border-coco-beige-dark/60 bg-white/50 opacity-60 hover:opacity-80"
              )}
            >
              {/* Image count badge */}
              {hasImages && (
                <span
                  className={cn(
                    "absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                    isActive
                      ? "bg-coco-golden text-white"
                      : "bg-coco-beige-dark text-coco-brown"
                  )}
                >
                  {cat.imageCount}
                </span>
              )}

              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  isActive
                    ? "bg-coco-golden text-white"
                    : "bg-coco-beige text-coco-brown-medium"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <p
                className={cn(
                  "text-center text-xs font-medium leading-tight",
                  isActive ? "text-coco-brown" : "text-coco-brown-medium"
                )}
              >
                {cat.label}
              </p>
              {!hasImages && (
                <span className="text-[9px] text-amber-600">No images yet</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
