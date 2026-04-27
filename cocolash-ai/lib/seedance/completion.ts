import { createAdminClient } from "@/lib/supabase/server";
import { recordActualCost } from "@/lib/costs/tracker";
import { SEEDANCE_COSTS } from "@/lib/seedance/types";
import { processVideo } from "@/lib/video/processor";
import type { GeneratedVideo } from "@/lib/types";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;

interface CompleteSeedanceVideoParams {
  supabase: SupabaseAdmin;
  video: GeneratedVideo;
  rawVideoUrl: string;
  thumbnailUrl?: string | null;
}

export async function completeSeedanceVideo({
  supabase,
  video,
  rawVideoUrl,
  thumbnailUrl: providerThumbnailUrl,
}: CompleteSeedanceVideoParams): Promise<GeneratedVideo> {
  if (!isSafePublicHttpsUrl(rawVideoUrl)) {
    console.error("[seedance/complete] Unsafe result URL rejected:", rawVideoUrl);
    await supabase
      .from("generated_videos")
      .update({
        heygen_status: "failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", video.id);

    return { ...video, heygen_status: "failed" };
  }

  if (video.heygen_status === "completed") {
    return video;
  }

  const { data: claimed, error: claimError } = await supabase
    .from("generated_videos")
    .update({
      heygen_status: "captioning",
      raw_video_url: rawVideoUrl,
    })
    .eq("id", video.id)
    .in("heygen_status", ["pending", "processing"])
    .select();

  if (claimError) {
    console.error("[seedance/complete] Claim error:", claimError);
  }

  if (!claimed || claimed.length === 0) {
    const { data: fresh } = await supabase
      .from("generated_videos")
      .select("*")
      .eq("id", video.id)
      .single();

    return (fresh ?? video) as GeneratedVideo;
  }

  const runningVideo: GeneratedVideo = {
    ...video,
    heygen_status: "captioning",
    raw_video_url: rawVideoUrl,
  };

  const updateData: Record<string, unknown> = {
    heygen_status: "completed",
    raw_video_url: rawVideoUrl,
    final_video_url: rawVideoUrl,
    thumbnail_url: providerThumbnailUrl ?? null,
    completed_at: new Date().toISOString(),
  };

  try {
    let scriptText: string | undefined;
    if (video.script_id) {
      const { data: script } = await supabase
        .from("video_scripts")
        .select("script_text")
        .eq("id", video.script_id)
        .single();
      scriptText = script?.script_text ?? undefined;
    }

    const processed = await processVideo({
      rawVideoUrl,
      title: "CocoLash Seedance Video",
      scriptText,
      durationSeconds: video.duration_seconds ?? undefined,
      addWatermark: false,
      addCaptions: false,
    });

    updateData.final_video_url = processed.videoUrl;
    updateData.thumbnail_url = processed.thumbnailUrl ?? providerThumbnailUrl ?? null;
  } catch (processError) {
    console.error("[seedance/complete] Post-processing error:", processError);
  }

  const { error: updateError } = await supabase
    .from("generated_videos")
    .update(updateData)
    .eq("id", video.id);

  if (updateError) {
    console.error("[seedance/complete] DB update error:", updateError);
    throw new Error(`DB update failed: ${updateError.message}`);
  }

  try {
    const durationSec = video.duration_seconds ?? 15;
    const totalCost =
      durationSec * SEEDANCE_COSTS.COST_PER_SECOND_720P_NO_VIDEO +
      SEEDANCE_COSTS.POST_PROCESSING;
    await recordActualCost(video.id, totalCost);
  } catch (costError) {
    console.error("[seedance/complete] Cost recording failed (non-fatal):", costError);
  }

  return {
    ...runningVideo,
    heygen_status: "completed",
    final_video_url: (updateData.final_video_url as string) ?? rawVideoUrl,
    thumbnail_url: (updateData.thumbnail_url as string | null) ?? null,
    completed_at: updateData.completed_at as string,
  };
}

function isSafePublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "metadata.google.internal"
    ) {
      return false;
    }

    const ipv6Mapped = hostname.match(/^\[?::ffff:(\d+\.\d+\.\d+\.\d+)\]?$/)?.[1];
    if (ipv6Mapped && isPrivateIpv4(ipv6Mapped)) {
      return false;
    }

    return !isPrivateIpv4(hostname) && hostname !== "::1" && hostname !== "[::1]";
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
  );
}
