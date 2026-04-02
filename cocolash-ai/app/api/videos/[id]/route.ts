import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { deleteVideo } from "@/lib/cloudinary/video";
import type { GeneratedVideo } from "@/lib/types";

/**
 * GET /api/videos/[id]
 *
 * Returns full details for a single video including script, images, and URLs.
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

    // Fetch video with related script data
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

    // Fetch associated script if present
    let script = null;
    if (typedVideo.script_id) {
      const { data: scriptData } = await supabase
        .from("video_scripts")
        .select("*")
        .eq("id", typedVideo.script_id)
        .single();

      script = scriptData ?? null;
    }

    return NextResponse.json({
      video: typedVideo,
      script,
    });
  } catch (error: unknown) {
    console.error("[videos/detail] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch video";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/videos/[id]
 *
 * Deletes a video record and its associated Cloudinary assets.
 * Also cleans up the associated script if it was auto-generated.
 */
export async function DELETE(
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

    // Fetch video to get Cloudinary public ID for cleanup
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

    // Attempt Cloudinary cleanup (best effort — don't fail if Cloudinary errors)
    if (typedVideo.final_video_url) {
      try {
        const cloudinaryPublicId = extractCloudinaryPublicId(typedVideo.final_video_url);
        if (cloudinaryPublicId) {
          await deleteVideo(cloudinaryPublicId);
        }
      } catch (cloudinaryError) {
        console.warn("[videos/delete] Cloudinary cleanup failed:", cloudinaryError);
      }
    }

    // Delete the DB record
    const { error: deleteError } = await supabase
      .from("generated_videos")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[videos/delete] DB delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete video" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: unknown) {
    console.error("[videos/delete] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete video";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Best-effort extraction of Cloudinary public ID from a URL.
 * Expected pattern: .../cocolash-videos/filename.ext
 */
function extractCloudinaryPublicId(url: string): string | null {
  const match = url.match(/\/(cocolash-videos\/[^.]+)/);
  return match?.[1] ?? null;
}
