/**
 * Server-side cost tracking module.
 *
 * Re-exports client-safe cost constants and estimator from estimates.ts,
 * and provides server-only functions for recording and aggregating costs.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/supabase/schema-errors";
import { roundCredits } from "@/lib/seedance/pricing";
import { API_COSTS } from "./estimates";

// Re-export client-safe utilities for server-side callers
export { API_COSTS, calculateVideoCost, calculateSeedanceCost } from "./estimates";
export type { VideoCostEstimate } from "./estimates";

// ── Types ────────────────────────────────────────────────────

/**
 * `seedance` / `seedanceCount` are the COMBINED 2.0 + 2.5 totals and keep their
 * historical meaning — existing consumers never have to know about engines.
 * The `seedance20*` / `seedance25*` fields are the D1 engine split; they are
 * derived from `generated_videos.engine`, which only exists after the 20260908
 * migration (see `getMonthlyCostSummary`'s fallback).
 */
export interface PipelineBreakdown {
  heygen: number;
  seedance: number;
  heygenCount: number;
  seedanceCount: number;
  seedance20: number;
  seedance25: number;
  seedance20Count: number;
  seedance25Count: number;
  /** Real Enhancor credit spend on 2.5 rows (`credits_cost`). */
  seedance25Credits: number;
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

/** Shape of the columns the summary reads. Every 2.5 column is optional. */
interface VideoCostRow {
  processing_cost?: number | string | null;
  pipeline?: string | null;
  engine?: string | null;
  credits_cost?: number | string | null;
  heygen_status?: string | null;
}

/** With the engine split (post-migration). */
const VIDEO_COST_SELECT =
  "processing_cost, pipeline, engine, credits_cost, heygen_status";
/** Pre-migration: `engine` / `credits_cost` do not exist yet (42703). */
const VIDEO_COST_SELECT_LEGACY = "processing_cost, pipeline, heygen_status";

const num = (value: number | string | null | undefined): number =>
  Number(value) || 0;

/**
 * A failed render is never billed — Enhancor returns no `cost` for it and the
 * provider does not charge. Seedance 2.5 writes the *estimate* into
 * `processing_cost` at insert (before the job is queued), so a failed 2.5 row
 * still carries that number and would otherwise inflate the dashboard by money
 * nobody spent. 2.0/HeyGen only write cost on completion, so this is a no-op
 * for them.
 */
const isBillable = (row: VideoCostRow): boolean => row.heygen_status !== "failed";

const sumCost = (rows: VideoCostRow[]): number =>
  rows.reduce(
    (total, row) => total + (isBillable(row) ? num(row.processing_cost) : 0),
    0
  );

const usd = (value: number): number => Number(value.toFixed(2));

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

  const queryVideos = (columns: string) =>
    supabase
      .from("generated_videos")
      .select(columns)
      .gte("created_at", startDate)
      .lt("created_at", endDate);

  let { data: videos, error: videoError } = await queryVideos(VIDEO_COST_SELECT);

  // Pre-migration the `engine` / `credits_cost` columns do not exist. Retry
  // without them so the dashboard keeps working (no engine split is possible,
  // and every seedance row is 2.0 by construction — see below).
  let engineSplitAvailable = true;
  if (videoError && isMissingColumnError(videoError)) {
    console.warn(
      "[costs] engine/credits_cost columns missing — cost dashboard cannot split engines (run the 20260908 migration)."
    );
    engineSplitAvailable = false;
    ({ data: videos, error: videoError } = await queryVideos(VIDEO_COST_SELECT_LEGACY));
  }

  if (videoError) {
    console.error("[costs] Video query error:", videoError);
  }

  const videoList = (videos ?? []) as unknown as VideoCostRow[];
  const videoCosts = sumCost(videoList);
  const videoCount = videoList.length;

  const heygenVideos = videoList.filter((v) => (v.pipeline ?? "heygen") === "heygen");
  const seedanceVideos = videoList.filter((v) => v.pipeline === "seedance");

  // A seedance row with no `engine` predates 2.5 (the column defaults to '2.0'),
  // so it belongs in the 2.0 bucket — same rule as `engineLabel`. Without the
  // column at all, that puts the whole seedance total in 2.0 and leaves 2.5 at 0.
  const seedance25Videos = engineSplitAvailable
    ? seedanceVideos.filter((v) => v.engine === "2.5")
    : [];
  const seedance20Videos = seedanceVideos.filter((v) => !seedance25Videos.includes(v));

  const seedance20 = usd(sumCost(seedance20Videos));
  const seedance25 = usd(sumCost(seedance25Videos));

  const pipelineBreakdown: PipelineBreakdown = {
    heygen: usd(sumCost(heygenVideos)),
    seedance: usd(sumCost(seedanceVideos)),
    heygenCount: heygenVideos.length,
    seedanceCount: seedanceVideos.length,
    seedance20,
    seedance25,
    seedance20Count: seedance20Videos.length,
    seedance25Count: seedance25Videos.length,
    seedance25Credits: roundCredits(
      seedance25Videos.reduce((total, v) => total + num(v.credits_cost), 0)
    ),
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
