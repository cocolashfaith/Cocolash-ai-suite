/**
 * POST /api/videos/[id]/caption
 *
 * Burns styled captions onto a completed video using FFmpeg WASM.
 * This is a separate endpoint so users can add/re-add captions
 * after video generation with different styles.
 *
 * Flow:
 * 1. Fetch video record + script from DB
 * 2. Generate SRT from script text
 * 3. Burn captions via FFmpeg WASM (ASS subtitles with pill background)
 * 4. Upload captioned video to Cloudinary
 * 5. Update DB record with captioned URL
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateSRTFromScript } from "@/lib/video/captions";
import { burnCaptions, isFFmpegAvailable } from "@/lib/video/ffmpeg-captions";
import { uploadVideoFromBuffer } from "@/lib/cloudinary/video";
import type { GeneratedVideo, VideoCaptionStyle } from "@/lib/types";
import { DEFAULT_CAPTION_STYLE } from "@/lib/types";

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

    const body = await request.json().catch(() => ({}));
    const captionStyle: VideoCaptionStyle = {
      ...DEFAULT_CAPTION_STYLE,
      ...(body.captionStyle ?? {}),
    };

    const supabase = await createAdminClient();

    // Fetch video record
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

    // Fetch script text for SRT generation
    let scriptText: string | null = null;
    if (typedVideo.script_id) {
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

    // Check FFmpeg availability
    const ffmpegReady = await isFFmpegAvailable();
    if (!ffmpegReady) {
      return NextResponse.json(
        { error: "FFmpeg WASM is not available in this environment" },
        { status: 503 }
      );
    }

    // Generate SRT
    const srtContent = generateSRTFromScript(scriptText, duration);
    if (!srtContent) {
      return NextResponse.json(
        { error: "Failed to generate SRT from script" },
        { status: 500 }
      );
    }

    // Burn captions
    console.log(`[caption] Starting FFmpeg burn for video ${id}`);
    const captionedBuffer = await burnCaptions(
      sourceVideoUrl,
      srtContent,
      captionStyle,
    );
    console.log(
      `[caption] FFmpeg burn complete — ${(captionedBuffer.length / 1024 / 1024).toFixed(1)}MB`
    );

    // Upload to Cloudinary
    const uploaded = await uploadVideoFromBuffer(captionedBuffer, {
      title: `CocoLash Video (captioned)`,
      tags: ["cocolash", "brand-content", "captioned", "ffmpeg"],
    });

    // Update DB record
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
      captionMethod: "ffmpeg-burn",
      fileSizeMB: Number((captionedBuffer.length / 1024 / 1024).toFixed(1)),
    });
  } catch (error: unknown) {
    console.error("[caption] Error:", error);
    const message =
      error instanceof Error ? error.message : "Caption burning failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
