"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { QUALITY_TIERS } from "@/lib/seedance/engines";
import {
  AUTO_DURATION_ESTIMATE_SECONDS,
  estimateCredits,
  formatCredits,
  formatUsd,
} from "@/lib/seedance/pricing";
import { AUTO_DURATION, SEEDANCE_25_LIMITS } from "@/lib/seedance/v25/types";
import { useVideoSettings } from "@/lib/settings/use-video-settings";
import { MIGRATION_REQUIRED_CODE } from "@/lib/supabase/schema-errors";
import { RERENDER_TARGET_TIER } from "@/lib/video/display";
import type { GeneratedVideo, VideoInputUrls } from "@/lib/types";

/**
 * "Re-render as Final" (D3).
 *
 * A finished DRAFT (480p/720p) is re-submitted with the IDENTICAL prompt and
 * the IDENTICAL inputs at 1080p — the server replays `request_payload`, so this
 * button never rebuilds a request. The only thing the user may change before
 * confirming is the duration (and not even that for `edit`, which is always
 * Auto, or `multi_frame`, whose length is the sum of its segments).
 *
 * The confirm dialog exists because this costs real money: it shows the 1080p
 * credit + ≈USD estimate before anything is queued.
 */

export type RerenderSource = Pick<GeneratedVideo, "id"> &
  Partial<
    Pick<
      GeneratedVideo,
      | "seedance_mode"
      | "quality_tier"
      | "requested_duration"
      | "duration_seconds"
      | "is_uncensored"
      | "input_urls"
    >
  >;

interface RerenderButtonProps {
  video: RerenderSource;
  /** Called with the NEW row's id once Enhancor accepted the job. */
  onQueued?: (newVideoId: string) => void;
  size?: "sm" | "lg" | "default";
  variant?: "default" | "outline";
  className?: string;
}

const FIXED_DURATION_MODES = new Set(["edit", "multi_frame"]);

export function RerenderButton({
  video,
  onQueued,
  size = "sm",
  variant = "outline",
  className,
}: RerenderButtonProps) {
  const { settings } = useVideoSettings();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mode = video.seedance_mode ?? "ugc";
  const durationLocked = FIXED_DURATION_MODES.has(mode);
  const sourceDuration =
    video.requested_duration ?? video.duration_seconds ?? AUTO_DURATION_ESTIMATE_SECONDS;
  const [duration, setDuration] = useState<number>(
    durationLocked ? AUTO_DURATION : clampDuration(sourceDuration)
  );

  const isAuto = duration === AUTO_DURATION || durationLocked;
  const hasVideoInputs = (video.input_urls as VideoInputUrls | null)?.videos?.length
    ? true
    : false;

  const estimate = useMemo(
    () =>
      estimateCredits({
        engine: "2.5",
        mode,
        resolution: "1080p",
        durationSeconds: isAuto ? AUTO_DURATION : duration,
        hasVideoInputs,
        isUncensored: !!video.is_uncensored,
        rates: settings.rates,
        usdPerCredit: settings.usd_per_credit,
      }),
    [mode, duration, isAuto, hasVideoInputs, video.is_uncensored, settings]
  );

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/seedance/${video.id}/rerender`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAuto ? {} : { duration }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.code === MIGRATION_REQUIRED_CODE) {
          toast.error(data.error ?? "Database migration not applied", { duration: 12000 });
        } else if (data?.code === "not_rerenderable") {
          toast.error(data.error ?? "This video can't be re-rendered as Final.");
        } else {
          toast.error(data?.error ?? "Re-render failed");
        }
        return;
      }

      setOpen(false);
      toast.success("Queued a Final 1080p render — it'll appear in your gallery.");
      if (typeof data?.videoId === "string") onQueued?.(data.videoId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-render failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn("gap-1.5", className)}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Re-render as Final
      </Button>

      <Dialog open={open} onOpenChange={(next) => !submitting && setOpen(next)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-coco-brown">
              Re-render as {QUALITY_TIERS[RERENDER_TARGET_TIER].label}
            </DialogTitle>
            <DialogDescription className="text-xs text-coco-brown-medium">
              Same prompt, same inputs, same settings — re-rendered at 1080p. The
              original draft stays in your gallery.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-coco-beige-dark bg-coco-beige-light/40 px-3 py-2">
              <label
                htmlFor="rerender-duration"
                className="text-xs font-medium text-coco-brown"
              >
                Duration
              </label>
              {durationLocked ? (
                <span className="text-xs text-coco-brown-medium">
                  Auto ({mode === "edit" ? "Edit" : "Multi-Frame"} sets its own length)
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    id="rerender-duration"
                    type="number"
                    min={SEEDANCE_25_LIMITS.durationMin}
                    max={SEEDANCE_25_LIMITS.durationMax}
                    value={isAuto ? "" : duration}
                    placeholder="Auto"
                    onChange={(e) => {
                      const raw = e.target.value;
                      setDuration(raw === "" ? AUTO_DURATION : clampDuration(Number(raw)));
                    }}
                    className="w-20 rounded border border-coco-beige-dark bg-white px-2 py-1 text-xs text-coco-brown outline-none focus:border-coco-golden"
                  />
                  <span className="text-[11px] text-coco-brown-medium">seconds</span>
                </div>
              )}
            </div>

            <div className="rounded-xl border-2 border-coco-golden/30 bg-coco-golden/5 px-3 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-coco-brown">
                  Estimated cost
                </span>
                <span className="text-sm font-bold text-coco-brown">
                  {formatCredits(estimate.credits)} cr · {formatUsd(estimate.usd)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-coco-brown-medium/70">{estimate.note}</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={submitting}
              onClick={submit}
              className="gap-1.5 bg-coco-golden text-white hover:bg-coco-golden-dark"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Queuing…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Render Final 1080p
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return AUTO_DURATION;
  if (value === AUTO_DURATION) return AUTO_DURATION;
  return Math.max(
    SEEDANCE_25_LIMITS.durationMin,
    Math.min(SEEDANCE_25_LIMITS.durationMax, Math.round(value))
  );
}
