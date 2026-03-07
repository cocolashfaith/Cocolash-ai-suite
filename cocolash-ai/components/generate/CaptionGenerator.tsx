"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CaptionStyleSelector } from "./CaptionStyleSelector";
import { PlatformSelector } from "./PlatformSelector";
import { CaptionVariationCard } from "./CaptionVariationCard";
import { PublishModal } from "./PublishModal";
import {
  MessageSquareText,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
  AlertCircle,
} from "lucide-react";
import { PLATFORM_LIMITS } from "@/lib/constants/posting-times";
import type {
  CaptionStyle,
  Platform,
  CaptionVariation,
  CaptionPlatformResult,
} from "@/lib/types";

interface CaptionGeneratorProps {
  imageId: string;
  imageUrl: string;
}

interface SelectedCaption {
  captionId: string;
  variation: CaptionVariation;
  platform: Platform;
}

export function CaptionGenerator({
  imageId,
  imageUrl,
}: CaptionGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState<CaptionStyle>("casual");
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram"]);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<CaptionPlatformResult[]>([]);
  const [captionIds, setCaptionIds] = useState<
    Record<string, string[]>
  >({});
  const [selectedCaptions, setSelectedCaptions] = useState<
    Record<Platform, number>
  >({} as Record<Platform, number>);
  const [error, setError] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<SelectedCaption | null>(
    null
  );

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
        body: JSON.stringify({
          imageId,
          style,
          platforms,
        }),
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
          is_within_limit:
            text.length <= PLATFORM_LIMITS[platform].caption,
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

    setPublishTarget({
      captionId: cId,
      variation,
      platform,
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-coco-pink-dark/20 bg-white shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-coco-beige/30"
      >
        <MessageSquareText className="h-5 w-5 text-coco-golden" />
        <div className="flex-1">
          <h3 className="text-base font-semibold text-coco-brown">
            Create Captions & Publish
          </h3>
          <p className="text-xs text-coco-brown-medium">
            Generate AI captions and post to social media
          </p>
        </div>
        {results.length > 0 && (
          <Badge className="mr-2 bg-emerald-50 text-xs text-emerald-700">
            {results.length} platform{results.length !== 1 ? "s" : ""}
          </Badge>
        )}
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-coco-brown-medium/50" />
        ) : (
          <ChevronDown className="h-5 w-5 text-coco-brown-medium/50" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-coco-pink-dark/20 px-5 pb-5 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <CaptionStyleSelector value={style} onChange={setStyle} />
            <div />
          </div>

          <PlatformSelector selected={platforms} onChange={setPlatforms} />

          <Button
            onClick={handleGenerate}
            disabled={generating || platforms.length === 0}
            className="w-full gap-2 bg-coco-golden text-white hover:bg-coco-golden-dark"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Captions…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Captions
              </>
            )}
          </Button>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {results.map((result) => {
            const platform = result.platform as Platform;
            const limits = PLATFORM_LIMITS[platform];
            const selectedIdx = selectedCaptions[platform] ?? 0;

            return (
              <div
                key={platform}
                className="space-y-3 rounded-xl border border-coco-beige-dark bg-coco-beige/10 p-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold capitalize text-coco-brown">
                    {platform === "twitter" ? "X / Twitter" : platform}
                  </h4>
                  <Button
                    size="sm"
                    onClick={() => handlePublish(platform)}
                    className="h-7 gap-1 bg-coco-golden text-[10px] text-white hover:bg-coco-golden-dark"
                  >
                    <Send className="h-3 w-3" />
                    Publish
                  </Button>
                </div>

                <div className="grid gap-2">
                  {result.captions.map(
                    (variation: CaptionVariation, i: number) => (
                      <CaptionVariationCard
                        key={i}
                        variation={variation}
                        index={i}
                        isSelected={selectedIdx === i}
                        platformLimit={limits.caption}
                        hashtagLimit={limits.hashtags}
                        onSelect={() => handleSelect(platform, i)}
                        onUpdate={(text, hashtags) =>
                          handleUpdate(platform, i, text, hashtags)
                        }
                      />
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {publishTarget && (
        <PublishModal
          open={!!publishTarget}
          onClose={() => setPublishTarget(null)}
          imageUrl={imageUrl}
          imageId={imageId}
          captionId={publishTarget.captionId}
          caption={publishTarget.variation}
          platform={publishTarget.platform}
        />
      )}
    </div>
  );
}
