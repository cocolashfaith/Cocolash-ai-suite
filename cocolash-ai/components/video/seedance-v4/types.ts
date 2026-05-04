/**
 * Seedance v4 wizard — shared state across the three steps.
 *
 * The wizard's mental model:
 *   Step 1 — Script + Mode + Campaign (locks `mode` early so Step 2 can render
 *     the right inputs and Step 3 can pick the right Director prompt).
 *   Step 2 — Mode-specific inputs (different per mode). Produces the assets
 *     the Director needs.
 *   Step 3 — Director writes the Seedance prompt (Claude Opus 4.7 via /api/
 *     seedance/director). User reviews / edits / approves. Approve → submit
 *     to /api/seedance/generate.
 */

import type {
  CampaignType,
  ScriptResult,
  ScriptTone,
  VideoDuration,
} from "@/lib/types";
import type { DirectorMode } from "@/lib/ai/director/types";

export type SeedanceV4Mode = DirectorMode;

export interface SeedanceV4WizardState {
  // Step 1
  campaignType: CampaignType;
  tone: ScriptTone;
  duration: VideoDuration;
  mode: SeedanceV4Mode;
  script: ScriptResult | null;
  scriptText: string;
  scriptId?: string;

  // Step 2 — mode-specific inputs (only the ones for the chosen mode are populated)
  /** UGC composed image (avatar already holding product, single image)
   *  OR the avatar-only image when toggle is off. */
  ugcComposedImageUrl?: string;
  /** UGC: was Gemini compose run? false = avatar-only (toggle off). */
  ugcWasComposed?: boolean;
  /** UGC toggle-off path only — the separate product image that goes
   *  alongside the avatar to Seedance as a second reference. */
  ugcSeparateProductUrl?: string;

  /** multi_reference: array of {url, role} */
  multiReferenceImages?: Array<{
    url: string;
    role: "appearance" | "product" | "background" | "style";
  }>;
  multiReferenceVideoUrl?: string;
  multiReferenceAudioUrl?: string;
  multiReferenceUserInstructions?: string;

  /** lipsyncing: image + REQUIRED audio */
  lipsyncImageUrl?: string;
  lipsyncAudioUrl?: string;
  lipsyncVideoUrl?: string;

  /** first_n_last_frames: first frame + AI-generated last frame */
  firstFrameUrl?: string;
  lastFrameDescription?: string;
  lastFrameUrl?: string;
  lastFramePrompt?: string;

  /** text_to_video: just a description */
  t2vSceneDescription?: string;

  /** multi_frame: AI-proposed editable segments */
  multiFrameReferenceImages?: Array<{ url: string; role: string }>;

  // Step 3 — Director output (one of the two will be populated based on mode)
  directorPrompt?: string;
  directorMultiFramePrompts?: Array<{ prompt: string; duration: number }>;
  directorDiagnostics?: {
    model: string;
    systemPromptId: string;
    inputSummary: string;
    rawResponse: string;
    durationMs: number;
  };

  // Generation (Enhancor /queue parameters)
  aspectRatio: "9:16" | "16:9" | "3:4" | "4:3";
  resolution: "480p" | "720p" | "1080p";
  fastMode: boolean;

  /** Monotonically increments every time an upstream input changes. Step 3
   *  tracks the version of the inputs the Director was last run on; if the
   *  version moves forward, the prompt is stale and re-generated. */
  inputsVersion: number;
  /** Set when Step 3 finishes a Director call — captures inputsVersion at
   *  that moment so we can detect divergence on re-entry. */
  directorPromptVersion?: number;
}

export const DEFAULT_V4_STATE: SeedanceV4WizardState = {
  campaignType: "product-showcase",
  tone: "casual",
  duration: 15,
  mode: "ugc",
  script: null,
  scriptText: "",
  aspectRatio: "9:16",
  resolution: "720p",
  fastMode: false,
  inputsVersion: 0,
};
