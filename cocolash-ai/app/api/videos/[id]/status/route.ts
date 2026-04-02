import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getVideoStatus } from "@/lib/heygen/client";
import { HeyGenError } from "@/lib/heygen/types";
import { processVideo } from "@/lib/video/processor";
import type { GeneratedVideo, VideoStatusResponse } from "@/lib/types";

/**
 * GET /api/videos/[id]/status
 *
 * Polls the current status of a video generation request.
 *
 * Flow:
 * 1. Fetch video record from `generated_videos`
 * 2. If status is "processing" or "pending", poll HeyGen for an update
 * 3. If HeyGen returns "completed":
 *    - Store raw video URL, thumbnail URL, duration
 *    - Mark status as "completed" (post-processing happens in Phase 2.5)
 * 4. If HeyGen returns "failed", store error and mark as failed
 * 5. Return current status to the client for UI polling
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

    if (!typedVideo.heygen_video_id) {
      return NextResponse.json(
        buildStatusResponse(typedVideo, "Video has no HeyGen ID — generation may not have started")
      );
    }

    let heygenStatus;
    try {
      heygenStatus = await getVideoStatus(typedVideo.heygen_video_id);
    } catch (error) {
      console.error("[videos/status] HeyGen poll error:", error);

      if (error instanceof HeyGenError) {
        return NextResponse.json(
          buildStatusResponse(typedVideo, `HeyGen API error: ${error.message}`)
        );
      }

      return NextResponse.json(
        buildStatusResponse(typedVideo, "Failed to check video status")
      );
    }

    if (heygenStatus.status === "completed") {
      const rawVideoUrl = heygenStatus.video_url ?? null;
      const heygenCaptionUrl = heygenStatus.video_url_caption ?? null;
      const heygenDuration = heygenStatus.duration
        ? Math.round(heygenStatus.duration)
        : typedVideo.duration_seconds;

      const updateData: Record<string, unknown> = {
        heygen_status: "completed",
        raw_video_url: rawVideoUrl,
        duration_seconds: heygenDuration,
        completed_at: new Date().toISOString(),
      };

      // Run Cloudinary post-processing if we have a raw video URL
      if (rawVideoUrl) {
        try {
          // Fetch script text for SRT generation if needed
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
            title: `CocoLash Video`,
            scriptText,
            durationSeconds: heygenDuration ?? undefined,
            addWatermark: typedVideo.has_watermark,
            addCaptions: typedVideo.has_captions,
            heygenCaptionUrl,
          });

          updateData.final_video_url = processed.videoUrl;
          updateData.thumbnail_url = processed.thumbnailUrl;

          if (heygenCaptionUrl || processed.captionedUrl) {
            updateData.has_captions = true;
          }
        } catch (processError) {
          console.error("[videos/status] Post-processing error:", processError);
          // Fall back to HeyGen URLs if Cloudinary fails
          updateData.final_video_url = heygenCaptionUrl ?? rawVideoUrl;
          updateData.thumbnail_url = heygenStatus.thumbnail_url ?? null;
        }
      } else {
        updateData.final_video_url = heygenCaptionUrl ?? null;
        updateData.thumbnail_url = heygenStatus.thumbnail_url ?? null;
      }

      const { error: updateError } = await supabase
        .from("generated_videos")
        .update(updateData)
        .eq("id", id);

      if (updateError) {
        console.error("[videos/status] DB update error:", updateError);
      }

      const updatedVideo: GeneratedVideo = {
        ...typedVideo,
        heygen_status: "completed",
        raw_video_url: (updateData.raw_video_url as string) ?? null,
        final_video_url: (updateData.final_video_url as string) ?? null,
        thumbnail_url: (updateData.thumbnail_url as string) ?? null,
        duration_seconds: (updateData.duration_seconds as number) ?? null,
        has_captions: (updateData.has_captions as boolean) ?? typedVideo.has_captions,
        completed_at: updateData.completed_at as string,
      };

      return NextResponse.json(buildStatusResponse(updatedVideo));
    }

    if (heygenStatus.status === "failed") {
      const errorMsg = heygenStatus.error ?? "Video generation failed on HeyGen";

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

    const mappedStatus =
      heygenStatus.status === "waiting" ? "processing" : heygenStatus.status;

    if (mappedStatus !== typedVideo.heygen_status) {
      await supabase
        .from("generated_videos")
        .update({ heygen_status: mappedStatus })
        .eq("id", id);
    }

    return NextResponse.json(
      buildStatusResponse({ ...typedVideo, heygen_status: mappedStatus as GeneratedVideo["heygen_status"] })
    );
  } catch (error: unknown) {
    console.error("[videos/status] Error:", error);
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
    response.finalVideoUrl = video.final_video_url ?? video.raw_video_url ?? undefined;
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
