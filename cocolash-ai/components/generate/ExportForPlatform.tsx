"use client";

import { useState } from "react";
import {
  Download,
  Loader2,
  Check,
  Square,
  RectangleVertical,
  Smartphone,
  RectangleHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { AspectRatio, GeneratedImage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ExportForPlatformProps {
  /** The source image to export from */
  image: GeneratedImage;
  /** Called when a new exported image is successfully created (optional) */
  onExported?: (exportedImage: GeneratedImage) => void;
}

interface PlatformFormat {
  ratio: AspectRatio;
  label: string;
  platform: string;
  icon: React.ElementType;
}

const FORMATS: PlatformFormat[] = [
  { ratio: "1:1", label: "1:1", platform: "Instagram Feed", icon: Square },
  { ratio: "4:5", label: "4:5", platform: "Instagram Optimal", icon: RectangleVertical },
  { ratio: "9:16", label: "9:16", platform: "Stories / Reels", icon: Smartphone },
  { ratio: "16:9", label: "16:9", platform: "Facebook / YouTube", icon: RectangleHorizontal },
];

export function ExportForPlatform({ image, onExported }: ExportForPlatformProps) {
  // Track loading & completed state per ratio
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [exported, setExported] = useState<Record<string, GeneratedImage>>({});

  const handleExport = async (targetRatio: AspectRatio) => {
    // Skip if already exporting this ratio
    if (loading[targetRatio]) return;

    // If already exported, just download
    if (exported[targetRatio]) {
      downloadImage(exported[targetRatio]);
      return;
    }

    setLoading((prev) => ({ ...prev, [targetRatio]: true }));

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId: image.id,
          targetAspectRatio: targetRatio,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Export failed");
      }

      const exportedImage = data.image as GeneratedImage;
      setExported((prev) => ({ ...prev, [targetRatio]: exportedImage }));
      onExported?.(exportedImage);
      toast.success(`Exported to ${targetRatio} successfully!`);

      // Auto-download
      downloadImage(exportedImage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      toast.error(message);
    } finally {
      setLoading((prev) => ({ ...prev, [targetRatio]: false }));
    }
  };

  const downloadImage = (img: GeneratedImage) => {
    const a = document.createElement("a");
    a.href = img.image_url;
    a.download = `cocolash-${img.category}-${img.aspect_ratio.replace(":", "x")}-export.png`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Don't allow export of composite images
  if (image.is_composite) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-coco-brown-medium/60 uppercase tracking-wider">
        Export for Platform
      </p>
      <div className="grid grid-cols-2 gap-2">
        {FORMATS.map((format) => {
          const isOriginal = image.aspect_ratio === format.ratio;
          const isLoading = loading[format.ratio];
          const isExported = !!exported[format.ratio];
          const Icon = format.icon;

          return (
            <Button
              key={format.ratio}
              variant="outline"
              size="sm"
              disabled={isOriginal || isLoading}
              onClick={() =>
                isOriginal
                  ? undefined
                  : isExported
                    ? downloadImage(exported[format.ratio])
                    : handleExport(format.ratio)
              }
              className={cn(
                "relative flex h-auto flex-col items-center gap-0.5 py-2 text-[11px] transition-all",
                isOriginal
                  ? "border-coco-golden/40 bg-coco-golden/5 text-coco-golden-dark cursor-default"
                  : isExported
                    ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                    : "border-coco-brown-medium/15 hover:border-coco-golden/40 hover:bg-coco-golden/5"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-coco-golden" />
              ) : isExported ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : isOriginal ? (
                <Icon className="h-4 w-4 text-coco-golden" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <span className="font-semibold">{format.label}</span>
              <span className="text-[9px] leading-tight opacity-60">
                {isOriginal ? "Current" : isExported ? "Download" : format.platform}
              </span>
              {isOriginal && (
                <span className="absolute -top-1.5 right-1 rounded bg-coco-golden px-1 py-px text-[8px] font-bold text-white">
                  ORIGINAL
                </span>
              )}
              {isExported && !isOriginal && (
                <Download className="absolute right-1 top-1 h-3 w-3 text-green-500" />
              )}
            </Button>
          );
        })}
      </div>
      <p className="text-[10px] text-coco-brown-medium/40 text-center">
        Re-generates via AI at the new ratio — higher quality than cropping
      </p>
    </div>
  );
}
