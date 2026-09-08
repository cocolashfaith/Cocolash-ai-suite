/**
 * Gallery / modal display labels for a generated video (D14).
 *
 * Pure and client-safe. Everything here has to survive TWO shapes of input:
 *
 *   1. A `generated_videos` row read BEFORE Harry runs
 *      `supabase/migrations/20260908_seedance25.sql` — none of the 2.5 columns
 *      exist, so `engine`, `quality_tier`, `credits_cost` … are all
 *      `undefined`. Those rows are Seedance 2.0 (or HeyGen) and must render
 *      exactly as they did before this feature landed.
 *   2. The extended `VideoStatusResponse` from `GET /api/seedance/[id]/status`
 *      (camelCase) — mapped through `statusToDisplay()` so the in-wizard
 *      progress card and the gallery share one set of labels.
 *
 * Rule of thumb encoded below: `null` means "known to be absent", `undefined`
 * means "not known" (pre-migration / partial payload). Only `null` is treated
 * as a hard "no".
 */

import {
  QUALITY_TIERS,
  engineLabel,
  isDraftTier,
  resolutionToQualityTier,
} from "@/lib/seedance/engines";
import { creditsToUsd, formatCredits, formatUsd } from "@/lib/seedance/pricing";
import { SEEDANCE_25_MODE_LABELS } from "@/lib/seedance/v25/types";
import type { Seedance25Mode } from "@/lib/seedance/v25/types";
import type { SeedanceResolution } from "@/lib/seedance/types";
import type {
  GeneratedVideo,
  HeyGenVideoStatus,
  QualityTier,
  SeedanceEngine,
  VideoPipeline,
  VideoStatusResponse,
} from "@/lib/types";

const EM_DASH = "—";

/**
 * The subset of a video record these labels need. `GeneratedVideo` satisfies
 * it; so does the object `statusToDisplay()` builds from a status poll.
 */
export interface VideoDisplayLike {
  pipeline?: VideoPipeline | null;
  heygen_status?: HeyGenVideoStatus | null;
  engine?: SeedanceEngine | null;
  seedance_mode?: string | null;
  quality_tier?: QualityTier | null;
  resolution?: string | null;
  requested_duration?: number | null;
  duration_seconds?: number | null;
  credits_cost?: number | null;
  processing_cost?: number | null;
  request_payload?: Record<string, unknown> | null;
  rerender_of?: string | null;
  error_message?: string | null;
  is_uncensored?: boolean | null;
}

/** "Seedance 2.5" / "Seedance 2.0" (the label a pre-migration row gets). */
export function videoEngineLabel(video: VideoDisplayLike): string {
  return engineLabel(video.engine ?? null);
}

/** "UGC", "Edit", "First + Last Frame" … 2.0 rows have no mode column → "UGC". */
export function videoModeLabel(video: VideoDisplayLike): string {
  const mode = video.seedance_mode;
  if (!mode) return SEEDANCE_25_MODE_LABELS.ugc;
  return SEEDANCE_25_MODE_LABELS[mode as Seedance25Mode] ?? mode;
}

/** "Draft 720p" / "Final 1080p"; derived from `resolution` when the tier is absent. */
export function videoTierLabel(video: VideoDisplayLike): string {
  if (video.quality_tier) return QUALITY_TIERS[video.quality_tier].label;
  const tier = tierFromResolution(video.resolution);
  return tier ? QUALITY_TIERS[tier].label : EM_DASH;
}

/** The raw output resolution ("720p") — shown next to the tier in the modal. */
export function videoResolutionLabel(video: VideoDisplayLike): string {
  if (video.resolution) return video.resolution;
  if (video.quality_tier) return QUALITY_TIERS[video.quality_tier].resolution;
  return EM_DASH;
}

/** "8s", or "Auto" while an Auto-duration job's real length is still unknown. */
export function videoDurationLabel(video: VideoDisplayLike): string {
  if (typeof video.duration_seconds === "number" && video.duration_seconds > 0) {
    return `${video.duration_seconds}s`;
  }
  if (video.requested_duration === -1) return "Auto";
  if (typeof video.requested_duration === "number" && video.requested_duration > 0) {
    return `${video.requested_duration}s`;
  }
  return EM_DASH;
}

/**
 * "1,615.8 cr · $1.62" once Enhancor reported the actual 2.5 credits;
 * "$3.08 est." for a 2.0 row (whose USD is our own estimate); "—" otherwise.
 */
export function videoCostLabel(video: VideoDisplayLike): string {
  const credits = numberOrNull(video.credits_cost);
  const usd = numberOrNull(video.processing_cost);
  if (credits !== null) {
    return `${formatCredits(credits)} cr · ${formatUsd(usd ?? creditsToUsd(credits))}`;
  }
  if (usd !== null) return `${formatUsd(usd)} est.`;
  return EM_DASH;
}

/** Just the ≈USD half — used where space is tight. */
export function videoUsdLabel(video: VideoDisplayLike): string {
  const usd = numberOrNull(video.processing_cost);
  if (usd !== null) return formatUsd(usd);
  const credits = numberOrNull(video.credits_cost);
  return credits !== null ? formatUsd(creditsToUsd(credits)) : EM_DASH;
}

/**
 * D3: a finished Seedance 2.5 DRAFT can be re-submitted at 1080p with the
 * identical prompt + inputs. Needs the stored request payload to replay, so a
 * row whose `request_payload` is explicitly null is not re-renderable.
 */
export function canRerenderAsFinal(video: VideoDisplayLike): boolean {
  if (video.pipeline != null && video.pipeline !== "seedance") return false;
  if (video.engine !== "2.5") return false;
  if (video.heygen_status !== "completed") return false;
  if (video.request_payload === null) return false;
  const tier = video.quality_tier ?? tierFromResolution(video.resolution);
  return isDraftTier(tier);
}

/** The tier a completed row would be re-rendered INTO (always Final 1080p). */
export const RERENDER_TARGET_TIER: QualityTier = "final-1080p";

/**
 * Adapt `GET /api/seedance/[id]/status` (camelCase, all-optional 2.5 fields)
 * to the record shape the labels above read.
 */
export function statusToDisplay(status: VideoStatusResponse): VideoDisplayLike {
  return {
    pipeline: "seedance",
    heygen_status: status.status,
    engine: status.engine ?? null,
    seedance_mode: status.mode ?? null,
    quality_tier: status.qualityTier ?? null,
    resolution: status.resolution ?? null,
    requested_duration: status.requestedDuration ?? null,
    duration_seconds: status.durationSeconds ?? null,
    credits_cost: status.creditsCost ?? null,
    processing_cost: status.costUsd ?? null,
    error_message: status.errorMessage ?? null,
    rerender_of: status.rerenderOf ?? null,
  };
}

/** Narrow a `GeneratedVideo` (or partial) for components that only need labels. */
export function toDisplay(video: Partial<GeneratedVideo>): VideoDisplayLike {
  return video as VideoDisplayLike;
}

// ── internals ────────────────────────────────────────────────

function tierFromResolution(resolution: string | null | undefined): QualityTier | null {
  if (resolution === "480p" || resolution === "720p" || resolution === "1080p") {
    return resolutionToQualityTier(resolution as SeedanceResolution);
  }
  return null;
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
