/**
 * Seedance 2.5 (Enhancor) — wire-level types and constants.
 *
 * Source of truth: docs/seedance-2.5/01-API-REFERENCE.md (pasted Enhancor
 * docs + POC proven 2026-09-08). Endpoint base + capability flags live in
 * lib/seedance/engines.ts; validation lives in lib/seedance/v25/schema.ts;
 * credit pricing lives in lib/seedance/pricing.ts.
 *
 * This module is dependency-free (types + consts only) so it is safe to
 * import from client components, API routes and tests alike.
 */

import type { SeedanceResolution } from "../types";

// ── Modes ────────────────────────────────────────────────────

/** All nine Seedance 2.5 modes, in the order the UI lists them (ugc first). */
export const SEEDANCE_25_MODES = [
  "ugc",
  "text_to_video",
  "multi_reference",
  "first_n_last_frames",
  "multi_frame",
  "edit",
  "extend",
  "lipsyncing",
  "voice_clone",
] as const;

export type Seedance25Mode = (typeof SEEDANCE_25_MODES)[number];

export function isSeedance25Mode(value: unknown): value is Seedance25Mode {
  return (
    typeof value === "string" &&
    (SEEDANCE_25_MODES as readonly string[]).includes(value)
  );
}

// ── Enumerations ─────────────────────────────────────────────

export const SEEDANCE_25_ASPECT_RATIOS = [
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "adaptive",
] as const;
export type Seedance25AspectRatio = (typeof SEEDANCE_25_ASPECT_RATIOS)[number];

export const SEEDANCE_25_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type Seedance25Resolution = SeedanceResolution; // identical set

export const SEEDANCE_25_OUTPUT_FORMATS = ["mp4", "mov"] as const;
export type Seedance25OutputFormat = (typeof SEEDANCE_25_OUTPUT_FORMATS)[number];

export const SEEDANCE_25_BITRATE_MODES = ["standard", "high"] as const;
export type Seedance25BitrateMode = (typeof SEEDANCE_25_BITRATE_MODES)[number];

/** `duration: -1` → Enhancor picks the length ("Auto"). Required for `edit`. */
export const AUTO_DURATION = -1;

// ── Limits (01-API-REFERENCE.md "Limits") ─────────────────────

export const SEEDANCE_25_LIMITS = {
  durationMin: 4,
  durationMax: 30,
  maxImages: 30,
  maxVideos: 10,
  maxAudios: 10,
  /** ugc: products[] + influencers[] combined. */
  maxUgcRefs: 30,
  /** Combined input video length, seconds (not enforceable server-side; UI hint). */
  maxCombinedVideoSeconds: 30,
  maxCombinedAudioSeconds: 30,
  lipsyncAudioMaxSeconds: 30,
  maxMultiFrameSegments: 10,
  maxPromptChars: 6000,
} as const;

// ── Per-mode rules (used by schema + UI) ─────────────────────

/** Enhancor forces `aspect_ratio: "adaptive"` for these modes (output follows the input). */
export const SEEDANCE_25_ADAPTIVE_ONLY_MODES: readonly Seedance25Mode[] = [
  "edit",
  "extend",
  "first_n_last_frames",
];

/** Reduced credit rate applies when these modes carry `videos[]` (billable = input + output seconds). */
export const SEEDANCE_25_REDUCED_RATE_MODES: readonly Seedance25Mode[] = [
  "multi_reference",
  "edit",
  "extend",
  "multi_frame",
];

/** Enhancor's default `output_format` is mov for these modes (mp4 elsewhere). */
export const SEEDANCE_25_MOV_DEFAULT_MODES: readonly Seedance25Mode[] = ["edit", "extend"];

/** `videos[]` is REQUIRED (≥1) for these modes. */
export const SEEDANCE_25_VIDEO_REQUIRED_MODES: readonly Seedance25Mode[] = ["edit", "extend"];

/** `images[]` (≥1) + `lipsyncing_audio` are REQUIRED for these modes. */
export const SEEDANCE_25_LIPSYNC_MODES: readonly Seedance25Mode[] = ["lipsyncing", "voice_clone"];

/** Human labels for the mode selector, badges and gallery metadata. */
export const SEEDANCE_25_MODE_LABELS: Record<Seedance25Mode, string> = {
  ugc: "UGC",
  text_to_video: "Text-to-Video",
  multi_reference: "Multi-Reference",
  first_n_last_frames: "First + Last Frame",
  multi_frame: "Multi-Frame",
  edit: "Edit",
  extend: "Extend",
  lipsyncing: "Lip-Sync",
  voice_clone: "Voice Clone",
};

// ── Request shapes ───────────────────────────────────────────

export interface Seedance25MultiFramePrompt {
  prompt: string;
  /** Whole seconds; segment durations must sum to 4–30. */
  duration: number;
}

/**
 * A VALIDATED + NORMALIZED 2.5 request (output of Seedance25RequestSchema).
 * Field names are the Enhancor wire names; `duration` is numeric here and is
 * stringified only when the /queue body is built (lib/seedance/v25/client.ts).
 * `webhook_url` is intentionally NOT part of this shape — the server appends it
 * at submit time and it is never persisted (it carries the webhook token).
 */
export interface Seedance25Request {
  mode: Seedance25Mode;
  /** Required for every mode except multi_frame (segments carry their own prompts). */
  prompt?: string;
  /** 4–30, or -1 (Auto). Always -1 for `edit`; sum of segments for `multi_frame`. */
  duration: number;
  resolution: Seedance25Resolution;
  aspect_ratio: Seedance25AspectRatio;
  images?: string[];
  videos?: string[];
  audios?: string[];
  multi_frame_prompts?: Seedance25MultiFramePrompt[];
  lipsyncing_audio?: string;
  products?: string[];
  influencers?: string[];
  first_frame_image?: string;
  last_frame_image?: string;
  pass_faces: boolean;
  is_uncensored: boolean;
  output_format: Seedance25OutputFormat;
  bitrate_mode: Seedance25BitrateMode;
}

/** The exact JSON body POSTed to `${SEEDANCE_25_API_BASE}/queue`. */
export interface Seedance25QueuePayload
  extends Omit<Seedance25Request, "duration"> {
  /** Enhancor accepts string|number; we always send the string form the POC proved ("6"). */
  duration?: string;
  webhook_url: string;
}

export interface Seedance25QueueResponse {
  success?: boolean;
  requestId?: string;
  request_id?: string;
  id?: string;
  error?: string | { message?: string };
  message?: string;
  data?: { requestId?: string; request_id?: string; id?: string };
}

// ── Status / webhook shapes ──────────────────────────────────

export type Seedance25TaskStatus =
  | "PENDING"
  | "IN_QUEUE"
  | "IN_PROGRESS"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

/**
 * Raw payload delivered to POST /api/seedance/webhook AND returned by
 * POST /status. Both carry the same keys; /status adds `success`.
 * Completed: {request_id, status:"COMPLETED", result, thumbnail?, cost}
 * Failed:    {request_id, status:"FAILED", error}
 * May be delivered MORE THAN ONCE for the same request_id — dedupe on first.
 */
export interface Seedance25CallbackPayload {
  success?: boolean;
  request_id?: string;
  requestId?: string;
  status?: string;
  result?: string;
  video_url?: string;
  thumbnail?: string;
  thumbnail_url?: string;
  /** Credits charged (e.g. 1615.8). Number in practice; tolerate numeric strings. */
  cost?: number | string;
  error?: string | { message?: string } | null;
}

/** Normalized result used by the webhook route, the status route and completion. */
export interface Seedance25TaskResult {
  requestId: string;
  status: Seedance25TaskStatus;
  resultUrl?: string;
  thumbnailUrl?: string;
  /** Credits (already numeric). Undefined when the provider omitted it. */
  cost?: number;
  error?: string;
}
