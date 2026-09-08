"use client";

import { useEffect, useState } from "react";
import { Check, Film, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Row shape returned by GET /api/videos/inputs (plan §2.11, package C). */
export interface VideoInputOption {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
  pipeline: "seedance" | "heygen";
  engine: "2.0" | "2.5" | null;
  mode: string | null;
  label: string;
}

interface FromYourVideosGridProps {
  /** URLs already picked — rendered as selected, clicking one removes it. */
  selectedUrls: string[];
  onToggle: (url: string) => void;
  /** Disable further additions once the caller is at its cap. */
  atLimit?: boolean;
}

/**
 * "From your videos" — the finished clips in this workspace that still have a
 * live public URL, offered as Seedance input. Backed by GET /api/videos/inputs
 * (package C); this component only speaks the HTTP contract.
 */
export function FromYourVideosGrid({
  selectedUrls,
  onToggle,
  atLimit,
}: FromYourVideosGridProps) {
  const [videos, setVideos] = useState<VideoInputOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/videos/inputs?limit=60");
        const data = (await res.json().catch(() => ({}))) as {
          videos?: VideoInputOption[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `Could not load your videos (${res.status})`);
        setVideos(Array.isArray(data.videos) ? data.videos : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your videos");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
        <Loader2 className="h-4 w-4 animate-spin text-coco-brown-medium/40" />
        <span className="ml-2 text-xs text-coco-brown-medium/50">Loading your videos…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border-2 border-dashed border-coco-beige-dark bg-coco-beige-light/40 p-4 text-center">
        <p className="text-[11px] text-coco-brown-medium/70">{error}</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
        <Film className="h-6 w-6 text-coco-brown-medium/30" />
        <p className="mt-2 text-xs text-coco-brown-medium/50">
          No finished videos yet — generate one, or upload / paste a URL instead.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {videos.map((v) => {
        const selected = selectedUrls.includes(v.url);
        const blocked = !selected && !!atLimit;
        return (
          <button
            key={v.id}
            type="button"
            disabled={blocked}
            onClick={() => onToggle(v.url)}
            title={v.label}
            className={cn(
              "group relative overflow-hidden rounded-lg border-2 bg-coco-beige-light text-left transition-all",
              selected
                ? "border-coco-golden ring-2 ring-coco-golden/30"
                : "border-coco-beige-dark hover:border-coco-golden/40",
              blocked && "cursor-not-allowed opacity-40"
            )}
          >
            <div className="flex aspect-video items-center justify-center bg-coco-beige-light">
              {v.thumbnailUrl ? (
                // Cloudinary / Supabase / CDN hosts are not in next.config remotePatterns.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnailUrl} alt={v.label} className="h-full w-full object-cover" />
              ) : (
                <Film className="h-5 w-5 text-coco-brown-medium/30" />
              )}
              {selected && (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-coco-golden">
                  <Check className="h-3 w-3 text-white" />
                </span>
              )}
            </div>
            <div className="px-2 py-1.5">
              <p className="truncate text-[10px] font-medium text-coco-brown">{v.label}</p>
              <p className="text-[9px] text-coco-brown-medium/50">
                {v.durationSeconds ? `${v.durationSeconds}s · ` : ""}
                {v.engine ? `Seedance ${v.engine}` : v.pipeline}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
