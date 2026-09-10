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
  QualityTier,
  ScriptResult,
  ScriptTone,
  SeedanceEngine,
} from "@/lib/types";
import type { DirectorMode } from "@/lib/ai/director/types";
import type { ProductFacts } from "@/lib/ai/director/product-fact-extractor";
import type {
  Seedance25AspectRatio,
  Seedance25BitrateMode,
  Seedance25OutputFormat,
} from "@/lib/seedance/v25/types";

/** All nine Seedance 2.5 modes (2.0 offers the first six). */
export type SeedanceV4Mode = DirectorMode;

export type DurationMode = "fixed" | "auto";

export interface SeedanceV4WizardState {
  // ── Engine + quality (Seedance 2.5, D1/D3/D9/D10) ────────────────
  /** Which Enhancor endpoint to submit to. Default "2.5" (D1). */
  engine: SeedanceEngine;
  /** Draft/Final tier → resolution (lib/seedance/engines.ts QUALITY_TIERS). Source of truth for `resolution` on 2.5. */
  qualityTier: QualityTier;
  /** "auto" ⇒ submit duration -1 (2.5 only). `edit` is always auto. */
  durationMode: DurationMode;
  /** 2.5 `pass_faces` (default ON). The 2.0 path keeps using `fullAccess`. */
  passFaces: boolean;
  /** 2.5 `is_uncensored` — "Unrestricted content (NSFW)", default OFF. */
  isUncensored: boolean;
  /** 2.5 `output_format`; undefined ⇒ engine default (mov for edit/extend, else mp4). */
  outputFormat?: Seedance25OutputFormat;
  /** 2.5 `bitrate_mode`, default "standard". */
  bitrateMode: Seedance25BitrateMode;

  // ── Multi-select inputs (D8) — 2.5 arrays; the single-value keys below stay for 2.0 ──
  /** UGC: several influencer images (products + influencers ≤ 30). */
  ugcInfluencerImageUrls: string[];
  /** images[] for multi_reference / lipsyncing / voice_clone / edit / extend / multi_frame (≤ 30). */
  inputImageUrls: string[];
  /** videos[] for multi_reference / edit / extend / multi_frame (≤ 10). */
  inputVideoUrls: string[];
  /** audios[] for multi_reference / edit / extend / multi_frame (≤ 10). */
  inputAudioUrls: string[];
  /** edit / extend: what to change or how to continue (feeds the Director). */
  editInstruction?: string;
  /** Set once the global video defaults (GET /api/settings/video) were applied to a fresh wizard. */
  settingsApplied?: boolean;

  // Step 1: Script + Settings
  campaignType: CampaignType;
  tone: ScriptTone;
  /** Seedance clip duration in seconds — 4–30 on 2.5 (ignored when durationMode === "auto"), 4–15 on 2.0. Script is sized to this. */
  duration: number;
  mode: SeedanceV4Mode;
  script: ScriptResult | null;
  scriptText: string;
  scriptId?: string;

  // Step 1: Settings panel (D-34-09)
  fullAccess?: boolean; // "Pass Faces" toggle (default true)
  unrestricted?: boolean; // "Unrestricted" toggle
  quality?: string; // Quality dropdown (default "standard")

  // Step 2 — mode-specific inputs (only the ones for the chosen mode are populated)
  /** UGC composed image (avatar already holding product, single image)
   *  OR the avatar-only image when toggle is off. */
  ugcComposedImageUrl?: string;
  /** UGC: was Gemini compose run? false = avatar-only (toggle off). */
  ugcWasComposed?: boolean;
  /** UGC toggle-off path only — the separate product image that goes
   *  alongside the avatar to Seedance as a second reference. */
  ugcSeparateProductUrl?: string;

  // UGC Enhancor-parity inputs (D-34-02, D-34-03): 1 influencer + 2–9 product images
  /** UGC: single influencer image URL */
  ugcInfluencerImageUrl?: string;
  /** UGC: array of 2–9 product angle images */
  ugcProductImageUrls?: string[];

  /** Phase 34.1 (R-34.1-04): vision-extracted facts for the chosen products,
   *  cached once and reused by the script generator + Step-3 prompt agent.
   *  Cleared whenever the product selection changes (re-extract on next gen). */
  productFacts?: ProductFacts;

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

  /** multi_frame: free-text subject brief (text-only flow per D-26-01) */
  subjectBrief?: string;

  /**
   * Which CocoLash SKU the selected product images are of, or "" when the
   * selection identifies no single product.
   *
   * Not a user-facing selector (D-34-04): it is derived from the picker's
   * selection by resolveSelectedProductSku() in ProductReferencePicker, and it
   * is what switches the product-truth database on for the Director's truth
   * context and for lib/brand/prompt-validator. Before 2026-09-10 nothing ever
   * wrote it, so it was permanently "" and every truth guard was dead code
   * (docs/seedance-2.5/05-GROUNDING-FIX.md root cause #5).
   */
  productSku?: string;

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
  /** 2.5 accepts all seven (incl. 1:1, 21:9, adaptive); the 2.0 UI offers 9:16/16:9/3:4/4:3 only. */
  aspectRatio: Seedance25AspectRatio;
  /** Kept in sync with qualityTier on 2.5 (qualityTierToResolution); user-picked on 2.0. */
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
  // Seedance 2.5 defaults (D1, D3, D5, D9, D10). The global row in
  // video_settings can override engine / tier / duration / aspect on a fresh wizard.
  engine: "2.5",
  qualityTier: "draft-720p",
  durationMode: "fixed",
  passFaces: true,
  isUncensored: false,
  outputFormat: undefined,
  bitrateMode: "standard",
  ugcInfluencerImageUrls: [],
  inputImageUrls: [],
  inputVideoUrls: [],
  inputAudioUrls: [],
  editInstruction: "",
  settingsApplied: false,

  campaignType: "product-showcase",
  tone: "casual",
  duration: 8,
  mode: "ugc",
  script: null,
  scriptText: "",
  subjectBrief: "",
  productSku: "",
  // Settings (D-34-09)
  fullAccess: true,
  unrestricted: false,
  quality: "standard",
  // UGC Enhancor-parity inputs
  ugcProductImageUrls: [],
  aspectRatio: "9:16",
  resolution: "720p",
  fastMode: false,
  inputsVersion: 0,
};
