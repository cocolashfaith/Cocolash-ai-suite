/**
 * POST /api/videos/[id]/caption
 *
 * Burns styled captions onto a completed video using Shotstack's cloud
 * rendering API. Allows users to add/re-add captions after generation.
 *
 * Flow:
 * 1. Fetch video record + script from DB
 * 2. Generate SRT from script text (or use stored caption_srt)
 * 3. Upload SRT to Cloudinary, submit Shotstack render
 * 4. Poll until done, upload captioned MP4 to Cloudinary
 * 5. Update DB record with captioned URL
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateSRTFromScript } from "@/lib/video/captions";
import { burnCaptionsWithShotstack } from "@/lib/shotstack/client";
import { uploadVideoFromUrl } from "@/lib/cloudinary/video";
import type { GeneratedVideo } from "@/lib/types";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
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

    if (!process.env.SHOTSTACK_API_KEY) {
      return NextResponse.json(
        { error: "Shotstack API key is not configured" },
        { status: 503 }
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

    if (typedVideo.heygen_status !== "completed") {
      return NextResponse.json(
        { error: "Video must be completed before adding captions" },
        { status: 400 }
      );
    }

    const sourceVideoUrl =
      typedVideo.raw_video_url ?? typedVideo.final_video_url;

    if (!sourceVideoUrl) {
      return NextResponse.json(
        { error: "No video URL available for captioning" },
        { status: 400 }
      );
    }

    // Use stored SRT if available, otherwise generate from script
    let srtContent: string | null = typedVideo.caption_srt ?? null;

    if (!srtContent) {
      let scriptText: string | null = typedVideo.script_text_cache ?? null;
      if (!scriptText && typedVideo.script_id) {
        const { data: script } = await supabase
          .from("video_scripts")
          .select("script_text")
          .eq("id", typedVideo.script_id)
          .single();
        scriptText = script?.script_text ?? null;
      }

      if (!scriptText) {
        return NextResponse.json(
          { error: "No script text available for caption generation" },
          { status: 400 }
        );
      }

      const duration = typedVideo.duration_seconds ?? 30;
      srtContent = generateSRTFromScript(scriptText, duration);

      if (!srtContent) {
        return NextResponse.json(
          { error: "Failed to generate SRT from script" },
          { status: 500 }
        );
      }
    }

    const duration = typedVideo.duration_seconds ?? 30;
    const videoPublicId = `video-${id}`;

    console.log(`[caption] Starting Shotstack caption burn for video ${id}`);

    const { captionedVideoUrl, renderId } = await burnCaptionsWithShotstack({
      videoUrl: sourceVideoUrl,
      srtContent,
      durationSeconds: duration,
      videoPublicId,
      aspectRatio: (typedVideo.aspect_ratio as "9:16" | "16:9" | "1:1") ?? "9:16",
    });

    const uploaded = await uploadVideoFromUrl(captionedVideoUrl, {
      title: "CocoLash Video (captioned)",
      tags: ["cocolash", "brand-content", "captioned", "shotstack"],
    });

    console.log(`[caption] Shotstack burn complete — uploaded to Cloudinary`);

    await supabase
      .from("generated_videos")
      .update({
        final_video_url: uploaded.secureUrl,
        has_captions: true,
      })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      captionedUrl: uploaded.secureUrl,
      captionMethod: "shotstack",
      renderId,
    });
  } catch (error: unknown) {
    console.error("[caption] Error:", error);
    const message =
      error instanceof Error ? error.message : "Caption burning failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
