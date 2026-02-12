"use client";

import Image from "next/image";
import { Heart, Layers, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GeneratedImage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ImageCardProps {
  image: GeneratedImage;
  onClick: () => void;
  onFavoriteToggle: () => void;
}

export function ImageCard({ image, onClick, onFavoriteToggle }: ImageCardProps) {
  const categoryLabels: Record<string, string> = {
    "lash-closeup": "Close-Up",
    lifestyle: "Lifestyle",
    product: "Product",
  };

  const dateStr = new Date(image.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="group relative overflow-hidden rounded-xl border border-coco-beige-dark bg-white shadow-sm transition-all duration-200 hover:shadow-md">
      {/* Image */}
      <button
        type="button"
        onClick={onClick}
        className="block w-full cursor-pointer"
      >
        <div className="relative aspect-[4/5] overflow-hidden">
          <Image
            src={image.image_url}
            alt={`Generated ${image.category} image`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />

          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </button>

      {/* Category badge */}
      <Badge className="absolute left-2 top-2 bg-coco-brown/80 text-[10px] text-white backdrop-blur-sm">
        <Layers className="mr-1 h-3 w-3" />
        {categoryLabels[image.category] || image.category}
      </Badge>

      {/* Favorite button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFavoriteToggle();
        }}
        className={cn(
          "absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm transition-all",
          image.is_favorite
            ? "bg-red-500/90 text-white"
            : "bg-white/80 text-coco-brown-medium opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
        )}
      >
        <Heart
          className="h-3.5 w-3.5"
          fill={image.is_favorite ? "currentColor" : "none"}
        />
      </button>

      {/* Footer info */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] text-coco-brown-medium/60">
          {dateStr}
        </span>
        <div className="flex items-center gap-1 text-[11px] text-coco-brown-medium/60">
          <Clock className="h-3 w-3" />
          {image.generation_time_ms
            ? `${(image.generation_time_ms / 1000).toFixed(1)}s`
            : "—"}
        </div>
      </div>
    </div>
  );
}
