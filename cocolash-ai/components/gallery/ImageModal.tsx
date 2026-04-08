"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Download,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Ratio,
  MessageSquareText,
  Send,
  Info,
  Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ExportForPlatform } from "@/components/generate/ExportForPlatform";
import { FavoriteButton } from "@/components/gallery/FavoriteButton";
import { CaptionHistoryView } from "./CaptionHistoryView";
import { PublishingHistoryView } from "./PublishingHistoryView";
import type { GeneratedImage } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ModalTab = "details" | "captions" | "publishing";

interface ImageModalProps {
  image: GeneratedImage | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onFavoriteToggle: (id: string, newValue?: boolean) => void;
  onCreateVideo?: (image: GeneratedImage) => void;
}

export function ImageModal({
  image,
  isOpen,
  onClose,
  onDelete,
  onFavoriteToggle,
  onCreateVideo,
}: ImageModalProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>("details");

  if (!image) return null;

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/images/${image.id}/download`);
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cocolash-${image.category}-${image.aspect_ratio.replace(":", "x")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(image.image_url, "_blank");
    }
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(image.id);
    setConfirmDelete(false);
    onClose();
    toast.success("Image deleted");
  };

  const dateStr = new Date(image.created_at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const categoryLabels: Record<string, string> = {
    "lash-closeup": "Lash Close-Up",
    lifestyle: "Lifestyle",
    product: "Product",
    "before-after": "Before/After",
    "application-process": "Application",
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-coco-beige-dark bg-white p-0">
        <DialogTitle className="sr-only">Image Detail</DialogTitle>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Image — click to open lightbox */}
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="relative block w-full bg-coco-beige/30 cursor-pointer transition-opacity hover:opacity-95"
        >
          <Image
            src={image.image_url}
            alt={`Generated ${image.category} image`}
            width={1024}
            height={1280}
            className="h-auto max-h-[60vh] w-full object-contain"
            priority
          />
        </button>

        {/* Tab navigation + Content */}
        <div className="p-5">
          {/* Tab bar */}
          <div className="mb-4 flex gap-1 rounded-lg bg-coco-beige/50 p-1">
            {([
              { key: "details" as const, label: "Details", icon: Info },
              { key: "captions" as const, label: "Captions", icon: MessageSquareText },
              { key: "publishing" as const, label: "Publishing", icon: Send },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all",
                  activeTab === key
                    ? "bg-white text-coco-brown shadow-sm"
                    : "text-coco-brown-medium/60 hover:text-coco-brown-medium"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Details tab */}
          {activeTab === "details" && (
            <div className="space-y-4">
              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className="gap-1 bg-coco-beige text-coco-brown-medium"
                >
                  <Layers className="h-3 w-3" />
                  {categoryLabels[image.category] || image.category}
                </Badge>
                <Badge
                  variant="secondary"
                  className="gap-1 bg-coco-beige text-coco-brown-medium"
                >
                  <Ratio className="h-3 w-3" />
                  {image.aspect_ratio}
                </Badge>
                {image.generation_time_ms && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-coco-beige text-coco-brown-medium"
                  >
                    <Clock className="h-3 w-3" />
                    {(image.generation_time_ms / 1000).toFixed(1)}s
                  </Badge>
                )}
                {image.has_logo_overlay && (
                  <Badge className="bg-coco-golden/10 text-coco-golden-dark">
                    Logo Applied
                  </Badge>
                )}
                <span className="ml-auto text-xs text-coco-brown-medium/50">
                  {dateStr}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={handleDownload}
                  className="flex-1 gap-2 bg-coco-golden text-white hover:bg-coco-golden-dark"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                {onCreateVideo && image && (
                  <Button
                    variant="outline"
                    onClick={() => onCreateVideo(image)}
                    className="gap-2 border-coco-golden/30 text-coco-golden hover:bg-coco-golden/10 hover:text-coco-golden-dark"
                  >
                    <Film className="h-4 w-4" />
                    Create Video
                  </Button>
                )}
                <FavoriteButton
                  imageId={image.id}
                  isFavorite={image.is_favorite}
                  onToggle={(id, newVal) => onFavoriteToggle(id, newVal)}
                  size="md"
                  variant="button"
                />
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  className={cn(
                    "gap-2",
                    confirmDelete
                      ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
                      : "border-coco-brown-medium/20 text-coco-brown-medium hover:text-red-600"
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                  {confirmDelete ? "Confirm?" : "Delete"}
                </Button>
              </div>

              {/* Export for platform */}
              {!image.is_composite && (
                <ExportForPlatform image={image} />
              )}

              {/* Expandable prompt section */}
              <div className="rounded-xl border border-coco-beige-dark">
                <button
                  type="button"
                  onClick={() => setShowPrompt(!showPrompt)}
                  className="flex w-full items-center justify-between p-3 text-sm font-medium text-coco-brown-medium hover:text-coco-brown"
                >
                  View Prompt Used
                  {showPrompt ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showPrompt && (
                  <div className="border-t border-coco-beige-dark p-3">
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-coco-brown-medium/80 leading-relaxed">
                      {image.prompt_used}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Captions tab */}
          {activeTab === "captions" && (
            <CaptionHistoryView imageId={image.id} />
          )}

          {/* Publishing tab */}
          {activeTab === "publishing" && (
            <PublishingHistoryView imageId={image.id} />
          )}
        </div>
      </DialogContent>

      {/* Lightbox for full-screen image view */}
      <ImageLightbox
        src={image.image_url}
        alt={`Generated ${image.category} image`}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        downloadFilename={`cocolash-${image.category}-${image.aspect_ratio.replace(":", "x")}.png`}
      />
    </Dialog>
  );
}
