/**
 * Cost Tracking Module
 *
 * Tracks estimated and actual API costs across all services used
 * in the video generation pipeline. Costs are stored per-video
 * in `generated_videos.processing_cost` and aggregated for
 * monthly reporting.
 *
 * All costs in USD.
 */

import { createAdminClient } from "@/lib/supabase/server";

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

export interface CostSummary {
  month: string;
  totalCost: number;
  videoCount: number;
  avgCostPerVideo: number;
  breakdown: {
    videos: number;
    images: number;
    captions: number;
  };
}

// ── Estimate Cost Before Generation ──────────────────────────

/**
 * Calculate the estimated cost for generating a video.
 * Shown to the user in Step 4 of the wizard before they hit Generate.
 */
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

// ── Record Actual Cost ───────────────────────────────────────

/**
 * Update the processing_cost field in the generated_videos table
 * after a video has been generated. Called by the status route
 * when a video completes.
 */
export async function recordActualCost(
  videoId: string,
  cost: number
): Promise<void> {
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from("generated_videos")
    .update({ processing_cost: Number(cost.toFixed(4)) })
    .eq("id", videoId);

  if (error) {
    console.error("[costs] Failed to record cost:", error);
  }
}

// ── Monthly Cost Summary ─────────────────────────────────────

/**
 * Aggregate costs for a given month (or current month if not specified).
 * Pulls from generated_videos.processing_cost and counts image generations.
 */
export async function getMonthlyCostSummary(
  year?: number,
  month?: number
): Promise<CostSummary> {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ?? now.getMonth() + 1;

  const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
  const endDate =
    targetMonth === 12
      ? `${targetYear + 1}-01-01`
      : `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`;

  const monthLabel = new Date(targetYear, targetMonth - 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" }
  );

  const supabase = await createAdminClient();

  // Video costs
  const { data: videos, error: videoError } = await supabase
    .from("generated_videos")
    .select("processing_cost")
    .gte("created_at", startDate)
    .lt("created_at", endDate);

  if (videoError) {
    console.error("[costs] Video query error:", videoError);
  }

  const videoList = videos ?? [];
  const videoCosts = videoList.reduce(
    (sum, v) => sum + (Number(v.processing_cost) || 0),
    0
  );
  const videoCount = videoList.length;

  // Image generation count (estimate cost at Gemini rate)
  const { count: imageCount, error: imageError } = await supabase
    .from("generated_images")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startDate)
    .lt("created_at", endDate);

  if (imageError) {
    console.error("[costs] Image query error:", imageError);
  }

  const imageCosts = (imageCount ?? 0) * API_COSTS.gemini.imageGeneration;

  // Caption generation estimate
  const { count: captionCount, error: captionError } = await supabase
    .from("generated_captions")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startDate)
    .lt("created_at", endDate);

  if (captionError) {
    // Table may not exist yet — non-fatal
  }

  const captionCosts =
    (captionCount ?? 0) * API_COSTS.openrouter.captionGeneration;

  const totalCost = videoCosts + imageCosts + captionCosts;

  return {
    month: monthLabel,
    totalCost: Number(totalCost.toFixed(2)),
    videoCount,
    avgCostPerVideo: videoCount > 0 ? Number((videoCosts / videoCount).toFixed(2)) : 0,
    breakdown: {
      videos: Number(videoCosts.toFixed(2)),
      images: Number(imageCosts.toFixed(2)),
      captions: Number(captionCosts.toFixed(2)),
    },
  };
}
