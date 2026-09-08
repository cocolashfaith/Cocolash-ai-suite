"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RerenderButton } from "@/components/video/RerenderButton";
import { formatCredits, formatUsd } from "@/lib/seedance/pricing";
import { engineLabel } from "@/lib/seedance/engines";
import {
  canRerenderAsFinal,
  statusToDisplay,
  videoCostLabel,
  videoDurationLabel,
  videoModeLabel,
  videoTierLabel,
} from "@/lib/video/display";
import type { SeedanceEngine, VideoStatusResponse } from "@/lib/types";

/**
 * In-wizard generation progress (D11).
 *
 * After "Approve & Generate", Step 3 stops being a form and becomes a live
 * view of the job: elapsed time, a progress bar, and — when Enhancor is done —
 * the finished clip playing inline with its ACTUAL credit cost and a
 * "Re-render as Final" button for drafts.
 *
 * Polling rules that matter:
 *   - every 12 s (Enhancor jobs take 2–10 min; anything faster is just load),
 *   - never while the tab is backgrounded,
 *   - stop dead on a terminal status, and always clear on unmount.
 */

const POLL_INTERVAL_MS = 12_000;

/** The `estimate` block returned by POST /api/seedance/generate (§2.11). */
export interface GenerateEstimate {
  credits: number;
  usd: number;
  billableSeconds: number;
  rateKind: "standard" | "reduced";
  assumedAutoDuration: boolean;
  note: string;
}

interface SeedanceGenerationProgressProps {
  videoId: string;
  engine: SeedanceEngine;
  /** Shown until the provider reports the real cost. */
  estimate?: GenerateEstimate | null;
  /** "Create another video (keeps your images)". */
  onCreateAnother?: () => void;
  /** A Final 1080p re-render was queued — the parent may switch to tracking it. */
  onRerendered?: (newVideoId: string) => void;
}

export function SeedanceGenerationProgress({
  videoId,
  engine,
  estimate,
  onCreateAnother,
  onRerendered,
}: SeedanceGenerationProgressProps) {
  const [status, setStatus] = useState<VideoStatusResponse | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Started when this card mounted — i.e. the moment the job was queued.
    const startedAt = Date.now();
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (tickTimer) clearInterval(tickTimer);
      pollTimer = null;
      tickTimer = null;
    };

    const poll = async () => {
      // Don't burn requests (or Enhancor rate limit) on a backgrounded tab.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/seedance/${videoId}/status`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as VideoStatusResponse;
        if (cancelled || !data?.status) return;
        setStatus(data);
        if (data.status === "completed" || data.status === "failed") stop();
      } catch {
        // Transient — the next tick retries.
      }
    };

    void poll();
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    tickTimer = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt) / 1000)),
      1000
    );

    return () => {
      cancelled = true;
      stop();
    };
  }, [videoId]);

  const display = useMemo(
    () => (status ? statusToDisplay(status) : null),
    [status]
  );

  const state = status?.status ?? "processing";
  const progress = Math.max(5, Math.min(100, status?.progress ?? 10));
  const videoUrl = status?.finalVideoUrl ?? null;

  // ── Failed ────────────────────────────────────────────────
  if (state === "failed") {
    return (
      <section className="space-y-3 rounded-xl border-2 border-red-300 bg-red-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-900">Generation failed</p>
            <p className="mt-0.5 text-xs text-red-800">
              {status?.errorMessage ?? status?.error ?? "Enhancor could not finish this job."}
            </p>
          </div>
        </div>
        {onCreateAnother && (
          <Button onClick={onCreateAnother} variant="outline" size="sm" className="gap-1.5">
            <Sparkles className="h-3 w-3" />
            Try another take
          </Button>
        )}
      </section>
    );
  }

  // ── Completed ─────────────────────────────────────────────
  if (state === "completed" && videoUrl) {
    const actualCost = display ? videoCostLabel(display) : "—";
    const costLine =
      actualCost !== "—"
        ? actualCost
        : estimate
          ? `${formatCredits(estimate.credits)} cr · ${formatUsd(estimate.usd)} estimated`
          : "—";

    return (
      <section className="space-y-4 rounded-xl border-2 border-green-300 bg-green-50/70 p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <p className="text-sm font-semibold text-green-900">
            Your video is ready — {formatElapsed(elapsed)} to render.
          </p>
        </div>

        <video
          key={videoUrl}
          src={videoUrl}
          poster={status?.thumbnailUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="mx-auto max-h-[60vh] w-full rounded-xl border border-coco-beige-dark bg-black"
        />

        <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
          <Meta label="Engine" value={engineLabel(status?.engine ?? engine)} />
          <Meta label="Mode" value={display ? videoModeLabel(display) : "—"} />
          <Meta
            label="Quality"
            value={display ? videoTierLabel(display) : "—"}
          />
          <Meta
            label="Length"
            value={display ? videoDurationLabel(display) : "—"}
          />
        </dl>

        <p className="text-xs font-medium text-coco-brown">
          Cost: <span className="font-bold">{costLine}</span>
        </p>

        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            size="sm"
            className="gap-1.5 bg-coco-golden text-white hover:bg-coco-golden-dark"
          >
            <a href={`/api/videos/${videoId}/download`} target="_blank" rel="noreferrer">
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </Button>

          {display && canRerenderAsFinal(display) && (
            <RerenderButton
              video={{
                id: videoId,
                seedance_mode: status?.mode ?? null,
                quality_tier: status?.qualityTier ?? null,
                requested_duration: status?.requestedDuration ?? null,
                duration_seconds: status?.durationSeconds ?? null,
              }}
              onQueued={onRerendered}
            />
          )}

          {onCreateAnother && (
            <Button onClick={onCreateAnother} variant="outline" size="sm" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Create another video (keeps your images)
            </Button>
          )}
        </div>
      </section>
    );
  }

  // ── In flight ─────────────────────────────────────────────
  return (
    <section className="space-y-3 rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 p-4">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-coco-golden" />
        <p className="text-sm font-semibold text-coco-brown">
          Rendering on {engineLabel(status?.engine ?? engine)}…
        </p>
        <span className="ml-auto text-xs tabular-nums text-coco-brown-medium">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-coco-beige-dark/40">
        <div
          className="h-full rounded-full bg-coco-golden transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-[11px] text-coco-brown-medium/70">
        This typically takes 2–10 minutes. You can leave this page — the clip also
        appears in your gallery when it&apos;s done.
      </p>

      {estimate && (
        <p className="text-[11px] text-coco-brown-medium">
          Estimated cost:{" "}
          <span className="font-semibold text-coco-brown">
            {formatCredits(estimate.credits)} cr · {formatUsd(estimate.usd)}
          </span>
          {estimate.assumedAutoDuration ? " (Auto duration — estimate)" : ""}
        </p>
      )}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-coco-beige-dark bg-white/70 px-2 py-1.5">
      <dt className="text-[10px] text-coco-brown-medium/60">{label}</dt>
      <dd className="text-[11px] font-medium text-coco-brown">{value}</dd>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
