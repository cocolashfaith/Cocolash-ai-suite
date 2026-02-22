"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { SavedPrompt, GenerationSelections } from "@/lib/types";

interface SavedTemplatesRowProps {
  onSelect: (selections: GenerationSelections) => void;
  refreshKey?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  "lash-closeup": "Close-Up",
  lifestyle: "Lifestyle",
  product: "Product",
  "before-after": "B/A",
  "application-process": "Application",
};

export function SavedTemplatesRow({
  onSelect,
  refreshKey,
}: SavedTemplatesRowProps) {
  const [templates, setTemplates] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/templates");
      if (!response.ok) return;
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [refreshKey]);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      observer.disconnect();
    };
  }, [templates]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === "left" ? -220 : 220,
      behavior: "smooth",
    });
  };

  const handleUse = async (template: SavedPrompt) => {
    onSelect(template.selections as GenerationSelections);
    toast.success(`Loaded "${template.name}"`);

    // Increment use_count in background
    try {
      await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: template.id }),
      });
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === template.id ? { ...t, use_count: t.use_count + 1 } : t
        )
      );
    } catch {
      // non-critical
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/templates?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    }
  };

  if (loading || templates.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <Zap className="h-4 w-4 text-coco-golden" />
        <h3 className="text-sm font-semibold text-coco-brown">
          Quick Generate
        </h3>
        <span className="rounded-full bg-coco-beige px-2 py-0.5 text-[10px] font-medium text-coco-brown-medium">
          {templates.length}
        </span>
      </div>

      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute -left-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-coco-beige-dark bg-white shadow-md transition-colors hover:bg-coco-beige"
          >
            <ChevronLeft className="h-4 w-4 text-coco-brown-medium" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUse={handleUse}
              onDelete={handleDelete}
            />
          ))}
        </div>

        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute -right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-coco-beige-dark bg-white shadow-md transition-colors hover:bg-coco-beige"
          >
            <ChevronRight className="h-4 w-4 text-coco-brown-medium" />
          </button>
        )}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onUse,
  onDelete,
}: {
  template: SavedPrompt;
  onUse: (t: SavedPrompt) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const sel = template.selections as GenerationSelections;
  const catLabel = CATEGORY_LABELS[template.category] || template.category;

  return (
    <button
      type="button"
      onClick={() => onUse(template)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group relative flex w-[180px] shrink-0 flex-col overflow-hidden rounded-xl border-2 bg-white text-left transition-all duration-200",
        hovered
          ? "border-coco-golden shadow-md"
          : "border-coco-beige-dark shadow-sm"
      )}
    >
      {/* Thumbnail or placeholder */}
      <div className="relative h-20 w-full bg-gradient-to-br from-coco-beige to-coco-pink-dark/10">
        {template.thumbnail_url ? (
          <Image
            src={template.thumbnail_url}
            alt={template.name}
            fill
            className="object-cover"
            sizes="180px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Bookmark className="h-6 w-6 text-coco-golden/30" />
          </div>
        )}

        {/* Category badge */}
        <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-coco-brown shadow-sm backdrop-blur-sm">
          {catLabel}
        </span>

        {/* Delete button */}
        <button
          type="button"
          onClick={(e) => onDelete(e, template.id)}
          className={cn(
            "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-coco-brown-medium/50 shadow-sm backdrop-blur-sm transition-all hover:bg-red-50 hover:text-red-500",
            hovered ? "opacity-100" : "opacity-0"
          )}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col px-2.5 py-2">
        <p className="truncate text-xs font-semibold text-coco-brown">
          {template.name}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="rounded bg-coco-beige px-1 py-0.5 text-[8px] font-medium text-coco-brown-medium">
            {sel.aspectRatio}
          </span>
          <span className="rounded bg-coco-beige px-1 py-0.5 text-[8px] font-medium text-coco-brown-medium">
            {sel.resolution}
          </span>
          {template.use_count > 0 && (
            <span className="rounded bg-coco-golden/10 px-1 py-0.5 text-[8px] font-medium text-coco-golden-dark">
              {template.use_count}x
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
