"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Copy,
  Check,
  CheckCircle,
  Instagram,
  Twitter,
  Facebook,
  Linkedin,
  Music2,
  MessageSquareText,
} from "lucide-react";
import type { Caption, Platform } from "@/lib/types";

const PLATFORM_META: Record<
  Platform,
  { label: string; icon: React.ElementType; color: string }
> = {
  instagram: { label: "Instagram", icon: Instagram, color: "text-purple-600" },
  tiktok: { label: "TikTok", icon: Music2, color: "text-gray-900" },
  twitter: { label: "X / Twitter", icon: Twitter, color: "text-blue-500" },
  facebook: { label: "Facebook", icon: Facebook, color: "text-blue-700" },
  linkedin: { label: "LinkedIn", icon: Linkedin, color: "text-blue-600" },
};

interface CaptionHistoryViewProps {
  imageId: string;
}

export function CaptionHistoryView({ imageId }: CaptionHistoryViewProps) {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCaptions = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/images/${imageId}/captions`);
        const data = await res.json();
        setCaptions(data.captions ?? []);
      } catch {
        setCaptions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCaptions();
  }, [imageId]);

  const handleCopy = async (caption: Caption) => {
    const hashtags = caption.hashtags?.map((h) => `#${h}`).join(" ") || "";
    const full = hashtags
      ? `${caption.caption_text}\n\n${hashtags}`
      : caption.caption_text;
    await navigator.clipboard.writeText(full);
    setCopiedId(caption.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
      </div>
    );
  }

  if (captions.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <MessageSquareText className="h-8 w-8 text-coco-brown-medium/20" />
        <p className="mt-2 text-sm text-coco-brown-medium/50">
          No captions generated for this image yet.
        </p>
        <p className="mt-1 text-xs text-coco-brown-medium/30">
          Generate captions from the Generate page after creating an image.
        </p>
      </div>
    );
  }

  const grouped = captions.reduce<Record<string, Caption[]>>((acc, c) => {
    const key = c.platform;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([platform, caps]) => {
        const meta = PLATFORM_META[platform as Platform];
        const Icon = meta?.icon || MessageSquareText;

        return (
          <div key={platform} className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon
                className={`h-4 w-4 ${meta?.color || "text-coco-brown-medium"}`}
              />
              <span className="text-xs font-semibold text-coco-brown">
                {meta?.label || platform}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] text-coco-brown-medium/50"
              >
                {caps.length}
              </Badge>
            </div>

            <div className="space-y-1.5">
              {caps.map((cap) => (
                <div
                  key={cap.id}
                  className={`rounded-lg border p-2.5 ${
                    cap.is_selected
                      ? "border-coco-golden/40 bg-coco-golden/5"
                      : "border-coco-beige-dark bg-white"
                  }`}
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="text-[9px] capitalize text-coco-brown-medium/60"
                    >
                      {cap.caption_style}
                    </Badge>
                    {cap.is_selected && (
                      <Badge className="gap-0.5 bg-coco-golden text-[9px] text-white">
                        <CheckCircle className="h-2.5 w-2.5" />
                        Selected
                      </Badge>
                    )}
                    <span className="ml-auto text-[9px] text-coco-brown-medium/30">
                      {new Date(cap.generated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <p className="mb-1.5 whitespace-pre-wrap text-xs leading-relaxed text-coco-brown">
                    {cap.caption_text}
                  </p>

                  {cap.hashtags && cap.hashtags.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {cap.hashtags.map((h) => (
                        <span
                          key={h}
                          className="text-[9px] text-coco-golden-dark"
                        >
                          #{h}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-coco-brown-medium/30">
                      {cap.character_count} chars
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(cap)}
                      className="ml-auto h-6 gap-1 px-2 text-[10px]"
                    >
                      {copiedId === cap.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
