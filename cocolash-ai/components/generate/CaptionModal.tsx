"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CaptionStyleSelector } from "./CaptionStyleSelector";
import { PlatformSelector } from "./PlatformSelector";
import { CaptionVariationCard } from "./CaptionVariationCard";
import { PublishModal } from "./PublishModal";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Send,
  X,
} from "lucide-react";
import { PLATFORM_LIMITS } from "@/lib/constants/posting-times";
import { cn } from "@/lib/utils";
import type {
  CaptionStyle,
  Platform,
  CaptionVariation,
  CaptionPlatformResult,
} from "@/lib/types";

interface CaptionModalProps {
  open: boolean;
  onClose: () => void;
  imageId: string;
  imageUrl: string;
}

interface SelectedCaption {
  captionId: string;
  variation: CaptionVariation;
  platform: Platform;
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400",
  tiktok: "bg-gray-900",
  twitter: "bg-gray-800",
  facebook: "bg-blue-600",
  linkedin: "bg-blue-700",
};

export function CaptionModal({
  open,
  onClose,
  imageId,
  imageUrl,
}: CaptionModalProps) {
  const [style, setStyle] = useState<CaptionStyle>("casual");
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram"]);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<CaptionPlatformResult[]>([]);
  const [captionIds, setCaptionIds] = useState<Record<string, string[]>>({});
  const [selectedCaptions, setSelectedCaptions] = useState<Record<Platform, number>>(
    {} as Record<Platform, number>
  );
  const [error, setError] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<SelectedCaption | null>(null);
  const [activePlatformTab, setActivePlatformTab] = useState<Platform | null>(null);

  const handleGenerate = async () => {
    if (platforms.length === 0) return;

    setGenerating(true);
    setError(null);
    setResults([]);
    setSelectedCaptions({} as Record<Platform, number>);

    try {
      const res = await fetch("/api/captions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, style, platforms }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Caption generation failed");
        return;
      }

      setResults(data.results);

      const ids: Record<string, string[]> = {};
      for (const r of data.results) {
        ids[r.platform] = r.captions.map(
          (_: CaptionVariation, i: number) => `${r.platform}-${i}`
        );
      }
      setCaptionIds(ids);

      const defaults: Record<Platform, number> = {} as Record<Platform, number>;
      for (const r of data.results) {
        defaults[r.platform as Platform] = 0;
      }
      setSelectedCaptions(defaults);
      setActivePlatformTab(data.results[0]?.platform as Platform || null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSelect = (platform: Platform, index: number) => {
    setSelectedCaptions((prev) => ({ ...prev, [platform]: index }));
  };

  const handleUpdate = (
    platform: Platform,
    index: number,
    text: string,
    hashtags: string[]
  ) => {
    setResults((prev) =>
      prev.map((r) => {
        if (r.platform !== platform) return r;
        const updated = [...r.captions];
        updated[index] = {
          ...updated[index],
          text,
          hashtags,
          character_count: text.length,
          is_within_limit: text.length <= PLATFORM_LIMITS[platform].caption,
        };
        return { ...r, captions: updated };
      })
    );
  };

  const handlePublish = (platform: Platform) => {
    const selectedIdx = selectedCaptions[platform] ?? 0;
    const result = results.find((r) => r.platform === platform);
    if (!result) return;

    const variation = result.captions[selectedIdx];
    const cId = captionIds[platform]?.[selectedIdx] || "";

    setPublishTarget({ captionId: cId, variation, platform });
  };

  const hasResults = results.length > 0;
  const activeResult = results.find((r) => r.platform === activePlatformTab);

  const handleCloseAll = () => {
    setPublishTarget(null);
    onClose();
  };

  return (
    <>
      <Dialog open={open && !publishTarget} onOpenChange={(o) => !o && handleCloseAll()}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col overflow-hidden rounded-2xl p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">Create Captions &amp; Publish</DialogTitle>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-coco-beige-dark bg-gradient-to-r from-coco-beige/60 to-white px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-coco-brown">
                Create Captions & Publish
              </h2>
              <p className="text-xs text-coco-brown-medium/60">
                Generate AI captions for your image and publish to social media
              </p>
            </div>
            <button
              onClick={handleCloseAll}
              className="flex h-8 w-8 items-center justify-center rounded-full text-coco-brown-medium/50 transition-colors hover:bg-coco-beige hover:text-coco-brown"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body — two-column layout */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Left — Image + controls */}
            <div className="flex w-80 shrink-0 flex-col border-r border-coco-beige-dark bg-coco-beige/20">
              {/* Image preview */}
              <div className="p-4">
                <div className="relative overflow-hidden rounded-xl border border-coco-beige-dark bg-white shadow-sm">
                  <Image
                    src={imageUrl}
                    alt="Image to caption"
                    width={400}
                    height={500}
                    className="h-auto w-full object-contain"
                    priority
                  />
                </div>
              </div>

              {/* Caption controls */}
              <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
                <CaptionStyleSelector value={style} onChange={setStyle} />
                <PlatformSelector selected={platforms} onChange={setPlatforms} />

                <Button
                  onClick={handleGenerate}
                  disabled={generating || platforms.length === 0}
                  className="w-full gap-2 bg-coco-golden text-white hover:bg-coco-golden-dark"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {hasResults ? "Regenerate Captions" : "Generate Captions"}
                    </>
                  )}
                </Button>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* Right — Results */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {hasResults ? (
                <>
                  {/* Platform tabs */}
                  <div className="flex gap-1 border-b border-coco-beige-dark bg-white px-4 pt-3">
                    {results.map((result) => {
                      const platform = result.platform as Platform;
                      const isActive = activePlatformTab === platform;
                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => setActivePlatformTab(platform)}
                          className={cn(
                            "flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2.5 text-xs font-semibold capitalize transition-all",
                            isActive
                              ? "border-coco-beige-dark bg-coco-beige/30 text-coco-brown"
                              : "border-transparent text-coco-brown-medium/50 hover:text-coco-brown-medium"
                          )}
                        >
                          <div className={cn("h-2 w-2 rounded-full", PLATFORM_ICONS[platform])} />
                          {platform === "twitter" ? "X / Twitter" : platform}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active platform captions */}
                  {activeResult && (
                    <div className="flex-1 overflow-y-auto p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold capitalize text-coco-brown">
                          {activePlatformTab === "twitter" ? "X / Twitter" : activePlatformTab} Captions
                        </h3>
                        <Button
                          size="sm"
                          onClick={() => handlePublish(activePlatformTab!)}
                          className="gap-1.5 bg-coco-golden text-xs text-white hover:bg-coco-golden-dark"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Publish to {activePlatformTab === "twitter" ? "X" : activePlatformTab}
                        </Button>
                      </div>

                      <div className="grid gap-3">
                        {activeResult.captions.map(
                          (variation: CaptionVariation, i: number) => {
                            const limits = PLATFORM_LIMITS[activePlatformTab!];
                            return (
                              <CaptionVariationCard
                                key={i}
                                variation={variation}
                                index={i}
                                isSelected={(selectedCaptions[activePlatformTab!] ?? 0) === i}
                                platformLimit={limits.caption}
                                hashtagLimit={limits.hashtags}
                                onSelect={() => handleSelect(activePlatformTab!, i)}
                                onUpdate={(text, hashtags) =>
                                  handleUpdate(activePlatformTab!, i, text, hashtags)
                                }
                              />
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Empty state */
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-coco-golden/10">
                    <Sparkles className="h-8 w-8 text-coco-golden/40" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-coco-brown-medium/50">
                    {generating ? "Generating captions…" : "Your captions will appear here"}
                  </p>
                  <p className="mt-1 text-xs text-coco-brown-medium/30">
                    Select your platforms and style, then hit Generate
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {publishTarget && (
        <PublishModal
          open={!!publishTarget}
          onBack={() => setPublishTarget(null)}
          onCloseAll={handleCloseAll}
          imageUrl={imageUrl}
          imageId={imageId}
          captionId={publishTarget.captionId}
          caption={publishTarget.variation}
          platform={publishTarget.platform}
        />
      )}
    </>
  );
}
