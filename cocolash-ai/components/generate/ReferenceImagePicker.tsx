"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReferenceImagePickerProps {
  /** product_categories.key whose images are being locked. */
  categoryKey: string;
  /**
   * Locked image IDs. `undefined` (untouched) means "use all images in the
   * category". Once the user ticks/unticks, an explicit list is emitted.
   */
  selectedIds: string[] | undefined;
  onChange: (ids: string[]) => void;
}

interface RefImage {
  id: string;
  image_url: string;
}

/**
 * Per-image reference lock for the generate flow. Shows every reference photo
 * in the chosen product category and lets the user tick exactly which ones to
 * ground the generation on — so a single product (e.g. the half-lash) can be
 * isolated inside a mixed category like Custom Uploads. Nothing ticked = all
 * images are used (the backend treats an empty/omitted set as "use all").
 */
export function ReferenceImagePicker({
  categoryKey,
  selectedIds,
  onChange,
}: ReferenceImagePickerProps) {
  const [images, setImages] = useState<RefImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/product-categories");
        const data = await res.json();
        if (cancelled) return;
        const cat = (data.categories as Array<Record<string, unknown>> | undefined)?.find(
          (c) => String(c.key) === categoryKey
        );
        const imgs = ((cat?.images as Array<Record<string, unknown>>) ?? []).map((i) => ({
          id: String(i.id),
          image_url: String(i.image_url),
        }));
        setImages(imgs);
      } catch {
        if (!cancelled) setImages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryKey]);

  const allIds = images.map((i) => i.id);
  // Untouched (undefined) selection shows everything ticked = "all in use".
  const effective = selectedIds ?? allIds;
  const isLocked = selectedIds !== undefined && selectedIds.length > 0;

  const toggle = useCallback(
    (id: string) => {
      const base = selectedIds ?? allIds;
      const next = base.includes(id)
        ? base.filter((x) => x !== id)
        : [...base, id];
      onChange(next);
    },
    [selectedIds, allIds, onChange]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-coco-beige-dark bg-white/50 p-4 text-xs text-coco-brown-medium/60">
        <Loader2 className="h-4 w-4 animate-spin text-coco-golden" />
        Loading reference images…
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-700">
        This category has no reference images yet — generation can&apos;t lock onto
        a product. Add images first (Custom Uploads or Settings).
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border-2 border-coco-beige-dark bg-white/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-semibold text-coco-brown">
          Lock the product reference
        </label>
        <span className="text-[11px] font-medium text-coco-golden">
          {isLocked
            ? `${effective.length} of ${images.length} locked`
            : `all ${images.length} in use`}
        </span>
      </div>
      <p className="text-[11px] text-coco-brown-medium/60">
        Tick only the photos of the exact product you want (e.g. the half-lash).
        Nothing ticked uses every image in this category.
      </p>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {images.map((img) => {
          const on = effective.includes(img.id);
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => toggle(img.id)}
              aria-pressed={on}
              className={cn(
                "relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                on
                  ? "border-coco-golden ring-2 ring-coco-golden/30"
                  : "border-transparent opacity-50 hover:opacity-80"
              )}
              title={on ? "Locked as reference" : "Tap to include"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.image_url}
                alt="Product reference"
                className="h-full w-full object-cover"
                loading="lazy"
              />
              {on && (
                <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-coco-golden">
                  <Check className="h-2.5 w-2.5 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 pt-0.5">
        <button
          type="button"
          onClick={() => onChange(allIds)}
          className="text-[11px] font-medium text-coco-brown-medium/70 underline-offset-2 hover:text-coco-golden hover:underline"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[11px] font-medium text-coco-brown-medium/70 underline-offset-2 hover:text-coco-golden hover:underline"
        >
          Reset (use all)
        </button>
      </div>
    </div>
  );
}
