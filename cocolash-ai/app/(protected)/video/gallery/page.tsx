"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { VideoCard } from "@/components/video/VideoCard";
import { VideoModal } from "@/components/video/VideoModal";
import {
  applyStatusUpdate,
  inFlightKey,
  statusEndpoint,
} from "@/lib/video/reconcile";
import type {
  GeneratedVideo,
  HeyGenVideoStatus,
  VideoPipeline,
  VideoScript,
  VideoStatusResponse,
} from "@/lib/types";

/** How often the gallery re-polls providers for videos still generating. */
const RECONCILE_INTERVAL_MS = 15_000;

type StatusFilter = HeyGenVideoStatus | "all";
type PipelineFilter = VideoPipeline | "all";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
];

const PIPELINE_FILTERS: { value: PipelineFilter; label: string }[] = [
  { value: "all", label: "All Pipelines" },
  { value: "heygen", label: "HeyGen" },
  { value: "seedance", label: "Seedance" },
];

export default function VideoGalleryPage() {
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>("all");

  const [selectedVideo, setSelectedVideo] = useState<GeneratedVideo | null>(null);
  const [selectedScript, setSelectedScript] = useState<VideoScript | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const limit = 12;

  const fetchVideos = useCallback(
    async (newOffset = 0, append = false) => {
      if (newOffset === 0) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: newOffset.toString(),
        });

        if (statusFilter !== "all") {
          params.set("status", statusFilter);
        }

        if (pipelineFilter !== "all") {
          params.set("pipeline", pipelineFilter);
        }

        const res = await fetch(`/api/videos?${params}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        if (append) {
          setVideos((prev) => [...prev, ...data.videos]);
        } else {
          setVideos(data.videos);
        }
        setTotal(data.total);
        setOffset(newOffset);
      } catch {
        toast.error("Failed to load videos");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [statusFilter, pipelineFilter]
  );

  useEffect(() => {
    fetchVideos(0);
  }, [fetchVideos]);

  // Keep a ref of the latest videos so the reconciliation effect can look up a
  // card's pipeline without re-subscribing every time a card updates.
  const videosRef = useRef<GeneratedVideo[]>([]);
  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  // ── Self-healing reconciliation ──────────────────────────────────
  // Any card still "processing"/"pending"/"captioning" is polled against its
  // provider's status route, which finalizes the DB row if the provider is
  // actually done. This recovers videos whose completion webhook was missed
  // (deploy/cold-start/tunnel) instead of leaving a permanent spinner.
  const pollKey = inFlightKey(videos);
  useEffect(() => {
    if (!pollKey) return; // nothing generating — no poller needed

    let cancelled = false;

    const reconcile = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return; // don't poll a backgrounded tab
      }

      const ids = pollKey.split(",");
      await Promise.all(
        ids.map(async (id) => {
          const video = videosRef.current.find((v) => v.id === id);
          if (!video) return;
          try {
            const res = await fetch(statusEndpoint(video));
            if (!res.ok || cancelled) return;
            const data = (await res.json()) as VideoStatusResponse;
            if (cancelled || !data.status) return;
            setVideos((prev) =>
              prev.map((v) => (v.id === id ? applyStatusUpdate(v, data) : v))
            );
          } catch {
            // Transient — the next interval tick will retry.
          }
        })
      );
    };

    void reconcile(); // reconcile immediately on open / when the set changes
    const timer = setInterval(reconcile, RECONCILE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollKey]);

  const handleLoadMore = () => {
    const newOffset = offset + limit;
    fetchVideos(newOffset, true);
  };

  const hasMore = videos.length < total;

  const openModal = async (video: GeneratedVideo) => {
    setSelectedVideo(video);
    setSelectedScript(null);
    setModalOpen(true);

    if (video.id) {
      try {
        const res = await fetch(`/api/videos/${video.id}`);
        const data = await res.json();
        if (res.ok && data.script) {
          setSelectedScript(data.script);
        }
      } catch {
        // Non-fatal
      }
    }
  };

  const handleDelete = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
    setTotal((prev) => prev - 1);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-coco-brown">Video Gallery</h1>
        <p className="mt-1 text-sm text-coco-brown-medium">
          Browse and manage your generated videos
          {total > 0 && (
            <span className="ml-1 text-coco-brown-medium/50">
              ({total} video{total !== 1 ? "s" : ""})
            </span>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
              statusFilter === f.value
                ? "bg-coco-golden text-white shadow-sm"
                : "bg-white text-coco-brown-medium hover:bg-coco-beige-light"
            )}
          >
            {f.label}
          </button>
        ))}

        <div className="mx-1 h-5 w-px bg-coco-beige-dark" />

        {PIPELINE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setPipelineFilter(f.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
              pipelineFilter === f.value
                ? "bg-coco-brown text-white shadow-sm"
                : "bg-white text-coco-brown-medium hover:bg-coco-beige-light"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-coco-beige-dark bg-white">
              <Skeleton className="aspect-video w-full" />
              <div className="flex items-center justify-between px-3 py-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && videos.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-coco-beige-dark bg-white/50 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-coco-golden/10">
            <Film className="h-8 w-8 text-coco-golden/40" />
          </div>
          <p className="mt-4 text-sm font-medium text-coco-brown-medium/50">
            {statusFilter !== "all" || pipelineFilter !== "all"
              ? `No ${pipelineFilter !== "all" ? pipelineFilter + " " : ""}${statusFilter !== "all" ? statusFilter + " " : ""}videos`
              : "No videos generated yet"}
          </p>
          <p className="mt-1 text-xs text-coco-brown-medium/30">
            Go to Create to generate your first video
          </p>
        </div>
      )}

      {/* Video grid */}
      {!loading && videos.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video, index) => (
              <VideoCard
                key={video.id}
                video={video}
                eager={index < 3}
                onClick={() => openModal(video)}
              />
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="gap-2 border-coco-brown-medium/20"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Video detail modal */}
      <VideoModal
        video={selectedVideo}
        script={selectedScript}
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedVideo(null);
          setSelectedScript(null);
        }}
        onDelete={handleDelete}
      />
    </div>
  );
}
