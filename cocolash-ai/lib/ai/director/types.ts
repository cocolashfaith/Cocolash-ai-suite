/**
 * Seedance Director — shared types for the v4.0 mode-first prompt-writer.
 *
 * The Director takes the user's script + campaign + per-mode media inputs and
 * returns a Seedance-optimized prompt (or array of segment prompts for
 * multi_frame mode). Each Enhancor mode has its own dedicated system prompt
 * grounded in the SeeDance 2 best-practices guide.
 */

import type { CampaignType, ScriptTone } from "@/lib/types";
import type { SeedanceMultiFramePrompt } from "@/lib/seedance/types";

export type DirectorMode =
  | "ugc"
  | "multi_reference"
  | "multi_frame"
  | "lipsyncing"
  | "first_n_last_frames"
  | "text_to_video";

export interface ImageRoleRef {
  url: string;
  /** Optional role label — used by the multi_reference prompt-writer. */
  role?: "appearance" | "product" | "background" | "style";
  /** Free-text caption to disambiguate the asset for the model. */
  note?: string;
}

export interface DirectorInput {
  mode: DirectorMode;
  campaignType: CampaignType;
  tone: ScriptTone;
  /** Total clip duration in seconds (5, 8, 10, or 15). */
  durationSeconds: number;
  /** Aspect ratio (e.g. "9:16", "16:9"). Influences shot framing language. */
  aspectRatio: string;
  /**
   * The script the AI should speak in the video. Required for ugc, multi_reference,
   * multi_frame, lipsyncing, first_n_last_frames. Optional for text_to_video.
   */
  script?: string;

  /** UGC / lipsyncing / first_n_last_frames primary subject. */
  composedPersonProductImage?: ImageRoleRef;

  /** multi_reference: N labeled reference images. */
  referenceImages?: ImageRoleRef[];

  /** multi_reference / multi_frame / lipsyncing / first_n_last_frames: optional motion ref. */
  referenceVideoUrl?: string;

  /** lipsyncing / multi_reference: optional audio ref. */
  referenceAudioUrl?: string;

  /** first_n_last_frames: required first frame (UGC composed image OR upload). */
  firstFrameImage?: ImageRoleRef;

  /** first_n_last_frames: NanoBanana-generated last frame (passed back from director). */
  lastFrameImage?: ImageRoleRef;

  /** multi_frame: how many segments to plan (4-15s total). */
  multiFrameSegmentCount?: number;

  /**
   * multi_frame: free-text description of subject + product for continuity.
   * Director embeds this in every segment prompt for textual anchoring (Phase 26, D-26-01).
   */
  subjectBrief?: string;

  /**
   * text_to_video: free-text scene description from the user. The director
   * converts this into an optimized T2V Seedance prompt.
   */
  sceneDescription?: string;

  /** Free-text overrides from the user — appended verbatim to the system prompt. */
  userInstructions?: string;
}

export interface DirectorPromptOutput {
  /** The prompt body sent to Enhancor. For multi_frame this is empty (use segments). */
  prompt: string;
  /** multi_frame mode only — array of {prompt, duration} segments summing 4-15s. */
  multiFramePrompts?: SeedanceMultiFramePrompt[];
  /** Diagnostics — what the model was told. Surfaced by /admin/prompts viewer. */
  diagnostics: {
    model: string;
    systemPromptId: string;
    inputSummary: string;
    rawResponse: string;
    durationMs: number;
  };
}

export interface NanoBananaDirectorInput {
  /** First frame image (URL accessible by the AI). */
  firstFrameImageUrl: string;
  /** User's free-text description of the destination scene. */
  destinationDescription: string;
  /** Campaign type — affects pacing/tone hints. */
  campaignType: CampaignType;
  /** Aspect ratio — propagates to NanoBanana for consistency with first frame. */
  aspectRatio: string;
}

export interface NanoBananaDirectorOutput {
  /** The composed image generation prompt that goes to Gemini/NanoBanana. */
  imagePrompt: string;
  diagnostics: {
    model: string;
    systemPromptId: string;
    inputSummary: string;
    rawResponse: string;
    durationMs: number;
  };
}
