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

export interface VideoGenVoice {
  type: "text";
  voice_id: string;
  input_text: string;
  speed?: number;
  pitch?: number;
  emotion?: "Excited" | "Friendly" | "Serious" | "Soothing" | "Broadcaster";
}

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
