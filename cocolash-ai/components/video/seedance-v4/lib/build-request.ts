/**
 * Wizard state → generate-route body.
 *
 * Two builders live here so Step 3 stays a view:
 *
 *   buildSeedance25GenerateBody(state, prompt, segments)
 *     The Seedance 2.5 envelope (§2.11): `{ engine: "2.5", request, qualityTier,
 *     scriptText, … }`. It sends EXACTLY the media fields the chosen mode
 *     accepts — `Seedance25RequestSchema` rejects anything else with
 *     "<field> is not accepted in <mode> mode" — and Step 3 runs
 *     `Seedance25GenerateBodySchema.safeParse` on the result before POSTing so
 *     the user gets the error instantly instead of after a round trip.
 *
 *   buildSeedance20Body(state, prompt, segments)
 *     The legacy 2.0 payload, moved here verbatim from Step 3 (both the
 *     Enhancor-parity UGC shape and the general one). Byte-for-byte unchanged —
 *     a snapshot test pins it.
 *
 * Pure: no fetch, no React, no server imports.
 */

import { qualityTierToResolution } from "@/lib/seedance/engines";
import { AUTO_DURATION } from "@/lib/seedance/v25/types";
import type { Seedance25Mode } from "@/lib/seedance/v25/types";
import type { Seedance25RequestInput } from "@/lib/seedance/v25/schema";
import type { QualityTier } from "@/lib/types";
import type { SeedanceV4WizardState } from "../types";
import { effectiveDuration } from "./mode-input-rules";

export interface MultiFrameSegment {
  prompt: string;
  duration: number;
}

/** `z.input` of `Seedance25GenerateBodySchema` — what Step 3 POSTs. */
export interface Seedance25GenerateBodyInput {
  engine: "2.5";
  request: Seedance25RequestInput;
  qualityTier: QualityTier;
  scriptText?: string;
  scriptId?: string;
  campaignType?: string;
  tone?: string;
  productSku?: string;
}

// ── helpers ──────────────────────────────────────────────────

/** Non-empty, de-duplicated URL list — or undefined so the key is omitted. */
function urls(...lists: Array<string[] | undefined | null>): string[] | undefined {
  const out: string[] = [];
  for (const list of lists) {
    for (const url of list ?? []) {
      const trimmed = typeof url === "string" ? url.trim() : "";
      if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    }
    if (out.length > 0) break; // first non-empty source wins (picker → legacy key)
  }
  return out.length > 0 ? out : undefined;
}

function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function multiFrameTotalSeconds(segments: MultiFrameSegment[]): number {
  return segments.reduce((sum, s) => sum + (Number.isFinite(s.duration) ? s.duration : 0), 0);
}

/**
 * The Enhancor-parity UGC path (Plan 34-04): one influencer + N product angle
 * images. Step 3 also keys its vision-agent path on this.
 */
export function isEnhancorParityUgc(state: SeedanceV4WizardState): boolean {
  return (
    state.mode === "ugc" &&
    !!state.ugcInfluencerImageUrl &&
    !!state.ugcProductImageUrls &&
    state.ugcProductImageUrls.length > 0
  );
}

/**
 * Effective clip length for the request: -1 when the user chose Auto (on an
 * engine that supports it), and always -1 for `edit`. Single source of truth
 * lives in mode-input-rules so Step 1 (settings) and Step 3 (request) agree.
 */
export { effectiveDuration };

// ── Seedance 2.5 ─────────────────────────────────────────────

/** Media fields for the chosen mode — everything else stays absent. */
function mediaForMode(
  state: SeedanceV4WizardState,
  segments: MultiFrameSegment[]
): Partial<Seedance25RequestInput> {
  const mode = state.mode as Seedance25Mode;
  switch (mode) {
    case "ugc":
      return {
        products: urls(state.ugcProductImageUrls),
        influencers: urls(state.ugcInfluencerImageUrls, [state.ugcInfluencerImageUrl ?? ""]),
      };
    case "text_to_video":
      return {};
    case "multi_reference":
      return {
        images: urls(
          state.multiReferenceImages?.map((r) => r.url),
          state.inputImageUrls
        ),
        videos: urls(state.inputVideoUrls, [state.multiReferenceVideoUrl ?? ""]),
        audios: urls(state.inputAudioUrls, [state.multiReferenceAudioUrl ?? ""]),
      };
    case "first_n_last_frames":
      return {
        first_frame_image: text(state.firstFrameUrl),
        last_frame_image: text(state.lastFrameUrl),
      };
    case "multi_frame":
      return {
        multi_frame_prompts: segments.map((s) => ({
          prompt: s.prompt,
          duration: s.duration,
        })),
        images: urls(state.inputImageUrls),
        videos: urls(state.inputVideoUrls),
        audios: urls(state.inputAudioUrls),
      };
    case "edit":
    case "extend":
      return {
        videos: urls(state.inputVideoUrls),
        images: urls(state.inputImageUrls),
        audios: urls(state.inputAudioUrls),
      };
    case "lipsyncing":
    case "voice_clone":
      return {
        images: urls(state.inputImageUrls, [state.lipsyncImageUrl ?? ""]),
        lipsyncing_audio: text(state.lipsyncAudioUrl),
      };
    default:
      return {};
  }
}

/** Build the 2.5 request (wire field names, no webhook_url — the server adds it). */
export function buildSeedance25Request(
  state: SeedanceV4WizardState,
  editedPrompt: string,
  editedSegments: MultiFrameSegment[] = []
): Seedance25RequestInput {
  const isMultiFrame = state.mode === "multi_frame";
  const request: Seedance25RequestInput = {
    mode: state.mode as Seedance25Mode,
    resolution: qualityTierToResolution(state.qualityTier),
    aspect_ratio: state.aspectRatio,
    pass_faces: state.passFaces,
    is_uncensored: state.isUncensored,
    bitrate_mode: state.bitrateMode,
    ...mediaForMode(state, editedSegments),
  };

  // multi_frame carries neither a top-level prompt nor a top-level duration —
  // both live inside multi_frame_prompts[] (the schema sums the segments).
  if (!isMultiFrame) {
    request.prompt = editedPrompt;
    request.duration = effectiveDuration(state);
  }
  if (state.outputFormat) request.output_format = state.outputFormat;

  return request;
}

/** Build the full POST body for `/api/seedance/generate` on engine 2.5. */
export function buildSeedance25GenerateBody(
  state: SeedanceV4WizardState,
  editedPrompt: string,
  editedSegments: MultiFrameSegment[] = []
): Seedance25GenerateBodyInput {
  const body: Seedance25GenerateBodyInput = {
    engine: "2.5",
    request: buildSeedance25Request(state, editedPrompt, editedSegments),
    qualityTier: state.qualityTier,
  };

  const scriptText = text(state.scriptText);
  if (scriptText) body.scriptText = scriptText.slice(0, 2500);
  if (text(state.scriptId)) body.scriptId = state.scriptId;
  if (text(state.campaignType)) body.campaignType = state.campaignType;
  if (text(state.tone)) body.tone = state.tone;
  if (text(state.productSku)) body.productSku = state.productSku;

  return body;
}

// ── Seedance 2.0 (legacy — moved verbatim from Step 3) ───────

/**
 * Enhancor-parity UGC payload (Plan 34-04): influencer-first image arrays +
 * the edited prompt. Per BLOCKER 1 (D-34-04) it carries NO productSku —
 * the images are the sole source of product identity.
 */
function buildSeedance20UgcParityBody(
  state: SeedanceV4WizardState,
  editedPrompt: string
): Record<string, unknown> {
  return {
    type: "image-to-video",
    seedanceMode: "ugc",
    prompt: editedPrompt,
    duration: state.duration,
    resolution: state.resolution,
    aspectRatio: state.aspectRatio,
    fullAccess: state.fullAccess ?? true,
    unrestricted: state.unrestricted ?? false,
    quality: state.quality ?? "standard",
    // Images: influencer FIRST, then products (per @-mention alignment)
    influencers: state.ugcInfluencerImageUrl ? [state.ugcInfluencerImageUrl] : [],
    products: state.ugcProductImageUrls || [],
    // Script for downstream reference
    scriptText: state.scriptText,
    campaignType: state.campaignType,
    tone: state.tone,
    fastMode: state.fastMode,
    // Legacy compat fields (kept for backward compatibility)
    personImageUrl: state.ugcInfluencerImageUrl,
    productImageUrl: state.ugcProductImageUrls?.[0],
  };
}

/**
 * The legacy 2.0 body. Dispatches to the Enhancor-parity UGC shape when the
 * wizard is in that path, exactly as Step 3 did before this refactor.
 */
export function buildSeedance20Body(
  state: SeedanceV4WizardState,
  editedPrompt: string,
  editedSegments: MultiFrameSegment[] = []
): Record<string, unknown> {
  if (isEnhancorParityUgc(state)) {
    return { ...buildSeedance20UgcParityBody(state, editedPrompt), overridePrompt: editedPrompt };
  }

  const common = {
    aspectRatio: state.aspectRatio,
    resolution: state.resolution,
    duration: state.duration,
    fastMode: state.fastMode && state.resolution !== "1080p",
    campaignType: state.campaignType,
    tone: state.tone,
    seedanceMode: state.mode === "text_to_video" ? "ugc" : state.mode,
    // Pass the selected SKU so the generate route can resolve its DB reference
    // images and attach them to the Enhancor payload (Phase 29 reference
    // conditioning). Without this the resolver receives undefined and no
    // product references reach generation.
    productSku: state.productSku || undefined,
    fullAccess: true,
    // Carry the script for downstream (some current API code expects it)
    scriptText: state.scriptText,
    // Pass the AI-approved prompt as the AUTHORITATIVE prompt — the existing
    // /api/seedance/generate route can use this directly without rerunning
    // its planner.
    overridePrompt:
      state.mode === "multi_frame"
        ? editedSegments
            .map((s, i) => `Shot ${i + 1} (${s.duration}s): ${s.prompt}`)
            .join("\n\n")
        : editedPrompt,
  };

  switch (state.mode) {
    case "ugc":
      // Two paths:
      //  - toggle ON: ugcComposedImageUrl is a SINGLE composed image (avatar
      //    already holding product). productImageUrl carries the same URL so
      //    the legacy /api/seedance/generate route keeps a value in its
      //    required field, but Seedance receives ONE image visually.
      //  - toggle OFF: ugcComposedImageUrl is the avatar-only image;
      //    ugcSeparateProductUrl is the separate product reference. Both go.
      return {
        ...common,
        type: "image-to-video",
        personImageUrl: state.ugcComposedImageUrl,
        productImageUrl: state.ugcWasComposed
          ? state.ugcComposedImageUrl
          : state.ugcSeparateProductUrl,
      };
    case "text_to_video":
      return {
        ...common,
        type: "text-to-video",
      };
    case "multi_reference":
      return {
        ...common,
        type: "image-to-video",
        images: state.multiReferenceImages?.map((r) => r.url) ?? [],
        videos: state.multiReferenceVideoUrl ? [state.multiReferenceVideoUrl] : [],
        audios: state.multiReferenceAudioUrl ? [state.multiReferenceAudioUrl] : [],
      };
    case "lipsyncing":
      return {
        ...common,
        type: "image-to-video",
        personImageUrl: state.lipsyncImageUrl,
        audios: state.lipsyncAudioUrl ? [state.lipsyncAudioUrl] : [],
        videos: state.lipsyncVideoUrl ? [state.lipsyncVideoUrl] : [],
      };
    case "first_n_last_frames":
      return {
        ...common,
        type: "image-to-video",
        firstFrameImage: state.firstFrameUrl,
        lastFrameImage: state.lastFrameUrl,
      };
    case "multi_frame":
      // Phase 26, D-26-01: Multi-Frame is TEXT-ONLY. Enhancor API silently drops
      // images[] / products[] / influencers[] for mode=multi_frame. The only
      // required field is multi_frame_prompts[] (each segment has prompt + duration).
      return {
        ...common,
        type: "image-to-video",
        multiFramePrompts: editedSegments,
      };
    // edit / extend / voice_clone are Seedance 2.5 only — pick engine 2.5 in
    // Step 1 to use them. This branch keeps the 2.0 body well-formed.
    default:
      return { ...common, type: "image-to-video" };
  }
}
