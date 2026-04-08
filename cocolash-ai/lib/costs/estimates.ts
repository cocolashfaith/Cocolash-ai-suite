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
  },
  heygen: {
    videoGeneration15s: 0.50,
    videoGeneration30s: 1.00,
    videoGeneration60s: 2.00,
  },
  seedance: {
    videoGeneration720pPerSecond: 0.205,
  },
  cloudinary: {
    videoUpload: 0.01,
    transformation: 0.005,
  },
} as const;

// ── Types ────────────────────────────────────────────────────

export interface VideoCostEstimate {
  scriptGeneration: number;
  imageComposition: number;
  videoGeneration: number;
  postProcessing: number;
  total: number;
}

// ── Estimate Cost Before Generation ──────────────────────────

export function calculateVideoCost(params: {
  duration: number;
  addCaptions: boolean;
  addWatermark: boolean;
  needsScriptGeneration: boolean;
}): VideoCostEstimate {
  const { duration, addCaptions, addWatermark, needsScriptGeneration } = params;

  const scriptGeneration = needsScriptGeneration
    ? API_COSTS.openrouter.scriptGeneration
    : 0;

  const imageComposition = API_COSTS.gemini.composition;

  let videoGeneration: number;
  if (duration <= 15) {
    videoGeneration = API_COSTS.heygen.videoGeneration15s;
  } else if (duration <= 30) {
    videoGeneration = API_COSTS.heygen.videoGeneration30s;
  } else {
    videoGeneration = API_COSTS.heygen.videoGeneration60s;
  }

  let postProcessing = API_COSTS.cloudinary.videoUpload;
  if (addWatermark) postProcessing += API_COSTS.cloudinary.transformation;
  if (addCaptions) postProcessing += API_COSTS.cloudinary.transformation;

  const total = scriptGeneration + imageComposition + videoGeneration + postProcessing;

  return {
    scriptGeneration: Number(scriptGeneration.toFixed(4)),
    imageComposition: Number(imageComposition.toFixed(4)),
    videoGeneration: Number(videoGeneration.toFixed(4)),
    postProcessing: Number(postProcessing.toFixed(4)),
    total: Number(total.toFixed(4)),
  };
}

// ── Seedance Cost Estimator ─────────────────────────────────

export function calculateSeedanceCost(params: {
  duration: number;
  includeScript: boolean;
  includeImageGen: boolean;
  includePostProcessing: boolean;
}): VideoCostEstimate {
  const { duration, includeScript, includeImageGen, includePostProcessing } =
    params;

  const scriptGeneration = includeScript
    ? API_COSTS.openrouter.scriptGeneration
    : 0;

  const imageComposition = includeImageGen
    ? API_COSTS.gemini.imageGeneration
    : 0;

  const videoGeneration =
    duration * API_COSTS.seedance.videoGeneration720pPerSecond;

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
    postProcessing: Number(postProcessing.toFixed(4)),
    total: Number(total.toFixed(4)),
  };
}
