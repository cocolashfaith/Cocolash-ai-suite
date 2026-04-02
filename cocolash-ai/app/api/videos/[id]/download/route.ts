import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { GeneratedVideo } from "@/lib/types";

/**
 * GET /api/videos/[id]/download
 *
 * Proxies the video download by redirecting to the Cloudinary/HeyGen video URL.
 * Sets Content-Disposition header to trigger browser download.
 *
 * Query params:
 * - type: "original" | "captioned" | "watermarked" (default: best available)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!id) {
      return NextResponse.json(
        { error: "Video ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient();

    const { data: video, error } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    const typedVideo = video as GeneratedVideo;

    // Determine download URL based on type preference
    let downloadUrl: string | null = null;

    switch (type) {
      case "original":
        downloadUrl = typedVideo.raw_video_url;
        break;
      case "captioned":
        downloadUrl = typedVideo.has_captions
          ? typedVideo.final_video_url
          : typedVideo.raw_video_url;
        break;
      case "watermarked":
        downloadUrl = typedVideo.final_video_url;
        break;
      default:
        // Best available: final > raw
        downloadUrl = typedVideo.final_video_url ?? typedVideo.raw_video_url;
    }

    if (!downloadUrl) {
      return NextResponse.json(
        { error: "Video file is not yet available — generation may still be in progress" },
        { status: 404 }
      );
    }

    // Fetch the video binary and stream it as a download
    const videoResponse = await fetch(downloadUrl);
    if (!videoResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch video file" },
        { status: 502 }
      );
    }

    const contentType = videoResponse.headers.get("content-type") || "video/mp4";
    const videoBuffer = await videoResponse.arrayBuffer();

    const filename = `cocolash-video-${id.substring(0, 8)}.mp4`;

    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(videoBuffer.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: unknown) {
    console.error("[videos/download] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to download video";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
