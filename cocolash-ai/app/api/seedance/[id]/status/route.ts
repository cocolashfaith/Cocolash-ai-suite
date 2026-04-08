import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { querySeedanceTask } from "@/lib/seedance/client";
import { SeedanceError } from "@/lib/seedance/types";
import { processVideo } from "@/lib/video/processor";
import { SEEDANCE_COSTS } from "@/lib/seedance/types";
import { recordActualCost } from "@/lib/costs/tracker";
import type { GeneratedVideo, VideoStatusResponse } from "@/lib/types";

/**
 * GET /api/seedance/[id]/status
 *
 * Polls the current status of a Seedance video generation request.
 *
 * Flow:
 * 1. Fetch video record from `generated_videos` (pipeline = 'seedance')
 * 2. If status is "processing" or "pending", poll Kie.ai for an update
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

    // Poll Kie.ai for status update
    let taskStatus;
    try {
      taskStatus = await querySeedanceTask(typedVideo.seedance_task_id);
    } catch (error) {
      console.error("[seedance/status] Kie.ai poll error:", error);

      if (error instanceof SeedanceError) {
        return NextResponse.json(
          buildStatusResponse(typedVideo, `Kie.ai API error: ${error.message}`)
        );
      }

      return NextResponse.json(
        buildStatusResponse(typedVideo, "Failed to check video status")
      );
    }

    if (taskStatus.status === "COMPLETED") {
      const rawVideoUrl = taskStatus.output?.video_url ?? null;

      const updateData: Record<string, unknown> = {
        heygen_status: "completed",
        raw_video_url: rawVideoUrl,
        completed_at: new Date().toISOString(),
      };

      // Run Cloudinary post-processing
      if (rawVideoUrl) {
        try {
          let scriptText: string | undefined;
          if (typedVideo.script_id) {
            const { data: script } = await supabase
              .from("video_scripts")
              .select("script_text")
              .eq("id", typedVideo.script_id)
              .single();
            scriptText = script?.script_text ?? undefined;
          }

          const processed = await processVideo({
            rawVideoUrl,
            title: "CocoLash Seedance Video",
            scriptText,
            durationSeconds: typedVideo.duration_seconds ?? undefined,
            addWatermark: false,
            addCaptions: false,
          });

          updateData.final_video_url = processed.videoUrl;
          updateData.thumbnail_url = processed.thumbnailUrl;
        } catch (processError) {
          console.error("[seedance/status] Post-processing error:", processError);
          updateData.final_video_url = rawVideoUrl;
          updateData.thumbnail_url = null;
        }
      }

      const { error: updateError } = await supabase
        .from("generated_videos")
        .update(updateData)
        .eq("id", id);

      if (updateError) {
        console.error("[seedance/status] DB update error:", updateError);
      }

      // Record cost
      const durationSec = typedVideo.duration_seconds ?? 15;
      const totalCost =
        durationSec * SEEDANCE_COSTS.COST_PER_SECOND_720P_NO_VIDEO +
        SEEDANCE_COSTS.POST_PROCESSING;
      await recordActualCost(id, totalCost);

      const updatedVideo: GeneratedVideo = {
        ...typedVideo,
        heygen_status: "completed",
        raw_video_url: (updateData.raw_video_url as string) ?? null,
        final_video_url: (updateData.final_video_url as string) ?? null,
        thumbnail_url: (updateData.thumbnail_url as string) ?? null,
        completed_at: updateData.completed_at as string,
      };

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

    // PENDING or PROCESSING — update status if changed
    const mappedStatus =
      taskStatus.status === "PROCESSING" ? "processing" : "pending";

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
