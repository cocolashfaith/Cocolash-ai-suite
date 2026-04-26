import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getVideoStatus } from "@/lib/heygen/client";
import { HeyGenError } from "@/lib/heygen/types";
import { processVideo } from "@/lib/video/processor";
import { calculateVideoCost, recordActualCost } from "@/lib/costs/tracker";
import { burnCaptionsWithShotstack } from "@/lib/shotstack/client";
import { uploadVideoFromUrl } from "@/lib/cloudinary/video";
import type { GeneratedVideo, VideoStatusResponse } from "@/lib/types";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;

/**
 * GET /api/videos/[id]/status
 *
 * Polls the current status of a video generation request.
 *
 * State machine:
 *   pending → processing → (HeyGen done) → captioning → completed
 *                                      ↘ failed
 *
 * The `captioning` state is used as a distributed lock: we atomically
 * UPDATE the row to "captioning" (only if it wasn't already) before
 * starting the expensive post-processing + Shotstack render. That way
 * parallel polls from the frontend don't each spawn their own render.
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

    // Terminal states — return cached result.
    if (typedVideo.heygen_status === "failed") {
      return NextResponse.json(buildStatusResponse(typedVideo));
    }

    if (typedVideo.heygen_status === "completed") {
      // Edge case: HeyGen done, captions missing (Shotstack failed previously).
      // Try once to repair — guarded by the atomic claim so only one poll wins.
      if (!typedVideo.has_captions && typedVideo.caption_srt) {
        const repaired = await tryRepairCaptions(supabase, id, typedVideo);
        return NextResponse.json(buildStatusResponse(repaired));
      }
      return NextResponse.json(buildStatusResponse(typedVideo));
    }

    // Someone else is currently running the captioning step — just report status.
    if (typedVideo.heygen_status === "captioning") {
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
        buildStatusResponse({ ...typedVideo, heygen_status: "failed" }, errorMsg)
      );
    }

    if (heygenStatus.status !== "completed") {
      const mappedStatus =
        heygenStatus.status === "waiting" ? "processing" : heygenStatus.status;

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
    }

    // ── HeyGen done: claim the post-processing ───────────────────
    // Atomic: flip the row to "captioning" ONLY if no-one else already has.
    // If the update returns 0 rows, another poller is handling it — we bail.
    const { data: claimed, error: claimErr } = await supabase
      .from("generated_videos")
      .update({ heygen_status: "captioning" })
      .eq("id", id)
      .in("heygen_status", ["pending", "processing", "waiting"])
      .select();

    if (claimErr) {
      console.error("[videos/status] Claim error:", claimErr);
    }
    if (!claimed || claimed.length === 0) {
      // Lost the race — return whatever the current state is.
      const { data: fresh } = await supabase
        .from("generated_videos")
        .select("*")
        .eq("id", id)
        .single();
      return NextResponse.json(buildStatusResponse((fresh ?? typedVideo) as GeneratedVideo));
    }

    const runningVideo: GeneratedVideo = {
      ...typedVideo,
      heygen_status: "captioning",
    };

    try {
      const finalized = await runPostProcessing(
        supabase,
        id,
        runningVideo,
        heygenStatus
      );
      return NextResponse.json(buildStatusResponse(finalized));
    } catch (err) {
      console.error("[videos/status] Post-processing failed, releasing lock:", err);
      // Release the lock so the next poll can retry. We keep has_captions
      // unchanged; the frontend will see `completed` without captions and
      // the next poll will fall into the repair path.
      const rawVideoUrl = heygenStatus.video_url ?? null;
      await supabase
        .from("generated_videos")
        .update({
          heygen_status: "completed",
          raw_video_url: rawVideoUrl,
          final_video_url: rawVideoUrl,
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);

      return NextResponse.json(
        buildStatusResponse(
          {
            ...runningVideo,
            heygen_status: "completed",
            raw_video_url: rawVideoUrl,
            final_video_url: rawVideoUrl,
          },
          "Post-processing error — video ready without captions"
        )
      );
    }
  } catch (error: unknown) {
    console.error("[videos/status] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to check video status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Post-processing pipeline (ONLY runs once per video) ──────────

interface HeygenStatusLike {
  video_url?: string | null;
  video_url_caption?: string | null;
  thumbnail_url?: string | null;
  duration?: number;
}

async function runPostProcessing(
  supabase: SupabaseAdmin,
  id: string,
  video: GeneratedVideo,
  heygenStatus: HeygenStatusLike
): Promise<GeneratedVideo> {
  const rawVideoUrl = heygenStatus.video_url ?? null;
  const heygenCaptionUrl = heygenStatus.video_url_caption ?? null;
  const heygenDuration = heygenStatus.duration
    ? Math.round(heygenStatus.duration)
    : video.duration_seconds;

  const updateData: Record<string, unknown> = {
    raw_video_url: rawVideoUrl,
    duration_seconds: heygenDuration,
  };

  let finalVideoUrl: string | null = null;
  let processedVideoUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  let hasCaptions = video.has_captions;

  if (rawVideoUrl) {
    try {
      const processed = await processVideo({
        rawVideoUrl,
        title: `CocoLash Video`,
        durationSeconds: heygenDuration ?? undefined,
        addWatermark: video.has_watermark,
        addCaptions: false,
      });

      finalVideoUrl = processed.videoUrl;
      processedVideoUrl = processed.videoUrl;
      thumbnailUrl = processed.thumbnailUrl;
      updateData.thumbnail_url = thumbnailUrl;

      // Burn styled captions via Shotstack if SRT is available.
      const captionSrt = video.caption_srt;
      if (captionSrt && process.env.SHOTSTACK_API_KEY) {
        console.log("[videos/status] Starting Shotstack caption burn…");
        const { captionedVideoUrl } = await burnCaptionsWithShotstack({
          videoUrl: processed.videoUrl,
          srtContent: captionSrt,
          durationSeconds: heygenDuration ?? 30,
          videoPublicId: processed.cloudinaryPublicId,
          aspectRatio: (video.aspect_ratio as "9:16" | "16:9" | "1:1") ?? "9:16",
        });

        const captionedUpload = await uploadVideoFromUrl(captionedVideoUrl, {
          title: "CocoLash Video (captioned)",
          tags: ["cocolash", "brand-content", "captioned", "shotstack"],
        });

        finalVideoUrl = captionedUpload.secureUrl;
        hasCaptions = true;
        console.log("[videos/status] Shotstack captioned video uploaded to Cloudinary");
      } else if (video.script_text_cache) {
        // No SRT but we have a script — treat as captioned (legacy overlay path).
        hasCaptions = true;
      }
    } catch (processError) {
      console.error("[videos/status] Post-processing error:", processError);
      // Keep the durable Cloudinary processed URL if it already exists. Falling
      // back to HeyGen's raw URL can point users at an expiring source asset.
      finalVideoUrl = processedVideoUrl ?? heygenCaptionUrl ?? rawVideoUrl;
      thumbnailUrl = heygenStatus.thumbnail_url ?? null;
      updateData.thumbnail_url = thumbnailUrl;
    }
  } else {
    finalVideoUrl = heygenCaptionUrl ?? null;
    thumbnailUrl = heygenStatus.thumbnail_url ?? null;
    updateData.thumbnail_url = thumbnailUrl;
  }

  updateData.final_video_url = finalVideoUrl;
  updateData.has_captions = hasCaptions;
  updateData.heygen_status = "completed";
  updateData.completed_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("generated_videos")
    .update(updateData)
    .eq("id", id);

  if (updateError) {
    console.error("[videos/status] DB update error:", updateError);
    throw new Error(`DB update failed: ${updateError.message}`);
  }

  try {
    const costEstimate = calculateVideoCost({
      duration: heygenDuration ?? 30,
      addCaptions: hasCaptions,
      addWatermark: video.has_watermark,
      needsScriptGeneration: !!video.script_id,
    });
    await recordActualCost(id, costEstimate.total);
  } catch (costError) {
    console.error("[videos/status] Cost recording failed (non-fatal):", costError);
  }

  return {
    ...video,
    heygen_status: "completed",
    raw_video_url: rawVideoUrl,
    final_video_url: finalVideoUrl,
    thumbnail_url: thumbnailUrl,
    duration_seconds: heygenDuration ?? video.duration_seconds,
    has_captions: hasCaptions,
    completed_at: updateData.completed_at as string,
  };
}

// ── Repair path for legacy videos stuck at completed w/o captions ──

async function tryRepairCaptions(
  supabase: SupabaseAdmin,
  id: string,
  video: GeneratedVideo
): Promise<GeneratedVideo> {
  const captionSrt = video.caption_srt;
  const videoUrl = video.final_video_url ?? video.raw_video_url;

  if (!captionSrt || !videoUrl || !process.env.SHOTSTACK_API_KEY) {
    return video;
  }

  // Atomic claim for repair too: flip completed → captioning only if no one else has.
  const { data: claimed } = await supabase
    .from("generated_videos")
    .update({ heygen_status: "captioning" })
    .eq("id", id)
    .eq("heygen_status", "completed")
    .eq("has_captions", false)
    .select();

  if (!claimed || claimed.length === 0) {
    // Lost the race (or no longer eligible) — just return current state.
    const { data: fresh } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("id", id)
      .single();
    return (fresh ?? video) as GeneratedVideo;
  }

  try {
    console.log("[videos/status] Repairing captions for completed video…");
    const { captionedVideoUrl } = await burnCaptionsWithShotstack({
      videoUrl,
      srtContent: captionSrt,
      durationSeconds: video.duration_seconds ?? 30,
      videoPublicId: `video-${id}`,
      aspectRatio: (video.aspect_ratio as "9:16" | "16:9" | "1:1") ?? "9:16",
    });

    const captionedUpload = await uploadVideoFromUrl(captionedVideoUrl, {
      title: "CocoLash Video (captioned)",
      tags: ["cocolash", "brand-content", "captioned", "shotstack"],
    });

    const { error: updateError } = await supabase
      .from("generated_videos")
      .update({
        heygen_status: "completed",
        final_video_url: captionedUpload.secureUrl,
        has_captions: true,
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(`Repair DB update failed: ${updateError.message}`);
    }

    return {
      ...video,
      heygen_status: "completed",
      final_video_url: captionedUpload.secureUrl,
      has_captions: true,
    };
  } catch (err) {
    console.error("[videos/status] Caption repair failed:", err);
    // Stop automatic repair from submitting a fresh paid Shotstack render on
    // every poll if the caption payload/source is persistently failing.
    const { error: clearError } = await supabase
      .from("generated_videos")
      .update({
        heygen_status: "completed",
        caption_srt: null,
      })
      .eq("id", id);
    if (clearError) {
      console.error("[videos/status] Failed to clear failed caption repair:", clearError);
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
    response.finalVideoUrl = video.final_video_url ?? video.raw_video_url ?? undefined;
    response.thumbnailUrl = video.thumbnail_url ?? undefined;
    response.progress = 100;
    response.captionSrt = video.caption_srt ?? undefined;
    response.scriptTextCache = video.script_text_cache ?? undefined;
    response.durationSeconds = video.duration_seconds ?? undefined;
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
