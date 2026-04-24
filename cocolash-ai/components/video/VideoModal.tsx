"use client";

import { useState } from "react";
import {
  Download,
  Trash2,
  X,
  Film,
  Clock,
  Mic,
  Ratio,
  MessageSquare,
  DollarSign,
  Tag,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GeneratedVideo, VideoScript } from "@/lib/types";
import { toast } from "sonner";

const CAMPAIGN_DISPLAY: Record<string, string> = {
  "product-showcase": "Product Showcase",
  testimonial: "Testimonial",
  promo: "Sale / Promo",
  educational: "Educational / Tutorial",
  "brand-story": "Brand Story",
  faq: "FAQ",
  myths: "Myth-Busting",
  "product-knowledge": "Product Knowledge",
  unboxing: "Unboxing",
  "before-after": "Before / After",
};

const EDUCATIONAL_CAMPAIGNS = new Set([
  "educational",
  "brand-story",
  "faq",
  "myths",
  "product-knowledge",
]);

function getPipelineLabel(video: GeneratedVideo): string {
  if (video.pipeline === "seedance") return "Seedance 2.0";
  const ct = video.background_type ?? "";
  return EDUCATIONAL_CAMPAIGNS.has(ct) ? "Brand Content Studio" : "HeyGen";
}

interface VideoModalProps {
  video: GeneratedVideo | null;
  script: VideoScript | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export function VideoModal({
  video,
  script,
  isOpen,
  onClose,
  onDelete,
}: VideoModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const videoUrl = video?.final_video_url ?? video?.raw_video_url ?? null;

  if (!video) return null;

  const handleDownload = () => {
    window.open(`/api/videos/${video.id}/download`, "_blank");
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/videos/${video.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Video deleted");
      onDelete(video.id);
      onClose();
    } catch {
      toast.error("Failed to delete video");
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const dateStr = new Date(video.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto bg-white p-0">
        <DialogTitle className="sr-only">Video Details</DialogTitle>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Video Player */}
        {videoUrl ? (
          <div className="relative aspect-video bg-black">
            <video
              key={videoUrl}
              src={videoUrl}
              poster={video.thumbnail_url ?? undefined}
              controls
              className="h-full w-full"
              preload="metadata"
            />
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center bg-coco-charcoal/90">
            <div className="text-center">
              <Film className="mx-auto h-10 w-10 text-coco-beige/30" />
              <p className="mt-2 text-sm text-coco-beige/50">
                {video.heygen_status === "processing"
                  ? "Video is still generating..."
                  : video.heygen_status === "captioning"
                  ? "Burning styled captions..."
                  : "Video not available"}
              </p>
            </div>
          </div>
        )}

        {/* Details */}
        <div className="space-y-4 p-5">
          {/* Status + Date */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-coco-brown-medium/50">{dateStr}</span>
            <StatusBadge status={video.heygen_status ?? "pending"} />
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetaItem
              icon={Layers}
              label="Pipeline"
              value={getPipelineLabel(video)}
            />
            <MetaItem
              icon={Tag}
              label="Content Type"
              value={CAMPAIGN_DISPLAY[video.background_type ?? ""] ?? video.background_type ?? "—"}
            />
            <MetaItem
              icon={Clock}
              label="Duration"
              value={video.duration_seconds ? `${video.duration_seconds}s` : "—"}
            />
            <MetaItem
              icon={Ratio}
              label="Aspect Ratio"
              value={video.aspect_ratio ?? "—"}
            />
            <MetaItem
              icon={Mic}
              label="Voice"
              value={video.voice_id ? video.voice_id.substring(0, 12) : "—"}
            />
            <MetaItem
              icon={MessageSquare}
              label="Captions"
              value={video.has_captions ? "Yes" : "No"}
            />
            <MetaItem
              icon={DollarSign}
              label="Cost"
              value={
                video.processing_cost
                  ? `$${Number(video.processing_cost).toFixed(2)}`
                  : "—"
              }
            />
          </div>

          {/* Script Text */}
          {(script || video.script_text_cache) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-coco-brown">Script</p>
              <div className="rounded-xl border border-coco-beige-dark bg-coco-beige-light/50 p-3">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-coco-brown-medium">
                  {script?.script_text ?? video.script_text_cache}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {videoUrl && (
              <Button
                onClick={handleDownload}
                className="flex-1 gap-2 bg-coco-golden text-sm font-semibold text-white hover:bg-coco-golden-dark"
                size="lg"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}

            <Button
              onClick={handleDelete}
              disabled={isDeleting}
              variant="outline"
              className={
                confirmDelete
                  ? "flex-1 gap-2 border-red-300 bg-red-50 text-sm text-red-600 hover:bg-red-100"
                  : "flex-1 gap-2 text-sm"
              }
              size="lg"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting
                ? "Deleting..."
                : confirmDelete
                  ? "Confirm Delete"
                  : "Delete"}
            </Button>
          </div>

          {confirmDelete && (
            <p className="text-center text-[11px] text-red-500/70">
              Click again to permanently delete this video
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-coco-beige-dark bg-coco-beige-light/30 px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-coco-brown-medium/40" />
      <div>
        <p className="text-[10px] text-coco-brown-medium/50">{label}</p>
        <p className="text-xs font-medium text-coco-brown">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    completed: { label: "Completed", className: "bg-green-100 text-green-700" },
    processing: { label: "Processing", className: "bg-amber-100 text-amber-700" },
    pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
    failed: { label: "Failed", className: "bg-red-100 text-red-600" },
  };

  const c = config[status] ?? config.pending;

  return (
    <Badge className={`text-[10px] font-medium ${c.className}`}>
      {c.label}
    </Badge>
  );
}
