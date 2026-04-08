"use client";

import { useState, useEffect, useMemo } from "react";
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
  Search,
  X,
} from "lucide-react";
import type {
  VideoAspectRatio,
  VoiceOption,
} from "@/lib/types";

interface VoiceAndStyleProps {
  onStyleReady: (data: {
    voiceId: string;
    aspectRatio: VideoAspectRatio;
  }) => void;
}

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

type GenderFilter = "all" | "male" | "female";

export function VoiceAndStyle({ onStyleReady }: VoiceAndStyleProps) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [languageFilter, setLanguageFilter] = useState("all");

  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("9:16");

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

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    voices.forEach((v) => {
      if (v.accent) langs.add(v.accent);
    });
    return Array.from(langs).sort();
  }, [voices]);

  const filteredVoices = useMemo(() => {
    return voices.filter((v) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (v.name ?? "").toLowerCase().includes(q);
        const accentMatch = (v.accent ?? "").toLowerCase().includes(q);
        const genderMatch = (v.gender ?? "").toLowerCase().includes(q);
        if (!nameMatch && !accentMatch && !genderMatch) return false;
      }
      if (genderFilter !== "all") {
        if ((v.gender ?? "").toLowerCase() !== genderFilter) return false;
      }
      if (languageFilter !== "all") {
        if (v.accent !== languageFilter) return false;
      }
      return true;
    });
  }, [voices, searchQuery, genderFilter, languageFilter]);

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
    audio.onerror = () => {
      setPlayingPreview(null);
      toast.error("Could not play voice preview");
    };
    audio.play().catch(() => {
      setPlayingPreview(null);
    });
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
    });
  };

  const hasActiveFilters = searchQuery || genderFilter !== "all" || languageFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setGenderFilter("all");
    setLanguageFilter("all");
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
        ) : voices.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
            <Mic className="h-6 w-6 text-coco-brown-medium/30" />
            <p className="mt-2 text-xs text-coco-brown-medium/50">
              No voices available — check your HeyGen API key
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Search + Filters */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-coco-brown-medium/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, language, or gender..."
                  className="w-full rounded-lg border border-coco-beige-dark bg-white py-2 pl-9 pr-8 text-xs text-coco-brown placeholder:text-coco-brown-medium/40 focus:border-coco-golden focus:outline-none focus:ring-1 focus:ring-coco-golden"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-coco-brown-medium/40 hover:text-coco-brown-medium"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                  className="flex-1 rounded-lg border border-coco-beige-dark bg-white px-2 py-1.5 text-[11px] text-coco-brown focus:border-coco-golden focus:outline-none focus:ring-1 focus:ring-coco-golden"
                >
                  <option value="all">All Languages</option>
                  {availableLanguages.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>

                <div className="flex rounded-lg border border-coco-beige-dark bg-white p-0.5">
                  {(["all", "female", "male"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGenderFilter(g)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                        genderFilter === g
                          ? "bg-coco-golden text-white"
                          : "text-coco-brown-medium/60 hover:text-coco-brown-medium"
                      )}
                    >
                      {g === "all" ? "All" : g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex items-center gap-1 rounded-lg px-2 text-[11px] text-coco-brown-medium/60 hover:text-coco-brown-medium"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Voice count */}
            <p className="text-[10px] text-coco-brown-medium/40">
              {filteredVoices.length} voice{filteredVoices.length !== 1 ? "s" : ""}
              {hasActiveFilters ? " matching" : " available"}
            </p>

            {/* Voice list */}
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border-2 border-coco-beige-dark bg-white p-2">
              {filteredVoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <Search className="h-5 w-5 text-coco-brown-medium/30" />
                  <p className="mt-2 text-xs text-coco-brown-medium/50">
                    No voices match your filters
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-1 text-[11px] text-coco-golden hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                filteredVoices.map((voice) => {
                  const isSelected = selectedVoiceId === voice.id;
                  return (
                    <div
                      key={voice.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedVoiceId(voice.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedVoiceId(voice.id);
                        }
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-all",
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
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
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
