import type {
  GeneratedVideo,
  HeyGenVideoStatus,
  VideoStatusResponse,
} from "@/lib/types";

/**
 * Video reconciliation helpers (shared by the gallery + any view that lists
 * videos which may still be generating).
 *
 * WHY THIS EXISTS
 * ---------------
 * Both pipelines complete a video out-of-band via a provider webhook:
 *   - Seedance/Enhancor → POST /api/seedance/webhook
 *   - HeyGen            → POST /api/videos/webhook (or status poll)
 *
 * Webhooks get missed in the real world: a deploy/cold-start mid-render, a
 * tunnel pointed at the wrong port in local dev, a transient network drop.
 * When that happens the `generated_videos` row is stranded at `processing`
 * forever and the UI shows a permanent spinner — exactly the "it's been an
 * hour and the video never came back" failure.
 *
 * The per-video status routes already self-heal by polling the provider
 * directly (`querySeedanceTask` / `getVideoStatus`) and finalizing the row.
 * These helpers let a list view (the gallery) drive that reconciliation for
 * any in-flight card, so a missed webhook resolves itself on the next poll
 * instead of requiring a provider callback that may never arrive.
 */

/** Statuses that mean "still working — keep polling the provider". */
export const IN_FLIGHT_STATUSES: readonly HeyGenVideoStatus[] = [
  "pending",
  "processing",
  "captioning",
] as const;

/** True when a video is still generating and should be reconciled by polling. */
export function isInFlight(status: HeyGenVideoStatus | null | undefined): boolean {
  return status != null && IN_FLIGHT_STATUSES.includes(status);
}

/**
 * The status endpoint that knows how to poll THIS video's provider.
 *
 * Critical correctness point: a Seedance video must be polled against the
 * Enhancor-aware route, and a HeyGen video against the HeyGen-aware route.
 * Polling a Seedance video against `/api/videos/[id]/status` would look for a
 * `heygen_video_id` it does not have and never complete it.
 */
export function statusEndpoint(video: Pick<GeneratedVideo, "id" | "pipeline">): string {
  return video.pipeline === "seedance"
    ? `/api/seedance/${video.id}/status`
    : `/api/videos/${video.id}/status`;
}

/** `value ?? fallback`, but treats `null` from the response as "not reported". */
function keep<T>(reported: T | null | undefined, current: T): T {
  return reported === null || reported === undefined ? current : reported;
}

/**
 * Merge a status-poll response back onto a video card record.
 *
 * Only fields the provider just reported are overwritten; everything else on
 * the card is preserved. Returns a new object (no mutation).
 *
 * Seedance 2.5 (D14): the status route also reports the metadata the gallery
 * renders — engine / mode / tier / resolution / requested duration — plus the
 * ACTUAL credits and USD once Enhancor bills the job, and the provider error
 * text on failure. Merging them here is what makes a card flip from
 * "Processing" straight to "Ready · 1,615.8 cr · $1.62" without a refetch.
 * Every one of those fields is optional: a HeyGen row, or a Seedance row read
 * before the migration, simply reports none of them and keeps what it had.
 */
export function applyStatusUpdate(
  video: GeneratedVideo,
  status: VideoStatusResponse
): GeneratedVideo {
  return {
    ...video,
    heygen_status: status.status,
    final_video_url: status.finalVideoUrl ?? video.final_video_url,
    thumbnail_url: status.thumbnailUrl ?? video.thumbnail_url,
    duration_seconds: keep(status.durationSeconds, video.duration_seconds),
    // ── Seedance 2.5 metadata (all optional) ──
    engine: keep(status.engine, video.engine),
    seedance_mode: keep(status.mode, video.seedance_mode),
    quality_tier: keep(status.qualityTier, video.quality_tier),
    resolution: keep(status.resolution, video.resolution),
    requested_duration: keep(status.requestedDuration, video.requested_duration),
    credits_cost: keep(status.creditsCost, video.credits_cost),
    processing_cost: keep(status.costUsd, video.processing_cost),
    error_message: keep(status.errorMessage, video.error_message),
    rerender_of: keep(status.rerenderOf, video.rerender_of),
  };
}

/**
 * A stable key describing the SET of in-flight videos in a list. Use as a
 * React effect dependency so the reconciliation poller re-subscribes only when
 * the set of generating videos actually changes (not on every list re-render),
 * and tears down entirely once nothing is in flight (empty string).
 */
export function inFlightKey(
  videos: ReadonlyArray<Pick<GeneratedVideo, "id" | "heygen_status">>
): string {
  return videos
    .filter((v) => isInFlight(v.heygen_status))
    .map((v) => v.id)
    .sort()
    .join(",");
}
