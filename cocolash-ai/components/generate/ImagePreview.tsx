"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Ratio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GeneratedImage } from "@/lib/types";

interface ImagePreviewProps {
  image: GeneratedImage;
  generationTimeMs: number;
  onGenerateAnother: () => void;
  /** For Before/After, the "before" image is passed separately */
  beforeImage?: GeneratedImage;
}

export function ImagePreview({
  image,
  generationTimeMs,
  onGenerateAnother,
  beforeImage,
}: ImagePreviewProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const isBeforeAfter = !!beforeImage;

  const handleDownload = async (targetImage: GeneratedImage, suffix?: string) => {
    try {
      const response = await fetch(`/api/images/${targetImage.id}/download`);
      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cocolash-${targetImage.category}${suffix ? `-${suffix}` : ""}-${targetImage.aspect_ratio.replace(":", "x")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(targetImage.image_url, "_blank");
    }
  };

  return (
    <div className="space-y-4">
      {/* Before/After dual display */}
      {isBeforeAfter ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {/* Before image */}
            <div className="space-y-1.5">
              <p className="text-center text-xs font-semibold uppercase tracking-wider text-coco-brown-medium/60">
                Before
              </p>
              <div className="relative overflow-hidden rounded-xl border border-coco-beige-dark bg-white shadow-sm">
                <Image
                  src={beforeImage.image_url}
                  alt="Before — natural lashes"
                  width={512}
                  height={640}
                  className="h-auto w-full object-contain"
                  priority
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(beforeImage, "before")}
                className="w-full gap-1 text-xs border-coco-brown-medium/20"
              >
                <Download className="h-3 w-3" />
                Download Before
              </Button>
            </div>

            {/* After image */}
            <div className="space-y-1.5">
              <p className="text-center text-xs font-semibold uppercase tracking-wider text-coco-golden">
                After
              </p>
              <div className="relative overflow-hidden rounded-xl border-2 border-coco-golden/40 bg-white shadow-sm">
                <Image
                  src={image.image_url}
                  alt="After — CocoLash extensions"
                  width={512}
                  height={640}
                  className="h-auto w-full object-contain"
                  priority
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(image, "after")}
                className="w-full gap-1 text-xs border-coco-golden/40 text-coco-golden-dark"
              >
                <Download className="h-3 w-3" />
                Download After
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Single image display */
        <div className="relative overflow-hidden rounded-2xl border border-coco-beige-dark bg-white shadow-sm">
          <Image
            src={image.image_url}
            alt={`Generated ${image.category} image`}
            width={1024}
            height={1280}
            className="h-auto w-full object-contain"
            priority
          />
        </div>
      )}

      {/* Metadata badges */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant="secondary"
          className="gap-1 bg-coco-beige text-coco-brown-medium"
        >
          <Layers className="h-3 w-3" />
          {image.category.replace("-", " ")}
        </Badge>
        <Badge
          variant="secondary"
          className="gap-1 bg-coco-beige text-coco-brown-medium"
        >
          <Ratio className="h-3 w-3" />
          {image.aspect_ratio}
        </Badge>
        <Badge
          variant="secondary"
          className="gap-1 bg-coco-beige text-coco-brown-medium"
        >
          <Clock className="h-3 w-3" />
          {(generationTimeMs / 1000).toFixed(1)}s
        </Badge>
        {image.has_logo_overlay && (
          <Badge className="bg-coco-golden/10 text-coco-golden-dark">
            Logo Applied
          </Badge>
        )}
        {isBeforeAfter && (
          <Badge className="bg-coco-golden/10 text-coco-golden-dark">
            2 Images
          </Badge>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {!isBeforeAfter && (
          <Button
            onClick={() => handleDownload(image)}
            className="flex-1 gap-2 bg-coco-golden text-white hover:bg-coco-golden-dark"
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
        )}
        <Button
          variant="outline"
          onClick={onGenerateAnother}
          className={`${isBeforeAfter ? "w-full" : "flex-1"} gap-2 border-coco-brown-medium/20`}
        >
          <RefreshCw className="h-4 w-4" />
          Generate Another
        </Button>
      </div>

      {/* Expandable prompt section */}
      <div className="rounded-xl border border-coco-beige-dark bg-white">
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
            {isBeforeAfter && beforeImage && (
              <>
                <p className="mb-1 text-[10px] font-semibold uppercase text-coco-brown-medium/50">
                  Before Prompt
                </p>
                <pre className="mb-3 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-coco-brown-medium/80 leading-relaxed">
                  {beforeImage.prompt_used}
                </pre>
                <p className="mb-1 text-[10px] font-semibold uppercase text-coco-golden">
                  After Prompt
                </p>
              </>
            )}
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-coco-brown-medium/80 leading-relaxed">
              {image.prompt_used}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
