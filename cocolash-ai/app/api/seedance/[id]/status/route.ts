import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { querySeedanceTask } from "@/lib/seedance/client";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import { recordActualCost } from "@/lib/costs/tracker";
import { creditsToUsd } from "@/lib/seedance/pricing";
import { getVideoSettings } from "@/lib/settings/video-settings";
import { SeedanceError } from "@/lib/seedance/types";
import { querySeedance25Task } from "@/lib/seedance/v25/client";
import { safeUpdateVideo, truncateErrorMessage } from "@/lib/seedance/v25/db";
import { rowHasSeedance25Columns } from "@/lib/supabase/schema-errors";
import type {
  GeneratedVideo,
  QualityTier,
  SeedanceEngine,
  VideoStatusResponse,
} from "@/lib/types";

/**
 * GET /api/seedance/[id]/status
 *
 * Polls the current status of a Seedance video generation request — for BOTH
 * engines (03-PLAN.md §1.3). The engine column picks the client:
 *   2.5 → POST {SEEDANCE_25_API_BASE}/status (idempotent, retries once)
 *   2.0 → the legacy querySeedanceTask (unchanged)
 *
 * It also backfills `credits_cost` for a completed 2.5 row whose real cost is
 * still unknown (the webhook may have been lost).
 *
 * Flow:
 * 1. Fetch video record from `generated_videos` (pipeline = 'seedance')
 * 2. If status is "processing" or "pending", poll Enhancor for an update
 * 3. On COMPLETED: store raw video URL, run Cloudinary post-processing
 * 4. On FAILED: store error and mark as failed
 * 5. Return VideoStatusResponse (same shape as HeyGen for UI consistency)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Video ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient();

    const { data: video, error: fetchError } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    const typedVideo = video as GeneratedVideo;
    const engine: SeedanceEngine = typedVideo.engine ?? "2.0";

    if (typedVideo.heygen_status === "completed") {
      // A completed 2.5 row whose real credit cost never arrived (lost webhook):
      // one status call backfills it. Best effort — never fails the response.
      const backfilled = await backfillCreditsCost(supabase, typedVideo, engine);
      return NextResponse.json(buildStatusResponse(backfilled));
    }

    if (typedVideo.heygen_status === "failed") {
      return NextResponse.json(buildStatusResponse(typedVideo));
    }

    if (!typedVideo.seedance_task_id) {
      return NextResponse.json(
        buildStatusResponse(
          typedVideo,
          "Video has no Seedance task ID — generation may not have started"
        )
      );
    }

    // Poll Enhancor for status update. The webhook path can also complete this
    // record, so polling errors are non-terminal unless Enhancor says FAILED.
    let poll: PollResult;
    try {
      poll = await pollEngine(engine, typedVideo.seedance_task_id);
    } catch (error) {
      console.error("[seedance/status] Enhancor poll error:", error);

      if (error instanceof SeedanceError) {
        return NextResponse.json(
          buildStatusResponse(typedVideo, "Failed to check video status")
        );
      }

      return NextResponse.json(
        buildStatusResponse(typedVideo, "Failed to check video status")
      );
    }

    if (poll.status === "COMPLETED") {
      if (!poll.videoUrl) {
        return NextResponse.json(
          buildStatusResponse(typedVideo, "Enhancor completed without a video URL")
        );
      }

      const updatedVideo = await completeSeedanceVideo({
        supabase,
        video: typedVideo,
        rawVideoUrl: poll.videoUrl,
        thumbnailUrl: poll.thumbnailUrl,
        creditsCost: poll.cost ?? null,
        engine,
      });
      return NextResponse.json(buildStatusResponse(updatedVideo));
    }

    if (poll.status === "FAILED") {
      const errorMsg = poll.error ?? "Seedance video generation failed";

      await safeUpdateVideo(supabase, id, {
        heygen_status: "failed",
        completed_at: new Date().toISOString(),
        ...(rowHasSeedance25Columns(typedVideo as unknown as Record<string, unknown>)
          ? { error_message: truncateErrorMessage(errorMsg) }
          : {}),
      });

      return NextResponse.json(
        buildStatusResponse(
          { ...typedVideo, heygen_status: "failed", error_message: errorMsg },
          errorMsg
        )
      );
    }

    // PENDING / IN_QUEUE / IN_PROGRESS / PROCESSING — update status if changed
    const mappedStatus = poll.status === "PENDING" ? "pending" : "processing";

    if (mappedStatus !== typedVideo.heygen_status) {
      await supabase
        .from("generated_videos")
        .update({ heygen_status: mappedStatus })
        .eq("id", id);
    }

    return NextResponse.json(
      buildStatusResponse({
        ...typedVideo,
        heygen_status: mappedStatus as GeneratedVideo["heygen_status"],
      })
    );
  } catch (error: unknown) {
    // Log the detail server-side; the client gets a fixed string so an internal
    // message (provider host, SQL, stack text) never reaches the browser.
    console.error("[seedance/status] Error:", error);
    return NextResponse.json(
      { error: "Failed to check video status" },
      { status: 500 }
    );
  }
}

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;

/** Engine-agnostic shape so the flow below reads the same for 2.0 and 2.5. */
interface PollResult {
  status: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  /** Credits — 2.5 only. */
  cost?: number;
  error?: string;
}

async function pollEngine(engine: SeedanceEngine, taskId: string): Promise<PollResult> {
  if (engine === "2.5") {
    const result = await querySeedance25Task(taskId);
    return {
      status: result.status,
      videoUrl: result.resultUrl ?? null,
      thumbnailUrl: result.thumbnailUrl ?? null,
      cost: result.cost,
      error: result.error,
    };
  }

  const result = await querySeedanceTask(taskId);
  return {
    status: result.status,
    videoUrl: result.output?.video_url ?? null,
    thumbnailUrl: result.output?.thumbnail_url ?? null,
    error: result.error ?? undefined,
  };
}

/**
 * Completed 2.5 row + no `credits_cost` + a task id ⇒ ask Enhancor once for the
 * real cost. Purely additive: any failure leaves the row exactly as it was.
 */
async function backfillCreditsCost(
  supabase: SupabaseAdmin,
  video: GeneratedVideo,
  engine: SeedanceEngine
): Promise<GeneratedVideo> {
  if (engine !== "2.5") return video;
  if (video.credits_cost != null) return video;
  if (!video.seedance_task_id) return video;

  try {
    const result = await querySeedance25Task(video.seedance_task_id);
    if (result.cost == null || !Number.isFinite(result.cost)) return video;

    const settings = await getVideoSettings(supabase);
    const usd = Number(creditsToUsd(result.cost, settings.usd_per_credit).toFixed(4));
    await recordActualCost(video.id, usd, { credits: result.cost });

    return { ...video, credits_cost: result.cost, processing_cost: usd };
  } catch (error) {
    console.error("[seedance/status] credits_cost backfill failed (non-fatal):", error);
    return video;
  }
}

function buildStatusResponse(
  video: GeneratedVideo,
  error?: string
): VideoStatusResponse {
  const response: VideoStatusResponse = {
    videoId: video.id,
    status: video.heygen_status ?? "pending",
  };

  if (video.heygen_status === "completed") {
    response.finalVideoUrl =
      video.final_video_url ?? video.raw_video_url ?? undefined;
    response.thumbnailUrl = video.thumbnail_url ?? undefined;
    response.progress = 100;
  } else if (video.heygen_status === "captioning") {
    response.progress = 85;
  } else if (video.heygen_status === "processing") {
    response.progress = 50;
  } else if (video.heygen_status === "pending") {
    response.progress = 10;
  }

  // ── Seedance 2.5 metadata (absent on pre-migration rows) ────
  if (video.engine) response.engine = video.engine;
  if (video.seedance_mode !== undefined) response.mode = video.seedance_mode;
  if (video.resolution !== undefined) response.resolution = video.resolution;
  if (video.quality_tier !== undefined) {
    response.qualityTier = video.quality_tier as QualityTier | null;
  }
  if (video.requested_duration !== undefined) {
    response.requestedDuration = video.requested_duration;
  }
  if (video.credits_cost !== undefined) {
    response.creditsCost = video.credits_cost == null ? null : Number(video.credits_cost);
  }
  if (video.processing_cost !== undefined && video.processing_cost !== null) {
    response.costUsd = Number(video.processing_cost);
  }
  if (video.error_message !== undefined) response.errorMessage = video.error_message;
  if (video.rerender_of !== undefined) response.rerenderOf = video.rerender_of;

  if (error) {
    response.error = error;
  }

  return response;
}
