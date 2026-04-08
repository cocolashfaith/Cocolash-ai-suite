"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Loader2,
  Music,
  Play,
  Pause,
  VolumeX,
} from "lucide-react";
import type { BackgroundMusic } from "@/lib/types";

interface MusicSelectorProps {
  selectedTrackId: string | null;
  onSelect: (trackId: string | null) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  upbeat: "Upbeat",
  calm: "Calm",
  inspirational: "Inspirational",
  trendy: "Trendy",
};

export function MusicSelector({ selectedTrackId, onSelect }: MusicSelectorProps) {
  const [tracks, setTracks] = useState<BackgroundMusic[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchTracks();
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const fetchTracks = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/backgrounds");
      if (!res.ok) {
        console.warn("[MusicSelector] API returned", res.status);
        return;
      }
      const data = await res.json();
      setTracks(data.tracks ?? []);
      setCategories(data.categories ?? []);
    } catch (err) {
      console.warn("[MusicSelector] Could not load tracks:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlay = (track: BackgroundMusic) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    audioRef.current?.pause();
    const audio = new Audio(track.file_url);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      toast.error("Preview not available yet");
    };
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(track.id);
  };

  const filteredTracks = activeCategory
    ? tracks.filter((t) => t.category === activeCategory)
    : tracks;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-coco-brown">
          Background Music
        </label>
        <span className="text-[10px] text-coco-brown-medium/40">
          Music mixing coming soon
        </span>
      </div>
      <p className="text-xs text-coco-brown-medium/60">
        Select a track for your video (actual mixing deferred to post-launch)
      </p>

      {/* No Music Option */}
      <button
        type="button"
        onClick={() => {
          audioRef.current?.pause();
          setPlayingId(null);
          onSelect(null);
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all",
          selectedTrackId === null
            ? "border-coco-golden bg-coco-golden/10"
            : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
        )}
      >
        <VolumeX
          className={cn(
            "h-4 w-4",
            selectedTrackId === null
              ? "text-coco-golden"
              : "text-coco-brown-medium/40"
          )}
        />
        <span
          className={cn(
            "text-xs font-medium",
            selectedTrackId === null
              ? "text-coco-golden"
              : "text-coco-brown-medium"
          )}
        >
          No Music
        </span>
      </button>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
          <Loader2 className="h-5 w-5 animate-spin text-coco-brown-medium/40" />
          <span className="ml-2 text-xs text-coco-brown-medium/50">
            Loading tracks...
          </span>
        </div>
      ) : tracks.length > 0 ? (
        <>
          {/* Category Filter */}
          {categories.length > 1 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "rounded-full px-3 py-1 text-[10px] font-medium transition-all",
                  activeCategory === null
                    ? "bg-coco-golden text-white"
                    : "bg-coco-beige text-coco-brown-medium hover:bg-coco-beige-dark"
                )}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-medium capitalize transition-all",
                    activeCategory === cat
                      ? "bg-coco-golden text-white"
                      : "bg-coco-beige text-coco-brown-medium hover:bg-coco-beige-dark"
                  )}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </button>
              ))}
            </div>
          )}

          {/* Track Grid */}
          <div className="grid grid-cols-2 gap-2">
            {filteredTracks.map((track) => {
              const isSelected = selectedTrackId === track.id;
              const isPlaying = playingId === track.id;

              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => onSelect(track.id)}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-xl border-2 p-3 text-left transition-all",
                    isSelected
                      ? "border-coco-golden bg-coco-golden/10"
                      : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
                  )}
                >
                  {/* Play Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlay(track);
                    }}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all",
                      isPlaying
                        ? "bg-coco-golden text-white"
                        : isSelected
                          ? "bg-coco-golden/20 text-coco-golden"
                          : "bg-coco-beige text-coco-brown-medium group-hover:bg-coco-golden/10 group-hover:text-coco-golden"
                    )}
                  >
                    {isPlaying ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </button>

                  {/* Track Info */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-xs font-medium",
                        isSelected ? "text-coco-brown" : "text-coco-brown-medium"
                      )}
                    >
                      {track.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] capitalize text-coco-brown-medium/40">
                        {CATEGORY_LABELS[track.category ?? ""] ?? track.category}
                      </span>
                      {track.duration_seconds && (
                        <>
                          <span className="text-[10px] text-coco-brown-medium/20">
                            ·
                          </span>
                          <span className="text-[10px] text-coco-brown-medium/40">
                            {track.duration_seconds}s
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Selected indicator */}
                  {isSelected && (
                    <Music className="h-3 w-3 shrink-0 text-coco-golden" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
