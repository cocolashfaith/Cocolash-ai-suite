import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { querySeedanceTask } from "@/lib/seedance/client";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import { SeedanceError } from "@/lib/seedance/types";
import type { GeneratedVideo, VideoStatusResponse } from "@/lib/types";

/**
 * GET /api/seedance/[id]/status
 *
 * Polls the current status of a Seedance video generation request.
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

    if (
      typedVideo.heygen_status === "completed" ||
      typedVideo.heygen_status === "failed"
    ) {
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

    if (typedVideo.heygen_status === "captioning") {
      return NextResponse.json(buildStatusResponse(typedVideo));
    }

    // Poll Enhancor for status update. The webhook path can also complete this
    // record, so polling errors are non-terminal unless Enhancor says FAILED.
    let taskStatus;
    try {
      taskStatus = await querySeedanceTask(typedVideo.seedance_task_id);
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

    if (taskStatus.status === "COMPLETED") {
      const rawVideoUrl = taskStatus.output?.video_url ?? null;
      if (!rawVideoUrl) {
        return NextResponse.json(
          buildStatusResponse(typedVideo, "Enhancor completed without a video URL")
        );
      }

      const updatedVideo = await completeSeedanceVideo({
        supabase,
        video: typedVideo,
        rawVideoUrl,
        thumbnailUrl: taskStatus.output?.thumbnail_url ?? null,
      });
      return NextResponse.json(buildStatusResponse(updatedVideo));
    }

    if (taskStatus.status === "FAILED") {
      const errorMsg = taskStatus.error ?? "Seedance video generation failed";

      await supabase
        .from("generated_videos")
        .update({
          heygen_status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);

      return NextResponse.json(
        buildStatusResponse(
          { ...typedVideo, heygen_status: "failed" },
          errorMsg
        )
      );
    }

    // PENDING / IN_QUEUE / IN_PROGRESS / PROCESSING — update status if changed
    const mappedStatus =
      taskStatus.status === "PENDING" ? "pending" : "processing";

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
    console.error("[seedance/status] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to check video status";
    return NextResponse.json({ error: message }, { status: 500 });
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

  if (error) {
    response.error = error;
  }

  return response;
}
