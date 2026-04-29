"use client";

import { useState } from "react";
import Image from "next/image";
import { Play, Clock, Film, Loader2, AlertCircle, Sparkles, Clapperboard, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ImageLoader } from "@/components/ui/image-loader";
import type { GeneratedVideo } from "@/lib/types";
import { cn } from "@/lib/utils";

const EDUCATIONAL_CAMPAIGNS = new Set([
  "educational",
  "brand-story",
  "faq",
  "myths",
  "product-knowledge",
]);

interface VideoCardProps {
  video: GeneratedVideo;
  onClick: () => void;
  eager?: boolean;
}

const CAMPAIGN_LABELS: Record<string, string> = {
  "product-showcase": "Showcase",
  testimonial: "Testimonial",
  promo: "Promo",
  educational: "Tutorial",
  "brand-story": "Brand Story",
  faq: "FAQ",
  myths: "Myth-Busting",
  "product-knowledge": "Product Knowledge",
  unboxing: "Unboxing",
  "before-after": "Before/After",
};

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  completed: { label: "Ready", className: "bg-green-500/80 text-white", icon: Film },
  captioning: { label: "Captioning", className: "bg-coco-golden/80 text-white", icon: Loader2 },
  processing: { label: "Processing", className: "bg-coco-golden/80 text-white", icon: Loader2 },
  pending: { label: "Pending", className: "bg-coco-brown-medium/60 text-white", icon: Clock },
  failed: { label: "Failed", className: "bg-red-500/80 text-white", icon: AlertCircle },
};

export function VideoCard({ video, onClick, eager = false }: VideoCardProps) {
  const [loaded, setLoaded] = useState(false);

  const thumbnailUrl = video.thumbnail_url || video.composed_image_url || video.person_image_url;
  const isEducational = EDUCATIONAL_CAMPAIGNS.has(video.background_type ?? "");
  const status = video.heygen_status ?? "pending";
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  const dateStr = new Date(video.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const durationStr = video.duration_seconds
    ? `${video.duration_seconds}s`
    : "—";

  return (
    <div className="group relative overflow-hidden rounded-xl border border-coco-beige-dark bg-white shadow-sm transition-all duration-200 hover:shadow-md">
      <button
        type="button"
        onClick={onClick}
        className="block w-full cursor-pointer"
      >
        <div className="relative aspect-video overflow-hidden bg-coco-charcoal/90">
          {thumbnailUrl ? (
            <>
              {!loaded && (
                <div className="absolute inset-0 z-[1] flex items-center justify-center">
                  <ImageLoader />
                </div>
              )}
              <Image
                src={thumbnailUrl}
                alt="Video thumbnail"
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                preload={eager}
                loading={eager ? "eager" : "lazy"}
                fetchPriority={eager ? "high" : "auto"}
                className={cn(
                  "object-cover transition-all duration-300 group-hover:scale-105",
                  loaded ? "opacity-100" : "opacity-0"
                )}
                onLoad={() => setLoaded(true)}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <Film className="h-8 w-8 text-coco-beige/30" />
            </div>
          )}

          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

          {/* Play icon on hover (only for completed) */}
          {status === "completed" && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                <Play className="h-5 w-5 text-coco-brown" />
              </div>
            </div>
          )}

          {/* Processing / captioning spinner overlay */}
          {(status === "processing" || status === "captioning") && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90">
                <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
              </div>
            </div>
          )}
        </div>
      </button>

      {/* Campaign type badge (top-left) */}
      {video.aspect_ratio && (
        <Badge className="absolute left-2 top-2 bg-coco-brown/80 text-[10px] text-white backdrop-blur-sm">
          <Film className="mr-1 h-3 w-3" />
          {CAMPAIGN_LABELS[video.background_type ?? ""] ?? video.aspect_ratio}
        </Badge>
      )}

      {/* Duration badge (top-right) */}
      <div className="absolute right-2 top-2 flex items-center gap-1">
        <Badge className="bg-black/60 text-[10px] text-white backdrop-blur-sm">
          <Clock className="mr-1 h-3 w-3" />
          {durationStr}
        </Badge>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-coco-brown-medium/60">{dateStr}</span>
          {video.pipeline === "seedance" ? (
            <Badge className="bg-orange-100 text-[9px] text-orange-700">
              <Sparkles className="mr-0.5 h-2.5 w-2.5" />
              Seedance
            </Badge>
          ) : isEducational ? (
            <Badge className="bg-indigo-100 text-[9px] text-indigo-700">
              <GraduationCap className="mr-0.5 h-2.5 w-2.5" />
              Brand Content
            </Badge>
          ) : (
            <Badge className="bg-gray-100 text-[9px] text-gray-600">
              <Clapperboard className="mr-0.5 h-2.5 w-2.5" />
              HeyGen
            </Badge>
          )}
        </div>
        <Badge
          className={cn(
            "text-[10px] backdrop-blur-sm",
            statusConfig.className
          )}
        >
          <StatusIcon
            className={cn(
              "mr-1 h-3 w-3",
              (status === "processing" || status === "captioning") && "animate-spin"
            )}
          />
          {statusConfig.label}
        </Badge>
      </div>
    </div>
  );
}
