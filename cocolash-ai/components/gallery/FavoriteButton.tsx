"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  imageId: string;
  isFavorite: boolean;
  onToggle: (id: string, newValue: boolean) => void;
  size?: "sm" | "md" | "lg";
  variant?: "icon" | "button";
  className?: string;
}

/**
 * Animated favorite heart button with optimistic UI.
 * Pings the PATCH /api/images/[id]/favorite endpoint.
 */
export function FavoriteButton({
  imageId,
  isFavorite,
  onToggle,
  size = "md",
  variant = "icon",
  className,
}: FavoriteButtonProps) {
  const [animating, setAnimating] = useState(false);
  const [loading, setLoading] = useState(false);

  const sizeMap = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const containerMap = {
    sm: "h-7 w-7",
    md: "h-8 w-8",
    lg: "h-9 w-9",
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (loading) return;

    const newValue = !isFavorite;

    // Optimistic update
    onToggle(imageId, newValue);

    // Trigger animation
    if (newValue) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 600);
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/images/${imageId}/favorite`, {
        method: "PATCH",
      });

      if (!response.ok) {
        onToggle(imageId, !newValue);
      }
    } catch {
      onToggle(imageId, !newValue);
    } finally {
      setLoading(false);
    }
  };

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          "flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all duration-200 disabled:opacity-50",
          isFavorite
            ? "border-red-200 bg-red-50 text-red-500"
            : "border-coco-brown-medium/20 text-coco-brown-medium hover:border-red-200 hover:text-red-500",
          className
        )}
      >
        <Heart
          className={cn(
            sizeMap[size],
            "transition-transform",
            animating && "scale-125"
          )}
          fill={isFavorite ? "currentColor" : "none"}
        />
        {isFavorite ? "Favorited" : "Favorite"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        "relative flex items-center justify-center rounded-full backdrop-blur-sm transition-all disabled:opacity-50",
        containerMap[size],
        isFavorite
          ? "bg-red-500/90 text-white"
          : "bg-white/80 text-coco-brown-medium hover:bg-red-50 hover:text-red-500",
        className
      )}
    >
      <Heart
        className={cn(
          sizeMap[size],
          "transition-transform duration-300",
          animating && "scale-150"
        )}
        fill={isFavorite ? "currentColor" : "none"}
      />

      {/* Burst effect on favorite */}
      {animating && (
        <span className="absolute inset-0 animate-ping rounded-full bg-red-400/30" />
      )}
    </button>
  );
}
