/**
 * Seedance 2.0 API — Type Definitions
 *
 * Types for the Kie.ai Seedance 2.0 API used for UGC-style video generation.
 * Covers task creation, status polling, and app-level video request types.
 */

import type { CampaignType, ScriptTone, VideoDuration } from "../types";

// ── Seedance API Request Types ───────────────────────────────

export type SeedanceAspectRatio = "9:16" | "1:1" | "16:9";
export type SeedanceResolution = "480p" | "720p";
export type SeedanceDuration = "5" | "8" | "10" | "15";

export interface SeedanceInput {
  prompt: string;
  first_frame_url?: string;
  last_frame_url?: string;
  reference_image_urls?: string[];
  reference_video_urls?: string[];
  reference_audio_urls?: string[];
  aspect_ratio: SeedanceAspectRatio;
  resolution: SeedanceResolution;
  duration: SeedanceDuration;
  fixed_lens?: boolean;
  generate_audio?: boolean;
}

export interface SeedanceCreateTaskRequest {
  model: "bytedance/seedance-2";
  callBackUrl?: string;
  input: SeedanceInput;
}

// ── Seedance API Response Types ──────────────────────────────

export type SeedanceTaskStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface SeedanceTaskResponse {
  taskId: string;
  status: SeedanceTaskStatus;
  output?: {
    video_url?: string;
  };
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
  fixedLens: boolean;
  generateAudio: boolean;
}

// ── Cost Constants ───────────────────────────────────────────

export const SEEDANCE_COSTS = {
  COST_PER_SECOND_720P_NO_VIDEO: 0.205,
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
