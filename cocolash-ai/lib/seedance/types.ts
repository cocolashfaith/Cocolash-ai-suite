/**
 * Seedance 2.0 API — Type Definitions
 *
 * Types for the Enhancor.ai Seedance 2.0 Full Access API used for
 * UGC-style video generation.
 * Covers task creation, status polling, and app-level video request types.
 */

import type { CampaignType, ScriptTone, VideoDuration } from "../types";

// ── Seedance API Request Types ───────────────────────────────

export type SeedanceAspectRatio =
  | "9:16"
  | "1:1"
  | "16:9"
  | "4:3"
  | "3:4"
  | "21:9";
export type SeedanceResolution = "480p" | "720p" | "1080p";
export type SeedanceDuration = "5" | "8" | "10" | "15";
export type SeedanceGenerationType = "text-to-video" | "image-to-video";
export type SeedanceMode =
  | "ugc"
  | "multi_reference"
  | "multi_frame"
  | "lipsyncing"
  | "first_n_last_frames";

export interface SeedanceMultiFramePrompt {
  prompt: string;
  duration: number;
}

export interface SeedanceInput {
  type?: SeedanceGenerationType;
  mode?: SeedanceMode;
  prompt?: string;
  first_frame_url?: string;
  last_frame_url?: string;
  reference_image_urls?: string[];
  reference_video_urls?: string[];
  reference_audio_urls?: string[];
  products?: string[];
  influencers?: string[];
  images?: string[];
  videos?: string[];
  audios?: string[];
  first_frame_image?: string;
  last_frame_image?: string;
  lipsyncing_audio?: string;
  multi_frame_prompts?: SeedanceMultiFramePrompt[];
  aspect_ratio: SeedanceAspectRatio;
  resolution: SeedanceResolution;
  duration: SeedanceDuration;
  full_access?: boolean;
  fast_mode?: boolean;
  fixed_lens?: boolean;
  generate_audio?: boolean;
}

export interface SeedanceCreateTaskRequest {
  type: SeedanceGenerationType;
  mode?: SeedanceMode;
  prompt?: string;
  duration?: SeedanceDuration;
  resolution: SeedanceResolution;
  aspect_ratio: SeedanceAspectRatio;
  webhook_url: string;
  full_access?: boolean;
  fast_mode?: boolean;
  products?: string[];
  influencers?: string[];
  images?: string[];
  videos?: string[];
  audios?: string[];
  first_frame_image?: string;
  last_frame_image?: string;
  lipsyncing_audio?: string;
  multi_frame_prompts?: SeedanceMultiFramePrompt[];
}

// ── Seedance API Response Types ──────────────────────────────

export type SeedanceTaskStatus =
  | "PENDING"
  | "IN_QUEUE"
  | "IN_PROGRESS"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface SeedanceTaskResponse {
  taskId: string;
  status: SeedanceTaskStatus;
  output?: {
    video_url?: string;
    thumbnail_url?: string;
  };
  error?: string;
}

export interface SeedanceQueueResponse {
  requestId?: string;
  request_id?: string;
  id?: string;
  data?: {
    requestId?: string;
    request_id?: string;
    id?: string;
  };
}

export interface SeedanceWebhookPayload {
  request_id?: string;
  requestId?: string;
  status?: SeedanceTaskStatus | string;
  result?: string;
  thumbnail?: string;
  error?: string;
}

// ── App-Level Types ──────────────────────────────────────────

export type SeedanceAudioMode = "script-in-prompt" | "uploaded-audio";

export interface SeedanceVideoRequest {
  scriptId?: string;
  campaignType: CampaignType;
  tone: ScriptTone;
  duration: VideoDuration;
  personImageUrl: string;
  productImageUrl: string;
  audioMode: SeedanceAudioMode;
  audioUrl?: string;
  aspectRatio: SeedanceAspectRatio;
  seedanceDuration?: SeedanceDuration;
  resolution?: SeedanceResolution;
  generationType?: SeedanceGenerationType;
  seedanceMode?: SeedanceMode;
  fullAccess?: boolean;
  fastMode?: boolean;
  products?: string[];
  influencers?: string[];
  images?: string[];
  videos?: string[];
  audios?: string[];
  firstFrameImage?: string;
  lastFrameImage?: string;
  lipsyncingAudio?: string;
  multiFramePrompts?: SeedanceMultiFramePrompt[];
  fixedLens: boolean;
  generateAudio: boolean;
}

// ── Cost Constants ───────────────────────────────────────────

export const SEEDANCE_COSTS = {
  COST_PER_SECOND_720P_NO_VIDEO: 0.205,
  COST_PER_SECOND_1080P_NO_VIDEO: 0.205,
  SCRIPT_GENERATION: 0.016,
  IMAGE_GENERATION: 0.04,
  POST_PROCESSING: 0.015,
} as const;

// ── Custom Error Class ───────────────────────────────────────

export class SeedanceError extends Error {
  public readonly statusCode: number;
  public readonly apiError: string | null;

  constructor(message: string, statusCode: number, apiError?: string | null) {
    super(message);
    this.name = "SeedanceError";
    this.statusCode = statusCode;
    this.apiError = apiError ?? null;
  }
}
