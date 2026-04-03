"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  Mic,
  Play,
  Pause,
  Monitor,
  Square,
  Smartphone,
} from "lucide-react";
import { MusicSelector } from "@/components/video/MusicSelector";
import type {
  VideoAspectRatio,
  VideoBackgroundType,
  VoiceOption,
} from "@/lib/types";

interface VoiceAndStyleProps {
  onStyleReady: (data: {
    voiceId: string;
    aspectRatio: VideoAspectRatio;
    backgroundType: VideoBackgroundType;
    backgroundValue: string;
    addCaptions: boolean;
    addWatermark: boolean;
    musicTrackId: string | null;
  }) => void;
}

const BRAND_COLORS = [
  { label: "Brown", value: "#28150e" },
  { label: "Beige", value: "#ede5d6" },
  { label: "Golden", value: "#ce9765" },
  { label: "Pink", value: "#ead1c1" },
  { label: "White", value: "#ffffff" },
  { label: "Charcoal", value: "#242424" },
];

const ASPECT_RATIOS: {
  value: VideoAspectRatio;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  { value: "9:16", label: "9:16", icon: Smartphone, description: "Reels, TikTok, Stories" },
  { value: "1:1", label: "1:1", icon: Square, description: "Instagram Feed" },
  { value: "16:9", label: "16:9", icon: Monitor, description: "YouTube, Website" },
];

export function VoiceAndStyle({ onStyleReady }: VoiceAndStyleProps) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("9:16");
  const [backgroundType] = useState<VideoBackgroundType>("solid");
  const [selectedColor, setSelectedColor] = useState("#ede5d6");
  const [addCaptions, setAddCaptions] = useState(true);
  const [addWatermark, setAddWatermark] = useState(true);
  const [musicTrackId, setMusicTrackId] = useState<string | null>(null);

  useEffect(() => {
    fetchVoices();
    return () => {
      audioEl?.pause();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchVoices = async () => {
    setLoadingVoices(true);
    try {
      const res = await fetch("/api/voices");
      const data = await res.json();
      if (res.ok) {
        setVoices(data.voices ?? []);
        if (data.voices?.length > 0) {
          setSelectedVoiceId(data.voices[0].id);
        }
      }
    } catch {
      toast.error("Failed to load voices");
    } finally {
      setLoadingVoices(false);
    }
  };

  const handlePlayPreview = (voiceId: string, previewUrl: string | null) => {
    if (!previewUrl) return;

    if (playingPreview === voiceId) {
      audioEl?.pause();
      setPlayingPreview(null);
      return;
    }

    audioEl?.pause();
    const audio = new Audio(previewUrl);
    audio.onended = () => setPlayingPreview(null);
    audio.play().catch(() => {});
    setAudioEl(audio);
    setPlayingPreview(voiceId);
  };

  const handleContinue = () => {
    if (!selectedVoiceId) {
      toast.error("Please select a voice");
      return;
    }

    onStyleReady({
      voiceId: selectedVoiceId,
      aspectRatio,
      backgroundType,
      backgroundValue: selectedColor,
      addCaptions,
      addWatermark,
      musicTrackId,
    });
  };

  return (
    <div className="space-y-6">
      {/* Voice Selector */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">Voice</label>
        <p className="text-xs text-coco-brown-medium/60">
          Choose an AI voice for the avatar to speak with
        </p>

        {loadingVoices ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
            <Loader2 className="h-5 w-5 animate-spin text-coco-brown-medium/40" />
            <span className="ml-2 text-xs text-coco-brown-medium/50">Loading voices...</span>
          </div>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border-2 border-coco-beige-dark bg-white p-2">
            {voices.map((voice) => {
              const isSelected = selectedVoiceId === voice.id;
              return (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => setSelectedVoiceId(voice.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-all",
                    isSelected
                      ? "bg-coco-golden/10 ring-1 ring-coco-golden"
                      : "hover:bg-coco-beige-light"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      isSelected
                        ? "bg-coco-golden text-white"
                        : "bg-coco-beige text-coco-brown-medium"
                    )}
                  >
                    <Mic className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className={cn("text-xs font-medium", isSelected ? "text-coco-brown" : "text-coco-brown-medium")}>
                      {voice.name || voice.id}
                    </p>
                    <p className="text-[10px] text-coco-brown-medium/50">
                      {[voice.gender, voice.accent].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {voice.preview_url && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayPreview(voice.id, voice.preview_url);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-coco-beige text-coco-brown-medium hover:bg-coco-golden/20 hover:text-coco-golden"
                    >
                      {playingPreview === voice.id ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Background Color */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Background Color
        </label>
        <div className="flex gap-3">
          {BRAND_COLORS.map((color) => {
            const isActive = selectedColor === color.value;
            return (
              <button
                key={color.value}
                type="button"
                onClick={() => setSelectedColor(color.value)}
                className={cn(
                  "flex flex-col items-center gap-1.5",
                )}
              >
                <div
                  className={cn(
                    "h-10 w-10 rounded-full border-2 transition-all",
                    isActive
                      ? "border-coco-golden ring-2 ring-coco-golden/30 scale-110"
                      : "border-coco-beige-dark hover:border-coco-golden/40"
                  )}
                  style={{ backgroundColor: color.value }}
                />
                <span className="text-[10px] text-coco-brown-medium/60">{color.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Aspect Ratio
        </label>
        <div className="grid grid-cols-3 gap-3">
          {ASPECT_RATIOS.map((ar) => {
            const Icon = ar.icon;
            const isActive = aspectRatio === ar.value;
            return (
              <button
                key={ar.value}
                type="button"
                onClick={() => setAspectRatio(ar.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 py-3 transition-all duration-200",
                  isActive
                    ? "border-coco-golden bg-coco-golden/10 shadow-sm"
                    : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive ? "text-coco-golden" : "text-coco-brown-medium")} />
                <p className={cn("text-sm font-bold", isActive ? "text-coco-golden" : "text-coco-brown-medium")}>
                  {ar.label}
                </p>
                <p className="text-[10px] text-coco-brown-medium/60">{ar.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <ToggleRow
          label="Auto-Captions"
          description="Add subtitle text overlay to the video"
          checked={addCaptions}
          onChange={setAddCaptions}
        />
        <ToggleRow
          label="Watermark"
          description="Add CocoLash branding to the video"
          checked={addWatermark}
          onChange={setAddWatermark}
        />
      </div>

      {/* Background Music */}
      <MusicSelector
        selectedTrackId={musicTrackId}
        onSelect={setMusicTrackId}
      />

      {/* Continue */}
      <Button
        onClick={handleContinue}
        disabled={!selectedVoiceId}
        className="w-full gap-2 bg-coco-golden py-5 text-sm font-semibold text-white shadow-lg hover:bg-coco-golden-dark hover:shadow-xl disabled:opacity-50"
        size="lg"
      >
        Review & Generate →
      </Button>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border-2 border-coco-beige-dark bg-white px-4 py-3">
      <div>
        <p className="text-xs font-semibold text-coco-brown">{label}</p>
        <p className="text-[10px] text-coco-brown-medium/60">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-coco-golden" : "bg-coco-brown-medium/20"
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          )}
        />
      </button>
    </div>
  );
}
