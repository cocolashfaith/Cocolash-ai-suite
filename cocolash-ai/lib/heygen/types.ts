/**
 * HeyGen API — Type Definitions
 *
 * Types for the HeyGen v2 API used for avatar video generation.
 * Covers photo avatars, video generation, voice listing, and status polling.
 */

// ── HeyGen API Response Wrapper ──────────────────────────────
export interface HeyGenResponse<T> {
  error: string | null;
  data: T;
}

/** Legacy response format (v1 endpoints like upload asset) */
export interface HeyGenLegacyResponse<T> {
  code: number;
  data: T;
  msg: string | null;
  message: string | null;
}

// ── Upload Asset ──────────────────────────────────────────────
export interface UploadAssetResult {
  id: string;
  name: string;
  file_type: string;
  folder_id: string;
  meta: unknown;
  created_ts: number;
  url: string;
  image_key: string | null;
}

// ── Photo Avatar Group ────────────────────────────────────────
export interface PhotoAvatarGroup {
  id: string;
  name: string;
  status?: string;
}

/**
 * Result of creating a photo avatar (version-agnostic across v2/v3).
 * `talking_photo_id` carries the v3 `avatar_id` (the look id). `supportedEngines`
 * mirrors the look's `supported_api_engines` so the caller can decide whether
 * Avatar V is allowed for this look — empty on v2 (Avatar V is v3-only).
 */
export interface PhotoAvatarResult {
  talking_photo_id: string;
  avatar_url: string;
  group_id: string;
  supportedEngines: string[];
}

export interface PhotoAvatarLook {
  id: string;
  image_url: string;
  talking_photo_id: string;
}

// ── Talking Photo (kept for backward compat) ──────────────────
export interface TalkingPhoto {
  talking_photo_id: string;
  talking_photo_url: string;
}

// ── Video Generation Parameters ───────────────────────────────

export interface VideoGenCharacter {
  type: "talking_photo";
  talking_photo_id: string;
  talking_style?: "stable" | "expressive";
  expression?: "default" | "happy";
  scale?: number;
  offset?: { x: number; y: number };
  matting?: boolean;
  use_avatar_iv_model?: boolean;
  prompt?: string;
  keep_original_prompt?: boolean;
  super_resolution?: boolean;
}

export interface VideoGenVoiceText {
  type: "text";
  voice_id: string;
  input_text: string;
  speed?: number;
  pitch?: number;
  emotion?: "Excited" | "Friendly" | "Serious" | "Soothing" | "Broadcaster";
}

export interface VideoGenVoiceAudio {
  type: "audio";
  audio_asset_id: string;
}

export type VideoGenVoice = VideoGenVoiceText | VideoGenVoiceAudio;

export interface VideoGenBackgroundColor {
  type: "color";
  value: string;
}

export interface VideoGenBackgroundImage {
  type: "image";
  url: string;
}

export type VideoGenBackground =
  | VideoGenBackgroundColor
  | VideoGenBackgroundImage;

export interface VideoGenInput {
  character: VideoGenCharacter;
  voice: VideoGenVoice;
  background?: VideoGenBackground;
}

export interface VideoGenDimension {
  width: number;
  height: number;
}

export interface VideoGenParams {
  video_inputs: VideoGenInput[];
  dimension?: VideoGenDimension;
  caption?: boolean;
  title?: string;
  callback_id?: string;
}

export interface VideoGenResult {
  video_id: string;
}

// ── HeyGen v3 (Avatar IV/V, resolution tiers) ─────────────────

export type HeyGenResolution = "720p" | "1080p" | "4k";

/**
 * Which v3 rendering engine to request on `POST /v3/videos`.
 * - `avatar_iv` — the v3 default (omit the `engine` field). Supports
 *   `expressiveness` + `motion_prompt` on photo avatars.
 * - `avatar_v` — HeyGen's latest engine (cross-reference animation, better
 *   motion + lip-sync). Sent as `engine:{type:"avatar_v"}`. REJECTS
 *   `expressiveness` (Avatar IV-only) and is eligibility-gated per look via
 *   `supported_api_engines`.
 */
export type HeyGenEngine = "avatar_iv" | "avatar_v";

/**
 * Params for the v3 `POST /v3/videos` photo-avatar path. Exactly one voice
 * source is used: `audioAssetId` (our ElevenLabs audio — keeps lip-sync in
 * sync with our burned captions) OR `voiceId` + `script`.
 *
 * NOTE: we intentionally do NOT send a `caption` field — captions are burned
 * by our own Shotstack pipeline downstream, unchanged.
 */
export interface V3VideoGenParams {
  avatarId: string;
  audioAssetId?: string;
  voiceId?: string;
  script?: string;
  resolution: HeyGenResolution;
  aspectRatio: "9:16" | "1:1" | "16:9";
  /**
   * v3 rendering engine. `avatar_v` → `engine:{type:"avatar_v"}` and the client
   * DROPS `expressiveness` (rejected by the API on Avatar V). Omitted/`avatar_iv`
   * keeps today's Avatar IV behavior. When `avatar_v` is requested but the look
   * is ineligible (400), the client transparently retries on Avatar IV.
   */
  engine?: HeyGenEngine;
  /** Photo-avatar expressiveness (Avatar IV only — ignored when engine is avatar_v). */
  expressiveness?: "high" | "medium" | "low";
  /** Natural-language body-motion / gesture prompt (photo avatars, both engines). */
  motionPrompt?: string;
  title?: string;
  /**
   * Idempotency key (e.g. a UUID) so a `withRetry` replay never submits a second
   * paid render. The client namespaces it per engine to avoid a failed Avatar V
   * attempt being replayed on the Avatar IV fallback.
   */
  idempotencyKey?: string;
}

// ── Video Status ──────────────────────────────────────────────

export type HeyGenVideoStatusValue =
  | "pending"
  | "waiting"
  | "processing"
  | "completed"
  | "failed";

export interface VideoStatusResult {
  video_id: string;
  status: HeyGenVideoStatusValue;
  video_url?: string;
  video_url_caption?: string;
  thumbnail_url?: string;
  duration?: number;
  caption_url?: string;
  error?: string;
}

// ── Voices ────────────────────────────────────────────────────

export interface HeyGenVoice {
  voice_id: string;
  language: string;
  gender: string;
  name: string;
  preview_audio: string;
  support_pause: boolean;
  emotion_support: boolean;
  support_interactive_avatar?: boolean;
  support_locale?: boolean;
}

export interface VoiceListResult {
  voices: HeyGenVoice[];
}

// ── Aspect Ratio → Dimensions Map ────────────────────────────

export const VIDEO_DIMENSIONS: Record<string, VideoGenDimension> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

// ── Custom Error Class ────────────────────────────────────────

export class HeyGenError extends Error {
  public readonly statusCode: number;
  public readonly apiError: string | null;

  constructor(message: string, statusCode: number, apiError?: string | null) {
    super(message);
    this.name = "HeyGenError";
    this.statusCode = statusCode;
    this.apiError = apiError ?? null;
  }
}
