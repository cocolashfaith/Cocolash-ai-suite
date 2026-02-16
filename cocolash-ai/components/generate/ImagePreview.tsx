"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Download,
  RefreshCw,
  RotateCw,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Ratio,
  Columns2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ExportForPlatform } from "./ExportForPlatform";
import type { GeneratedImage } from "@/lib/types";

interface ImagePreviewProps {
  image: GeneratedImage;
  generationTimeMs: number;
  onGenerateAnother: () => void;
  /** Re-generate with the exact same settings */
  onRegenerate: () => void;
  /** For Before/After, the "before" image is passed separately */
  beforeImage?: GeneratedImage;
  /** The side-by-side composite image URL (Phase 2.4) */
  compositeImageUrl?: string;
}

export function ImagePreview({
  image,
  generationTimeMs,
  onGenerateAnother,
  onRegenerate,
  beforeImage,
  compositeImageUrl,
}: ImagePreviewProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const isBeforeAfter = !!beforeImage;
  const hasComposite = !!compositeImageUrl;

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

  const handleDownloadUrl = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-4">
      {/* Before/After WITH composite — composite hero + individual thumbnails */}
      {isBeforeAfter && hasComposite ? (
        <div className="space-y-3">
          {/* Composite hero image */}
          <div>
            <p className="mb-1.5 text-center text-xs font-semibold uppercase tracking-wider text-coco-golden">
              Side-by-Side Composite
            </p>
            <button
              type="button"
              onClick={() => setLightboxSrc(compositeImageUrl)}
              className="relative block w-full overflow-hidden rounded-2xl border-2 border-coco-golden/40 bg-white shadow-sm cursor-pointer transition-shadow hover:shadow-lg"
            >
              <Image
                src={compositeImageUrl}
                alt="Before & After composite comparison"
                width={2048}
                height={1024}
                className="h-auto w-full object-contain"
                priority
              />
            </button>
            <Button
              size="sm"
              onClick={() =>
                handleDownloadUrl(
                  compositeImageUrl,
                  `cocolash-before-after-composite-${image.aspect_ratio.replace(":", "x")}.png`
                )
              }
              className="mt-2 w-full gap-1.5 bg-coco-golden text-white hover:bg-coco-golden-dark"
            >
              <Download className="h-3.5 w-3.5" />
              Download Composite
            </Button>
          </div>

          {/* Individual Before/After thumbnails */}
          <div className="rounded-xl border border-coco-beige-dark bg-white/50 p-3">
            <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-coco-brown-medium/50">
              Individual Images
            </p>
            <div className="grid grid-cols-2 gap-2">
              {/* Before thumbnail */}
              <div className="space-y-1">
                <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-coco-brown-medium/50">
                  Before
                </p>
                <button
                  type="button"
                  onClick={() => setLightboxSrc(beforeImage.image_url)}
                  className="relative block w-full overflow-hidden rounded-lg border border-coco-beige-dark bg-white shadow-sm cursor-pointer transition-shadow hover:shadow-md"
                >
                  <Image
                    src={beforeImage.image_url}
                    alt="Before — natural lashes"
                    width={256}
                    height={320}
                    className="h-auto w-full object-contain"
                  />
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(beforeImage, "before")}
                  className="w-full gap-1 text-[10px] h-7 border-coco-brown-medium/15"
                >
                  <Download className="h-2.5 w-2.5" />
                  Before
                </Button>
              </div>

              {/* After thumbnail */}
              <div className="space-y-1">
                <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-coco-golden">
                  After
                </p>
                <button
                  type="button"
                  onClick={() => setLightboxSrc(image.image_url)}
                  className="relative block w-full overflow-hidden rounded-lg border border-coco-golden/30 bg-white shadow-sm cursor-pointer transition-shadow hover:shadow-md"
                >
                  <Image
                    src={image.image_url}
                    alt="After — CocoLash extensions"
                    width={256}
                    height={320}
                    className="h-auto w-full object-contain"
                  />
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(image, "after")}
                  className="w-full gap-1 text-[10px] h-7 border-coco-golden/30 text-coco-golden-dark"
                >
                  <Download className="h-2.5 w-2.5" />
                  After
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : isBeforeAfter ? (
        /* Before/After WITHOUT composite — side-by-side thumbnails (no composite) */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {/* Before image */}
            <div className="space-y-1.5">
              <p className="text-center text-xs font-semibold uppercase tracking-wider text-coco-brown-medium/60">
                Before
              </p>
              <button
                type="button"
                onClick={() => setLightboxSrc(beforeImage.image_url)}
                className="relative block w-full overflow-hidden rounded-xl border border-coco-beige-dark bg-white shadow-sm cursor-pointer transition-shadow hover:shadow-md"
              >
                <Image
                  src={beforeImage.image_url}
                  alt="Before — natural lashes"
                  width={512}
                  height={640}
                  className="h-auto w-full object-contain"
                  priority
                />
              </button>
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
              <button
                type="button"
                onClick={() => setLightboxSrc(image.image_url)}
                className="relative block w-full overflow-hidden rounded-xl border-2 border-coco-golden/40 bg-white shadow-sm cursor-pointer transition-shadow hover:shadow-md"
              >
                <Image
                  src={image.image_url}
                  alt="After — CocoLash extensions"
                  width={512}
                  height={640}
                  className="h-auto w-full object-contain"
                  priority
                />
              </button>
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
        <button
          type="button"
          onClick={() => setLightboxSrc(image.image_url)}
          className="relative block w-full overflow-hidden rounded-2xl border border-coco-beige-dark bg-white shadow-sm cursor-pointer transition-shadow hover:shadow-lg"
        >
          <Image
            src={image.image_url}
            alt={`Generated ${image.category} image`}
            width={1024}
            height={1280}
            className="h-auto w-full object-contain"
            priority
          />
        </button>
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
            {hasComposite ? "3 Images" : "2 Images"}
          </Badge>
        )}
        {hasComposite && (
          <Badge className="gap-1 bg-coco-golden/10 text-coco-golden-dark">
            <Columns2 className="h-3 w-3" />
            Composite
          </Badge>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
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
          onClick={onRegenerate}
          className="flex-1 gap-2 border-coco-golden/30 text-coco-golden-dark hover:bg-coco-golden/5"
          title="Regenerate with the same settings"
        >
          <RotateCw className="h-4 w-4" />
          Regenerate
        </Button>
        <Button
          variant="outline"
          onClick={onGenerateAnother}
          className="flex-1 gap-2 border-coco-brown-medium/20"
        >
          <RefreshCw className="h-4 w-4" />
          New Settings
        </Button>
      </div>

      {/* Export for platform */}
      {!image.is_composite && (
        <div className="rounded-xl border border-coco-beige-dark bg-white p-3">
          <ExportForPlatform image={image} />
        </div>
      )}

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

      {/* Lightbox overlay */}
      <ImageLightbox
        src={lightboxSrc}
        alt="Generated CocoLash image"
        isOpen={!!lightboxSrc}
        onClose={() => setLightboxSrc(null)}
        downloadFilename={`cocolash-${image.category}-${image.aspect_ratio.replace(":", "x")}.png`}
      />
    </div>
  );
}
