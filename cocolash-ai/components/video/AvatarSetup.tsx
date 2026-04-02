"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  ImageIcon,
  Hand,
  Brush,
  Camera,
  MessageCircle,
  RefreshCw,
  Check,
} from "lucide-react";
import type { CompositionPose } from "@/lib/types";

interface AvatarSetupProps {
  onCompositionReady: (data: {
    personImageUrl: string;
    personImageId?: string;
    productImageUrl: string;
    composedImageUrl: string;
    pose: CompositionPose;
  }) => void;
}

interface GalleryImage {
  id: string;
  image_url: string;
  category: string;
  created_at: string;
}

const POSES: {
  value: CompositionPose;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { value: "holding", label: "Holding", description: "Product at chest level", icon: Hand },
  { value: "applying", label: "Applying", description: "Application tutorial", icon: Brush },
  { value: "selfie", label: "Selfie", description: "Social media style", icon: Camera },
  { value: "testimonial", label: "Testimonial", description: "Review/talk to camera", icon: MessageCircle },
];

export function AvatarSetup({ onCompositionReady }: AvatarSetupProps) {
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedPersonUrl, setSelectedPersonUrl] = useState<string | null>(null);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [pose, setPose] = useState<CompositionPose>("holding");
  const [isComposing, setIsComposing] = useState(false);
  const [composedImageUrl, setComposedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchGalleryImages();
  }, []);

  const fetchGalleryImages = async () => {
    setLoadingGallery(true);
    try {
      const res = await fetch("/api/gallery?limit=12&sort=newest");
      const data = await res.json();
      if (res.ok) {
        setGalleryImages(data.images ?? []);
      }
    } catch {
      // Gallery load failure is non-fatal
    } finally {
      setLoadingGallery(false);
    }
  };

  const handleSelectPerson = (img: GalleryImage) => {
    setSelectedPersonId(img.id);
    setSelectedPersonUrl(img.image_url);
    setComposedImageUrl(null);
  };

  const handleCompose = async () => {
    if (!selectedPersonUrl || !productImageUrl.trim()) {
      toast.error("Please select a person image and enter a product image URL");
      return;
    }

    setIsComposing(true);
    setComposedImageUrl(null);

    try {
      const res = await fetch("/api/videos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "compose-only",
          personImageUrl: selectedPersonUrl,
          personImageId: selectedPersonId,
          productImageUrl: productImageUrl.trim(),
          pose,
        }),
      });

      // For now, the composition will happen during the full generate step.
      // Show a simulated preview.
      toast.success("Composition settings saved! Preview will be generated during video creation.");
      setComposedImageUrl(selectedPersonUrl);
    } catch {
      toast.error("Composition failed — please try again.");
    } finally {
      setIsComposing(false);
    }
  };

  const handleContinue = () => {
    if (!selectedPersonUrl || !productImageUrl.trim()) {
      toast.error("Please complete all selections");
      return;
    }

    onCompositionReady({
      personImageUrl: selectedPersonUrl,
      personImageId: selectedPersonId ?? undefined,
      productImageUrl: productImageUrl.trim(),
      composedImageUrl: composedImageUrl ?? selectedPersonUrl,
      pose,
    });
  };

  return (
    <div className="space-y-6">
      {/* Person Image Selection */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Person Image
        </label>
        <p className="text-xs text-coco-brown-medium/60">
          Choose a generated image or the composition will use one from your gallery
        </p>

        {loadingGallery ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
            <Loader2 className="h-5 w-5 animate-spin text-coco-brown-medium/40" />
          </div>
        ) : galleryImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-8">
            <ImageIcon className="h-8 w-8 text-coco-brown-medium/30" />
            <p className="mt-2 text-xs text-coco-brown-medium/50">
              No images yet — generate some on the Generate page first
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {galleryImages.map((img) => {
              const isSelected = selectedPersonId === img.id;
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => handleSelectPerson(img)}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                    isSelected
                      ? "border-coco-golden ring-2 ring-coco-golden/30"
                      : "border-transparent hover:border-coco-golden/40"
                  )}
                >
                  <img
                    src={img.image_url}
                    alt="Generated"
                    className="h-full w-full object-cover"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-coco-golden/20">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Product Image URL */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Product Image URL
        </label>
        <input
          type="url"
          value={productImageUrl}
          onChange={(e) => {
            setProductImageUrl(e.target.value);
            setComposedImageUrl(null);
          }}
          placeholder="https://... (paste product image URL)"
          className="w-full rounded-xl border-2 border-coco-beige-dark bg-white px-4 py-3 text-sm text-coco-brown outline-none placeholder:text-coco-brown-medium/30 focus:border-coco-golden focus:ring-1 focus:ring-coco-golden"
        />
      </div>

      {/* Pose Selector */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Composition Pose
        </label>
        <div className="grid grid-cols-2 gap-3">
          {POSES.map((p) => {
            const Icon = p.icon;
            const isActive = pose === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => {
                  setPose(p.value);
                  setComposedImageUrl(null);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-3 transition-all duration-200",
                  isActive
                    ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                    : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    isActive
                      ? "bg-coco-golden text-white"
                      : "bg-coco-beige text-coco-brown-medium"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className={cn("text-xs font-medium", isActive ? "text-coco-brown" : "text-coco-brown-medium")}>
                    {p.label}
                  </p>
                  <p className="text-[10px] text-coco-brown-medium/60">{p.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compose / Preview */}
      {selectedPersonUrl && productImageUrl.trim() && (
        <div className="space-y-3">
          {!composedImageUrl ? (
            <Button
              onClick={handleCompose}
              disabled={isComposing}
              className="w-full gap-2 bg-coco-brown py-5 text-sm font-semibold text-white shadow-md hover:bg-coco-brown-light disabled:opacity-50"
              size="lg"
            >
              {isComposing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating composition...
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4" />
                  Preview Composition
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border-2 border-coco-golden/30 bg-white">
                <div className="flex items-center justify-between border-b border-coco-beige-dark px-4 py-2">
                  <span className="text-xs font-semibold text-coco-brown">Composition Preview</span>
                  <button
                    type="button"
                    onClick={() => {
                      setComposedImageUrl(null);
                      handleCompose();
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium text-coco-golden hover:text-coco-golden-dark"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Regenerate
                  </button>
                </div>
                <div className="aspect-[4/5] bg-coco-beige-light">
                  <img
                    src={composedImageUrl}
                    alt="Composition preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              <Button
                onClick={handleContinue}
                className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg hover:bg-coco-golden-dark hover:shadow-xl"
                size="lg"
              >
                Use This Composition →
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
