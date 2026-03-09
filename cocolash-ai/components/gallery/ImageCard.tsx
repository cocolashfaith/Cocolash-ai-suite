"use client";

import { useState } from "react";
import Image from "next/image";
import { Layers, Clock, Columns2, Info, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ImageLoader } from "@/components/ui/image-loader";
import { FavoriteButton } from "@/components/gallery/FavoriteButton";
import type { GeneratedImage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ImageCardProps {
  image: GeneratedImage;
  onClick: () => void;
  onFavoriteToggle: (id: string, newValue: boolean) => void;
  onDetailsClick?: () => void;
  onCaptionClick?: () => void;
}

export function ImageCard({ image, onClick, onFavoriteToggle, onDetailsClick, onCaptionClick }: ImageCardProps) {
  const [loaded, setLoaded] = useState(false);

  const categoryLabels: Record<string, string> = {
    "lash-closeup": "Close-Up",
    lifestyle: "Lifestyle",
    product: "Product",
    "before-after": "Before/After",
    "application-process": "Application",
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
        <div className={cn(
          "relative overflow-hidden bg-coco-charcoal/90",
          image.is_composite ? "aspect-[2/1]" : "aspect-[4/5]"
        )}>
          {/* Loading animation while image loads */}
          {!loaded && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center">
              <ImageLoader />
            </div>
          )}

          <Image
            src={image.image_url}
            alt={`Generated ${image.category} image`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={cn(
              "object-cover transition-all duration-300 group-hover:scale-105",
              loaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setLoaded(true)}
          />

          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </button>

      {/* Category badge */}
      <Badge className="absolute left-2 top-2 bg-coco-brown/80 text-[10px] text-white backdrop-blur-sm">
        {image.is_composite ? (
          <Columns2 className="mr-1 h-3 w-3" />
        ) : (
          <Layers className="mr-1 h-3 w-3" />
        )}
        {image.is_composite ? "Composite" : (categoryLabels[image.category] || image.category)}
      </Badge>

      {/* Top-right action buttons */}
      <div className="absolute right-2 top-2 flex items-center gap-1">
        {/* Details button */}
        {onDetailsClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDetailsClick();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-coco-brown-medium opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100 hover:bg-white hover:text-coco-brown"
            title="Details"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Caption & Publish button */}
        {onCaptionClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCaptionClick();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-coco-brown-medium opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100 hover:bg-white hover:text-coco-golden-dark"
            title="Create Captions & Publish"
          >
            <MessageSquareText className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Favorite button */}
        <div className={cn(
          image.is_favorite ? "" : "opacity-0 group-hover:opacity-100 transition-opacity"
        )}>
          <FavoriteButton
            imageId={image.id}
            isFavorite={image.is_favorite}
            onToggle={onFavoriteToggle}
            size="sm"
          />
        </div>
      </div>

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
