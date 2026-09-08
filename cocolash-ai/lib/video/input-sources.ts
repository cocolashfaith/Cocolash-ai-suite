/**
 * lib/video/input-sources.ts — "From your videos" source selection (D6).
 *
 * The wizard lets a user reuse a finished render as a Seedance 2.5 reference
 * video. That is only safe when the URL is still ALIVE: of the 155
 * `generated_videos` rows, 59 finals live on the closed Cloudinary account
 * `dtnvppaty` (401 on every request) and the HeyGen `files*.heygen.ai` links
 * are expired signed URLs. Handing either to Enhancor produces a job that
 * fails minutes later with an opaque download error, so they are filtered out
 * here — the single place both the API route and any future consumer use.
 *
 * Pure module: no DB, no fetch. `app/api/videos/inputs/route.ts` supplies rows.
 */

import { engineLabel } from "@/lib/seedance/engines";
import type { GeneratedVideo, SeedanceEngine } from "@/lib/types";

/**
 * Known-dead media sources, verified live 2026-09-08.
 *   - `/dtnvppaty/` — closed Cloudinary cloud; every asset returns 401.
 *   - `files.heygen.ai` / `files2.heygen.ai` — expired signed URLs (403).
 * Live Cloudinary clouds (`dyianrt0w`, `dum01wgok`) and the CloudFront
 * distribution are unaffected.
 */
export const DEAD_VIDEO_HOST_RULES = {
  hosts: ["files.heygen.ai", "files2.heygen.ai"] as const,
  pathFragments: ["/dtnvppaty/"] as const,
} as const;

/** True when the URL is unusable: not public https, or on a known-dead source. */
export function isDeadMediaUrl(value: string | null | undefined): boolean {
  if (!value) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return true;
  }
  if (url.protocol !== "https:") return true;

  const host = url.hostname.toLowerCase();
  if (
    DEAD_VIDEO_HOST_RULES.hosts.some(
      (dead) => host === dead || host.endsWith(`.${dead}`)
    )
  ) {
    return true;
  }
  return DEAD_VIDEO_HOST_RULES.pathFragments.some((fragment) =>
    url.pathname.includes(fragment)
  );
}

/**
 * The best URL a viewer (and Enhancor) can actually fetch: the polished final
 * when it is alive, otherwise the raw provider output. Null when neither is.
 */
export function pickPlayableUrl(
  video: Pick<GeneratedVideo, "final_video_url" | "raw_video_url">
): string | null {
  for (const candidate of [video.final_video_url, video.raw_video_url]) {
    if (candidate && !isDeadMediaUrl(candidate)) return candidate;
  }
  return null;
}

export interface VideoInputCandidate {
  id: string;
  /** Public https URL, guaranteed alive at list time. */
  url: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
  pipeline: "seedance" | "heygen";
  /** Null for HeyGen rows — the `engine` column is stamped '2.0' by default. */
  engine: SeedanceEngine | null;
  mode: string | null;
  /** e.g. "Seedance 2.5 · ugc · 12s · 2026-09-01" */
  label: string;
}

function isoDate(createdAt: string | null | undefined): string {
  if (!createdAt) return "";
  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

/**
 * Map a `generated_videos` row to a picker entry, or null when the row has no
 * live URL. `pipeline` is checked before `engine` because HeyGen rows also
 * carry the NOT NULL DEFAULT '2.0' engine value.
 */
export function toVideoInputCandidate(
  video: GeneratedVideo
): VideoInputCandidate | null {
  const url = pickPlayableUrl(video);
  if (!url) return null;

  const isSeedance = video.pipeline === "seedance";
  const engine: SeedanceEngine | null = isSeedance ? video.engine ?? "2.0" : null;
  const mode = isSeedance
    ? video.seedance_mode ?? (video.background_type ? String(video.background_type) : null)
    : video.background_type
      ? String(video.background_type)
      : null;

  const duration =
    typeof video.duration_seconds === "number" && video.duration_seconds > 0
      ? video.duration_seconds
      : null;

  const label = [
    isSeedance ? engineLabel(engine) : "HeyGen",
    mode,
    duration !== null ? `${duration}s` : null,
    isoDate(video.created_at),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const thumbnailUrl =
    video.thumbnail_url && !isDeadMediaUrl(video.thumbnail_url)
      ? video.thumbnail_url
      : null;

  return {
    id: video.id,
    url,
    thumbnailUrl,
    durationSeconds: duration,
    createdAt: video.created_at,
    pipeline: isSeedance ? "seedance" : "heygen",
    engine,
    mode,
    label,
  };
}
