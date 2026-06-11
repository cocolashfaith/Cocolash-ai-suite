import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { querySeedanceTask } from "@/lib/seedance/client";
import { completeSeedanceVideo } from "@/lib/seedance/completion";
import { SeedanceError } from "@/lib/seedance/types";
import { burnAndUploadCaptions } from "@/lib/video/burn-captions";
import type { GeneratedVideo, VideoStatusResponse } from "@/lib/types";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;

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

    if (typedVideo.heygen_status === "completed") {
      // Edge case: video done but captions missing (Shotstack failed earlier).
      // Try once to repair — guarded by an atomic claim so only one poll wins.
      // Mirrors HeyGen's tryRepairCaptions.
      if (!typedVideo.has_captions && typedVideo.caption_srt) {
        const repaired = await tryRepairSeedanceCaptions(supabase, id, typedVideo);
        return NextResponse.json(buildStatusResponse(repaired));
      }
      return NextResponse.json(buildStatusResponse(typedVideo));
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

// ── Repair path for videos stuck at completed without captions ──
// Mirrors tryRepairCaptions in app/api/videos/[id]/status/route.ts (HeyGen).

async function tryRepairSeedanceCaptions(
  supabase: SupabaseAdmin,
  id: string,
  video: GeneratedVideo
): Promise<GeneratedVideo> {
  const captionSrt = video.caption_srt;
  const videoUrl = video.final_video_url ?? video.raw_video_url;

  if (!captionSrt || !videoUrl || !process.env.SHOTSTACK_API_KEY) {
    return video;
  }

  // Atomic claim: flip completed → captioning only if no-one else has, and only
  // while still uncaptioned.
  const { data: claimed } = await supabase
    .from("generated_videos")
    .update({ heygen_status: "captioning" })
    .eq("id", id)
    .eq("heygen_status", "completed")
    .eq("has_captions", false)
    .select();

  if (!claimed || claimed.length === 0) {
    const { data: fresh } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("id", id)
      .single();
    return (fresh ?? video) as GeneratedVideo;
  }

  try {
    const captionedUrl = await burnAndUploadCaptions({
      videoUrl,
      srtContent: captionSrt,
      durationSeconds: video.duration_seconds ?? 15,
      videoPublicId: `seedance-${id}`,
      aspectRatio: (video.aspect_ratio as "9:16" | "16:9" | "1:1") ?? "9:16",
    });

    const { error: updateError } = await supabase
      .from("generated_videos")
      .update({
        heygen_status: "completed",
        final_video_url: captionedUrl,
        has_captions: true,
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(`Repair DB update failed: ${updateError.message}`);
    }

    return {
      ...video,
      heygen_status: "completed",
      final_video_url: captionedUrl,
      has_captions: true,
    };
  } catch (err) {
    console.error("[seedance/status] Caption repair failed:", err);
    // Stop re-submitting a paid Shotstack render on every poll if the caption
    // source/payload is persistently failing.
    const { error: clearError } = await supabase
      .from("generated_videos")
      .update({ heygen_status: "completed", caption_srt: null })
      .eq("id", id);
    if (clearError) {
      console.error(
        "[seedance/status] Failed to clear failed caption repair:",
        clearError
      );
    }
    return { ...video, heygen_status: "completed", caption_srt: null };
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
