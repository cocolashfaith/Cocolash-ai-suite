"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Subtitles,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import type {
  VideoAspectRatio,
  VoiceOption,
  CaptionMethod,
} from "@/lib/types";

interface VoiceAndStyleProps {
  initialAspectRatio?: VideoAspectRatio;
  isEducational?: boolean;
  onStyleReady: (data: {
    voiceId: string;
    aspectRatio: VideoAspectRatio;
    captionMethod: CaptionMethod;
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
type AgeFilter = "all" | "young" | "middle_aged" | "old";

const AGE_OPTIONS: { value: AgeFilter; label: string }[] = [
  { value: "all", label: "All Ages" },
  { value: "young", label: "Young" },
  { value: "middle_aged", label: "Middle Aged" },
  { value: "old", label: "Old" },
];

const ACCENT_OPTIONS = [
  "all",
  "american",
  "british",
  "australian",
  "indian",
  "african",
  "irish",
  "italian",
  "latino",
  "middle eastern",
  "swedish",
  "german",
  "french",
  "korean",
  "chinese",
  "japanese",
] as const;

export function VoiceAndStyle({
  initialAspectRatio = "9:16",
  isEducational = false,
  onStyleReady,
}: VoiceAndStyleProps) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [accentFilter, setAccentFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(0);

  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(initialAspectRatio);
  const [styledCaptions, setStyledCaptions] = useState(isEducational);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAspectRatio(initialAspectRatio);
  }, [initialAspectRatio]);

  const fetchVoices = useCallback(
    async (opts?: { search?: string; gender?: string; age?: string; accent?: string; page?: number }) => {
      setLoadingVoices(true);
      try {
        const params = new URLSearchParams();
        if (opts?.search) params.set("search", opts.search);
        if (opts?.gender && opts.gender !== "all") params.set("gender", opts.gender);
        if (opts?.age && opts.age !== "all") params.set("age", opts.age);
        if (opts?.accent && opts.accent !== "all") params.set("accent", opts.accent);
        if (opts?.page) params.set("page", String(opts.page));

        const qs = params.toString();
        const res = await fetch(`/api/voices${qs ? `?${qs}` : ""}`);
        const data = await res.json();

        if (res.ok) {
          setVoices(data.voices ?? []);
          if (!selectedVoiceId && data.voices?.length > 0) {
            setSelectedVoiceId(data.voices[0].id);
          }
        } else {
          toast.error(data.error || "Failed to load voices");
        }
      } catch {
        toast.error("Failed to load voices");
      } finally {
        setLoadingVoices(false);
      }
    },
    [selectedVoiceId]
  );

  useEffect(() => {
    fetchVoices();
    return () => {
      audioRef.current?.pause();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerSearch = useCallback(
    (search: string, gender: string, age: string, accent: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setCurrentPage(0);
        fetchVoices({ search, gender, age, accent, page: 0 });
      }, 400);
    },
    [fetchVoices]
  );

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    triggerSearch(val, genderFilter, ageFilter, accentFilter);
  };

  const handleGenderChange = (g: GenderFilter) => {
    setGenderFilter(g);
    triggerSearch(searchQuery, g, ageFilter, accentFilter);
  };

  const handleAgeChange = (a: AgeFilter) => {
    setAgeFilter(a);
    triggerSearch(searchQuery, genderFilter, a, accentFilter);
  };

  const handleAccentChange = (a: string) => {
    setAccentFilter(a);
    triggerSearch(searchQuery, genderFilter, ageFilter, a);
  };

  const handleLoadMore = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    setLoadingVoices(true);

    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (genderFilter !== "all") params.set("gender", genderFilter);
    if (ageFilter !== "all") params.set("age", ageFilter);
    if (accentFilter !== "all") params.set("accent", accentFilter);
    params.set("page", String(nextPage));

    fetch(`/api/voices?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.voices?.length > 0) {
          setVoices((prev) => [...prev, ...data.voices]);
        }
      })
      .catch(() => toast.error("Failed to load more voices"))
      .finally(() => setLoadingVoices(false));
  };

  const handlePlayPreview = (voiceId: string, previewUrl: string | null) => {
    if (!previewUrl) return;

    if (playingPreview === voiceId) {
      audioRef.current?.pause();
      setPlayingPreview(null);
      return;
    }

    audioRef.current?.pause();
    const audio = new Audio(previewUrl);
    audio.onended = () => setPlayingPreview(null);
    audio.onerror = () => {
      setPlayingPreview(null);
      toast.error("Could not play voice preview");
    };
    audio.play().catch(() => setPlayingPreview(null));
    audioRef.current = audio;
    setPlayingPreview(voiceId);
  };

  const handleContinue = () => {
    if (!selectedVoiceId) {
      toast.error("Please select a voice");
      return;
    }

    const captionMethod: CaptionMethod = styledCaptions
      ? "shotstack"
      : "cloudinary-srt";

    onStyleReady({ voiceId: selectedVoiceId, aspectRatio, captionMethod });
  };

  const hasActiveFilters =
    searchQuery || genderFilter !== "all" || ageFilter !== "all" || accentFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setGenderFilter("all");
    setAgeFilter("all");
    setAccentFilter("all");
    setCurrentPage(0);
    fetchVoices();
  };

  return (
    <div className="space-y-6">
      {/* Voice Selector */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">Voice</label>
        <p className="text-xs text-coco-brown-medium/60">
          Browse 10,000+ ElevenLabs voices — search, filter, and preview before selecting
        </p>

        {/* Search + Filters */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-coco-brown-medium/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search voices — try &quot;warm narrator&quot;, &quot;African American&quot;, &quot;deep male&quot;..."
              className="w-full rounded-lg border border-coco-beige-dark bg-white py-2 pl-9 pr-8 text-xs text-coco-brown placeholder:text-coco-brown-medium/40 focus:border-coco-golden focus:outline-none focus:ring-1 focus:ring-coco-golden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-coco-brown-medium/40 hover:text-coco-brown-medium"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Gender */}
            <div className="flex rounded-lg border border-coco-beige-dark bg-white p-0.5">
              {(["all", "female", "male"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => handleGenderChange(g)}
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

            {/* Age */}
            <div className="relative">
              <select
                value={ageFilter}
                onChange={(e) => handleAgeChange(e.target.value as AgeFilter)}
                className="appearance-none rounded-lg border border-coco-beige-dark bg-white py-1.5 pl-2.5 pr-7 text-[11px] text-coco-brown focus:border-coco-golden focus:outline-none focus:ring-1 focus:ring-coco-golden"
              >
                {AGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-coco-brown-medium/40" />
            </div>

            {/* Accent */}
            <div className="relative">
              <select
                value={accentFilter}
                onChange={(e) => handleAccentChange(e.target.value)}
                className="appearance-none rounded-lg border border-coco-beige-dark bg-white py-1.5 pl-2.5 pr-7 text-[11px] text-coco-brown focus:border-coco-golden focus:outline-none focus:ring-1 focus:ring-coco-golden"
              >
                {ACCENT_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a === "all" ? "All Accents" : a.charAt(0).toUpperCase() + a.slice(1)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-coco-brown-medium/40" />
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
          {voices.length} voice{voices.length !== 1 ? "s" : ""}
          {hasActiveFilters ? " matching" : " loaded"}
        </p>

        {/* Voice list */}
        {loadingVoices && voices.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
            <Loader2 className="h-5 w-5 animate-spin text-coco-brown-medium/40" />
            <span className="ml-2 text-xs text-coco-brown-medium/50">Searching voices...</span>
          </div>
        ) : voices.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
            <Mic className="h-6 w-6 text-coco-brown-medium/30" />
            <p className="mt-2 text-xs text-coco-brown-medium/50">
              {hasActiveFilters
                ? "No voices match your filters"
                : "No voices available — check your ElevenLabs API key"}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 text-[11px] text-coco-golden hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border-2 border-coco-beige-dark bg-white p-2">
              {voices.map((voice) => {
                const isSelected = selectedVoiceId === voice.id;
                const details = [voice.gender, voice.accent, voice.age, voice.descriptive]
                  .filter(Boolean)
                  .join(" · ");
                const badge = voice.use_case;

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
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <p
                          className={cn(
                            "truncate text-xs font-medium",
                            isSelected ? "text-coco-brown" : "text-coco-brown-medium"
                          )}
                        >
                          {voice.name || voice.id}
                        </p>
                        {badge && (
                          <span className="shrink-0 rounded bg-coco-beige px-1.5 py-0.5 text-[9px] font-medium text-coco-brown-medium/70">
                            {badge}
                          </span>
                        )}
                      </div>
                      {details && (
                        <p className="truncate text-[10px] text-coco-brown-medium/50">
                          {details}
                        </p>
                      )}
                    </div>
                    {voice.preview_url && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPreview(voice.id, voice.preview_url);
                        }}
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
                          playingPreview === voice.id
                            ? "bg-coco-golden text-white"
                            : "bg-coco-beige text-coco-brown-medium hover:bg-coco-golden/20 hover:text-coco-golden"
                        )}
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
              })}
            </div>

            {/* Load more */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingVoices}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-coco-golden hover:bg-coco-golden/10 disabled:opacity-50"
              >
                {loadingVoices ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Load more voices
              </button>
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

      {/* Caption Style Toggle */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-coco-brown">
          Captions
        </label>
        <button
          type="button"
          onClick={() => setStyledCaptions(!styledCaptions)}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border-2 p-4 transition-all duration-200",
            styledCaptions
              ? "border-coco-golden bg-coco-golden/10"
              : "border-coco-beige-dark bg-white hover:border-coco-golden/40"
          )}
        >
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              styledCaptions
                ? "bg-coco-golden text-white"
                : "bg-coco-beige text-coco-brown-medium"
            )}
          >
            <Subtitles className="h-5 w-5" />
          </div>
          <div className="flex-1 text-left">
            <p className={cn("text-xs font-semibold", styledCaptions ? "text-coco-brown" : "text-coco-brown-medium")}>
              Styled captions
            </p>
            <p className="text-[10px] text-coco-brown-medium/60">
              {styledCaptions
                ? "Clean pill-style captions with background — recommended for educational content"
                : "Standard text overlay — no background styling"}
            </p>
          </div>
          <div
            className={cn(
              "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
              styledCaptions ? "bg-coco-golden" : "bg-coco-beige-dark"
            )}
          >
            <div
              className={cn(
                "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                styledCaptions ? "translate-x-5" : "translate-x-0"
              )}
            />
          </div>
        </button>
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
