/**
 * Client-safe cost estimation utilities.
 *
 * Pure functions with no server dependencies — safe to import
 * from client components.
 */

// ── Per-call cost estimates (USD) ────────────────────────────

export const API_COSTS = {
  gemini: {
    imageGeneration: 0.04,
    composition: 0.06,
  },
  openrouter: {
    scriptGeneration: 0.0156,
    captionGeneration: 0.0063,
    /** Director call (Claude Opus 4.7) — short system + small completion. */
    directorCall: 0.02,
  },
  heygen: {
    videoGeneration15s: 0.50,
    videoGeneration30s: 1.00,
    videoGeneration60s: 2.00,
    videoGeneration90s: 3.00,
  },
  seedance: {
    /** Per-second cost by resolution (Enhancor pricing approx). */
    videoGeneration480pPerSecond: 0.10,
    videoGeneration720pPerSecond: 0.205,
    videoGeneration1080pPerSecond: 0.41,
  },
  elevenlabs: {
    ttsPerVideo30s: 0.20,
    ttsPerVideo60s: 0.30,
    ttsPerVideo90s: 0.40,
  },
  cloudinary: {
    videoUpload: 0.01,
    transformation: 0.005,
  },
} as const;

// ── v4 mode-aware estimator ──────────────────────────────────

export interface V4CostLineItem {
  /** Stable id — useful for keys / debugging. */
  id: string;
  /** User-facing label, e.g. "UGC avatar generation (Gemini)". */
  label: string;
  /** Single-call cost in USD. */
  cost: number;
  /** When > 1, the line item is multiplied (e.g. 2× NanoBanana). */
  count?: number;
  /** Subtle helper note shown in the UI. */
  hint?: string;
}

export interface V4CostBreakdown {
  items: V4CostLineItem[];
  total: number;
}

export interface V4CostInput {
  mode:
    | "ugc"
    | "multi_reference"
    | "multi_frame"
    | "lipsyncing"
    | "first_n_last_frames"
    | "text_to_video";
  durationSeconds: number;
  resolution: "480p" | "720p" | "1080p";
  /** Whether the user generated a fresh UGC avatar in the wizard. */
  generatesAvatar: boolean;
  /** UGC mode: did the user toggle "Show holding product" → Gemini compose. */
  composesProduct: boolean;
  /** First+last-frame: did the user run the NanoBanana last-frame chain. */
  generatesLastFrame: boolean;
  /** When script-generation is part of this run. */
  generatesScript: boolean;
}

/**
 * Estimate the FULL cost of a v4 Seedance wizard run. The breakdown is
 * surfaced in Step 3 (Prompt Review) so the user sees exactly what each
 * component costs before clicking Approve & Generate.
 *
 * "Estimate" — not exact. Real costs vary slightly with token counts and
 * Enhancor's billing nuances; the value here is in transparency, not
 * accounting precision.
 */
export function estimateV4Cost(input: V4CostInput): V4CostBreakdown {
  const items: V4CostLineItem[] = [];

  if (input.generatesScript) {
    items.push({
      id: "script-gen",
      label: "Script generation (Claude)",
      cost: API_COSTS.openrouter.scriptGeneration,
    });
  }

  if (input.generatesAvatar) {
    items.push({
      id: "avatar-gen",
      label: input.composesProduct
        ? "Avatar generation with product compose (Gemini)"
        : "Avatar generation (Gemini)",
      cost: input.composesProduct
        ? API_COSTS.gemini.composition
        : API_COSTS.gemini.imageGeneration,
      hint: input.composesProduct
        ? "Avatar + product fused into one image at gen time"
        : undefined,
    });
  }

  // Director call always runs once per generation (six dynamic prompts).
  items.push({
    id: "director",
    label: "Seedance Director (Claude Opus 4.7)",
    cost: API_COSTS.openrouter.directorCall,
    hint: "Writes the optimized Seedance prompt for your mode",
  });

  if (input.generatesLastFrame) {
    items.push({
      id: "nanobanana-last-frame",
      label: "NanoBanana Last-Frame Director (Claude + Gemini)",
      cost: API_COSTS.openrouter.directorCall + API_COSTS.gemini.imageGeneration,
      hint: "Generates the destination scene for First+Last Frame mode",
    });
  }

  // Seedance / Enhancor — the dominant line item. Per-second × resolution.
  const perSecond =
    input.resolution === "1080p"
      ? API_COSTS.seedance.videoGeneration1080pPerSecond
      : input.resolution === "480p"
      ? API_COSTS.seedance.videoGeneration480pPerSecond
      : API_COSTS.seedance.videoGeneration720pPerSecond;

  items.push({
    id: "seedance",
    label: `Seedance video (${input.resolution} × ${input.durationSeconds}s)`,
    cost: perSecond * input.durationSeconds,
    hint: `${input.resolution} ≈ $${perSecond.toFixed(3)}/sec`,
  });

  const total = items.reduce(
    (sum, it) => sum + it.cost * (it.count ?? 1),
    0
  );

  return {
    items,
    total: Number(total.toFixed(4)),
  };
}

/**
 * Quick "headline" estimate used at the START of a pipeline, BEFORE
 * the user has made detailed choices. Returns the same breakdown as
 * estimateV4Cost but with conservative defaults (15s @ 720p, no compose,
 * no last-frame). Used by the pipeline-entry banner.
 */
export function estimateV4Headline(
  mode: V4CostInput["mode"],
  resolution: V4CostInput["resolution"] = "720p"
): V4CostBreakdown {
  return estimateV4Cost({
    mode,
    durationSeconds: 15,
    resolution,
    generatesAvatar: mode === "ugc" || mode === "multi_frame",
    composesProduct: false,
    generatesLastFrame: mode === "first_n_last_frames",
    generatesScript:
      mode === "ugc" ||
      mode === "multi_reference" ||
      mode === "multi_frame" ||
      mode === "first_n_last_frames",
  });
}

/**
 * HeyGen pipeline cost estimate — used by the Brand Content Studio banner
 * and (eventually) by HeyGen's Generate step itemized view.
 */
export interface HeyGenCostInput {
  durationSeconds: number;
  /** Whether Gemini composed the avatar with a product first. */
  composesProduct: boolean;
  generatesScript: boolean;
}

export function estimateHeyGenCost(input: HeyGenCostInput): V4CostBreakdown {
  const items: V4CostLineItem[] = [];

  if (input.generatesScript) {
    items.push({
      id: "script-gen",
      label: "Script generation (Claude)",
      cost: API_COSTS.openrouter.scriptGeneration,
    });
  }

  if (input.composesProduct) {
    items.push({
      id: "compose",
      label: "Avatar + product compose (Gemini)",
      cost: API_COSTS.gemini.composition,
    });
  }

  let videoCost: number;
  if (input.durationSeconds <= 15) videoCost = API_COSTS.heygen.videoGeneration15s;
  else if (input.durationSeconds <= 30) videoCost = API_COSTS.heygen.videoGeneration30s;
  else if (input.durationSeconds <= 60) videoCost = API_COSTS.heygen.videoGeneration60s;
  else videoCost = API_COSTS.heygen.videoGeneration90s;

  items.push({
    id: "heygen",
    label: `HeyGen avatar video (~${input.durationSeconds}s)`,
    cost: videoCost,
  });

  let ttsCost: number;
  if (input.durationSeconds <= 30) ttsCost = API_COSTS.elevenlabs.ttsPerVideo30s;
  else if (input.durationSeconds <= 60) ttsCost = API_COSTS.elevenlabs.ttsPerVideo60s;
  else ttsCost = API_COSTS.elevenlabs.ttsPerVideo90s;

  items.push({
    id: "tts",
    label: `Voice synthesis (ElevenLabs, ~${input.durationSeconds}s)`,
    cost: ttsCost,
  });

  items.push({
    id: "cloudinary",
    label: "Caption render + CDN delivery",
    cost: API_COSTS.cloudinary.videoUpload + API_COSTS.cloudinary.transformation,
  });

  const total = items.reduce(
    (sum, it) => sum + it.cost * (it.count ?? 1),
    0
  );

  return {
    items,
    total: Number(total.toFixed(4)),
  };
}

// ── Types ────────────────────────────────────────────────────

export interface VideoCostEstimate {
  scriptGeneration: number;
  imageComposition: number;
  videoGeneration: number;
  ttsCost: number;
  postProcessing: number;
  total: number;
}

// ── Estimate Cost Before Generation ──────────────────────────

export function calculateVideoCost(params: {
  duration: number;
  addCaptions: boolean;
  addWatermark: boolean;
  needsScriptGeneration: boolean;
  needsComposition?: boolean;
}): VideoCostEstimate {
  const { duration, addCaptions, addWatermark, needsScriptGeneration, needsComposition = true } = params;

  const scriptGeneration = needsScriptGeneration
    ? API_COSTS.openrouter.scriptGeneration
    : 0;

  const imageComposition = needsComposition ? API_COSTS.gemini.composition : 0;

  let videoGeneration: number;
  if (duration <= 15) {
    videoGeneration = API_COSTS.heygen.videoGeneration15s;
  } else if (duration <= 30) {
    videoGeneration = API_COSTS.heygen.videoGeneration30s;
  } else if (duration <= 60) {
    videoGeneration = API_COSTS.heygen.videoGeneration60s;
  } else {
    videoGeneration = API_COSTS.heygen.videoGeneration90s;
  }

  let ttsCost: number;
  if (duration <= 30) {
    ttsCost = API_COSTS.elevenlabs.ttsPerVideo30s;
  } else if (duration <= 60) {
    ttsCost = API_COSTS.elevenlabs.ttsPerVideo60s;
  } else {
    ttsCost = API_COSTS.elevenlabs.ttsPerVideo90s;
  }

  let postProcessing = API_COSTS.cloudinary.videoUpload;
  if (addWatermark) postProcessing += API_COSTS.cloudinary.transformation;
  if (addCaptions) postProcessing += API_COSTS.cloudinary.transformation;

  const total = scriptGeneration + imageComposition + videoGeneration + ttsCost + postProcessing;

  return {
    scriptGeneration: Number(scriptGeneration.toFixed(4)),
    imageComposition: Number(imageComposition.toFixed(4)),
    videoGeneration: Number(videoGeneration.toFixed(4)),
    ttsCost: Number(ttsCost.toFixed(4)),
    postProcessing: Number(postProcessing.toFixed(4)),
    total: Number(total.toFixed(4)),
  };
}

// ── Seedance Cost Estimator ─────────────────────────────────

export function calculateSeedanceCost(params: {
  duration: number;
  resolution?: "480p" | "720p" | "1080p";
  includeScript: boolean;
  includeImageGen: boolean;
  includePostProcessing: boolean;
}): VideoCostEstimate {
  const { duration, resolution = "720p", includeScript, includeImageGen, includePostProcessing } =
    params;

  const scriptGeneration = includeScript
    ? API_COSTS.openrouter.scriptGeneration
    : 0;

  const imageComposition = includeImageGen
    ? API_COSTS.gemini.imageGeneration
    : 0;

  const videoCostPerSecond =
    resolution === "1080p"
      ? API_COSTS.seedance.videoGeneration1080pPerSecond
      : API_COSTS.seedance.videoGeneration720pPerSecond;
  const videoGeneration = duration * videoCostPerSecond;

  let postProcessing = 0;
  if (includePostProcessing) {
    postProcessing =
      API_COSTS.cloudinary.videoUpload + API_COSTS.cloudinary.transformation;
  }

  const total =
    scriptGeneration + imageComposition + videoGeneration + postProcessing;

  return {
    scriptGeneration: Number(scriptGeneration.toFixed(4)),
    imageComposition: Number(imageComposition.toFixed(4)),
    videoGeneration: Number(videoGeneration.toFixed(4)),
    ttsCost: 0,
    postProcessing: Number(postProcessing.toFixed(4)),
    total: Number(total.toFixed(4)),
  };
}
