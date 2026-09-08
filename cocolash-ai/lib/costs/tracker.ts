/**
 * Server-side cost tracking module.
 *
 * Re-exports client-safe cost constants and estimator from estimates.ts,
 * and provides server-only functions for recording and aggregating costs.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/schema-errors";
import { API_COSTS } from "./estimates";

// Re-export client-safe utilities for server-side callers
export { API_COSTS, calculateVideoCost, calculateSeedanceCost } from "./estimates";
export type { VideoCostEstimate } from "./estimates";

// ── Types ────────────────────────────────────────────────────

export interface PipelineBreakdown {
  heygen: number;
  seedance: number;
  heygenCount: number;
  seedanceCount: number;
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
  pipelineBreakdown: PipelineBreakdown;
}

// ── Record Actual Cost ───────────────────────────────────────

/**
 * Persist the final cost of a video.
 *
 * `opts.credits` is the REAL Enhancor credit spend reported by a Seedance 2.5
 * callback (`credits_cost`, NUMERIC(12,3)). It only exists after the 20260908
 * migration, so a missing-column error retries with `processing_cost` alone —
 * the Seedance 2.0 pipeline must keep working before the migration lands.
 */
export async function recordActualCost(
  videoId: string,
  cost: number,
  opts?: { credits?: number | null }
): Promise<void> {
  const supabase = await createAdminClient();

  const base = { processing_cost: Number(cost.toFixed(4)) };
  const credits = opts?.credits;
  const patch =
    credits != null && Number.isFinite(credits)
      ? { ...base, credits_cost: Number(credits.toFixed(3)) }
      : base;

  const { error } = await supabase
    .from("generated_videos")
    .update(patch)
    .eq("id", videoId);

  if (!error) return;

  if (patch !== base && isMissingColumnError(error)) {
    console.warn(
      "[costs] credits_cost column missing — recording processing_cost only (run the 20260908 migration)."
    );
    const { error: retryError } = await supabase
      .from("generated_videos")
      .update(base)
      .eq("id", videoId);
    if (retryError) {
      console.error("[costs] Failed to record cost:", retryError);
    }
    return;
  }

  console.error("[costs] Failed to record cost:", error);
}

// ── Monthly Cost Summary ─────────────────────────────────────

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

  const { data: videos, error: videoError } = await supabase
    .from("generated_videos")
    .select("processing_cost, pipeline")
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

  const heygenVideos = videoList.filter((v) => (v.pipeline ?? "heygen") === "heygen");
  const seedanceVideos = videoList.filter((v) => v.pipeline === "seedance");

  const pipelineBreakdown: PipelineBreakdown = {
    heygen: Number(
      heygenVideos
        .reduce((sum, v) => sum + (Number(v.processing_cost) || 0), 0)
        .toFixed(2)
    ),
    seedance: Number(
      seedanceVideos
        .reduce((sum, v) => sum + (Number(v.processing_cost) || 0), 0)
        .toFixed(2)
    ),
    heygenCount: heygenVideos.length,
    seedanceCount: seedanceVideos.length,
  };

  const { count: imageCount, error: imageError } = await supabase
    .from("generated_images")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startDate)
    .lt("created_at", endDate);

  if (imageError) {
    console.error("[costs] Image query error:", imageError);
  }

  const imageCosts = (imageCount ?? 0) * API_COSTS.gemini.imageGeneration;

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
    pipelineBreakdown,
  };
}
