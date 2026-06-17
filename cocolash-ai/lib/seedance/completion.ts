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

  const completedAt = new Date().toISOString();

  // Atomic claim → completed. Only one poll/webhook wins. Seedance videos carry
  // NO captions (captions are a HeyGen-only feature), so there is no
  // "captioning" step — the video goes straight to completed. We also accept a
  // stale "captioning" status here so any video left in that transient state by
  // the old caption pipeline drains cleanly to completed (uncaptioned).
  const { data: claimed, error: claimError } = await supabase
    .from("generated_videos")
    .update({
      heygen_status: "completed",
      raw_video_url: rawVideoUrl,
      final_video_url: rawVideoUrl, // provisional; upgraded to Cloudinary below
      thumbnail_url: providerThumbnailUrl ?? null,
      has_captions: false,
      caption_srt: null,
      completed_at: completedAt,
    })
    .eq("id", video.id)
    .in("heygen_status", ["pending", "processing", "captioning"])
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

  // Best-effort: re-host the raw provider video on Cloudinary for a durable URL
  // + thumbnail. No captions are ever burned for Seedance. On failure the video
  // is still playable on the raw provider URL set in the claim above.
  let finalVideoUrl = rawVideoUrl;
  let thumbnailUrl = providerThumbnailUrl ?? null;
  try {
    const processed = await processVideo({
      rawVideoUrl,
      title: "CocoLash Seedance Video",
      scriptText: video.script_text_cache ?? undefined,
      durationSeconds: video.duration_seconds ?? undefined,
      addWatermark: false,
      addCaptions: false,
    });

    finalVideoUrl = processed.videoUrl;
    thumbnailUrl = processed.thumbnailUrl ?? providerThumbnailUrl ?? null;

    const { error: updateError } = await supabase
      .from("generated_videos")
      .update({ final_video_url: finalVideoUrl, thumbnail_url: thumbnailUrl })
      .eq("id", video.id);

    if (updateError) {
      console.error("[seedance/complete] Final URL update error:", updateError);
    }
  } catch (processError) {
    console.error("[seedance/complete] Post-processing error:", processError);
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
    ...video,
    heygen_status: "completed",
    raw_video_url: rawVideoUrl,
    final_video_url: finalVideoUrl,
    thumbnail_url: thumbnailUrl,
    caption_srt: null,
    has_captions: false,
    completed_at: completedAt,
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
