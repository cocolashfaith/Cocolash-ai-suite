"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Circle,
  CircleDot,
  BookOpen,
  ShoppingBag,
  Box,
  Briefcase,
  Layers,
  Upload,
  Plus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductCategoryKey } from "@/lib/types";

interface ProductSubCategorySelectorProps {
  value: ProductCategoryKey | undefined;
  onChange: (value: ProductCategoryKey) => void;
}

/** Stable key + label for the user-uploaded category. Mirrors the values used
 *  by POST /api/products/upload, which creates this category on first upload. */
const CUSTOM_KEY = "custom-uploads";
const CUSTOM_LABEL = "Custom Uploads";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB, matches the upload route

/** Icon map for each product sub-category. Custom uploads gets the Upload icon. */
const ICON_MAP: Record<string, React.ElementType> = {
  "single-black-tray": Circle,
  "single-nude-tray": CircleDot,
  "multi-lash-book": BookOpen,
  "full-kit-pouch": ShoppingBag,
  "full-kit-box": Box,
  "storage-pouch": Briefcase,
  "branding-flatlay": Layers,
  [CUSTOM_KEY]: Upload,
};

interface CategoryData {
  id: string;
  key: string;
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/product-categories");
      const data = await res.json();
      if (data.categories) {
        setCategories(
          (data.categories as Array<Record<string, unknown>>).map((c) => ({
            id: String(c.id),
            key: String(c.key),
            label: String(c.label ?? c.name ?? c.key),
            description: (c.description as string | null) ?? null,
            imageCount: Number(c.imageCount ?? 0),
          }))
        );
      }
    } catch (err) {
      console.error("Failed to fetch product categories:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  // Upload one or more images into the Custom Uploads category. Each file goes
  // through POST /api/products/upload (which creates the category on the first
  // upload), then we refresh the counts and select Custom Uploads.
  const handleCustomUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(e.target.files ?? []);
      if (fileRef.current) fileRef.current.value = ""; // allow re-picking same file
      if (picked.length === 0) return;

      const valid: File[] = [];
      for (const file of picked) {
        if (!file.type.startsWith("image/")) {
          toast.error(`"${file.name}" is not an image — skipped.`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`"${file.name}" is over 10 MB — skipped.`);
          continue;
        }
        valid.push(file);
      }
      if (valid.length === 0) return;

      setUploading(true);
      let succeeded = 0;
      try {
        // Sequential: the first upload creates the "Custom Uploads" category, so
        // later uploads reuse it (avoids a concurrent category-create race).
        for (const file of valid) {
          try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/products/upload", {
              method: "POST",
              body: fd,
            });
            const data = await res.json();
            if (!res.ok || data.success === false) {
              throw new Error(data.error || "Upload failed");
            }
            succeeded += 1;
            if (data.warning) toast.warning(data.warning);
          } catch (err) {
            toast.error(
              `${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`
            );
          }
        }
      } finally {
        setUploading(false);
      }

      if (succeeded > 0) {
        toast.success(
          `${succeeded} image${succeeded === 1 ? "" : "s"} uploaded to Custom Uploads.`
        );
        await fetchCategories();
        onChange(CUSTOM_KEY as ProductCategoryKey);
      }
    },
    [fetchCategories, onChange]
  );

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

  // Always show a Custom Uploads card, even before the category exists in the DB
  // (the first upload creates it). If the API already returned it, that row wins.
  const hasCustom = categories.some((c) => c.key === CUSTOM_KEY);
  const displayCategories: CategoryData[] = hasCustom
    ? categories
    : [
        ...categories,
        {
          id: "custom-pending",
          key: CUSTOM_KEY,
          label: CUSTOM_LABEL,
          description: null,
          imageCount: 0,
        },
      ];

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-coco-brown">
        Product Type
      </label>
      <p className="text-xs text-coco-brown-medium/70">
        Select which product style to generate. Only categories with uploaded
        reference images will produce accurate results.
      </p>

      {/* Hidden multi-file input driving the Custom Uploads card. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleCustomUpload}
        className="hidden"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {displayCategories.map((cat) => {
          const Icon = ICON_MAP[cat.key] || Box;
          const isActive = value === cat.key;
          const hasImages = cat.imageCount > 0;
          const isCustom = cat.key === CUSTOM_KEY;

          const selectOrUpload = () => {
            // The Custom Uploads card opens the file picker when it's empty
            // (nothing to select yet); otherwise it selects like any other.
            if (isCustom && !hasImages) {
              if (!uploading) fileRef.current?.click();
              return;
            }
            onChange(cat.key as ProductCategoryKey);
          };

          return (
            <div
              key={cat.key}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onClick={selectOrUpload}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectOrUpload();
                }
              }}
              className={cn(
                "relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all duration-200",
                isActive
                  ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                  : hasImages || isCustom
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
                {isCustom && uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <p
                className={cn(
                  "text-center text-xs font-medium leading-tight",
                  isActive ? "text-coco-brown" : "text-coco-brown-medium"
                )}
              >
                {cat.label}
              </p>

              {isCustom ? (
                // Always-available multi-image upload control. stopPropagation so
                // it never doubles as a select of the card.
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!uploading) fileRef.current?.click();
                  }}
                  disabled={uploading}
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                    "bg-coco-golden/15 text-coco-golden hover:bg-coco-golden/25",
                    uploading && "opacity-60"
                  )}
                >
                  <Plus className="h-3 w-3" />
                  {uploading ? "Uploading…" : "Add images"}
                </button>
              ) : (
                !hasImages && (
                  <span className="text-[9px] text-amber-600">No images yet</span>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
