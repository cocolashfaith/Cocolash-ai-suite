import { createAdminClient } from "@/lib/supabase/server";
import { recordActualCost } from "@/lib/costs/tracker";
import { creditsToUsd } from "@/lib/seedance/pricing";
import { getVideoSettings } from "@/lib/settings/video-settings";
import { SEEDANCE_COSTS } from "@/lib/seedance/types";
import { isPublicHttpsUrl } from "@/lib/seedance/v25/schema";
import { processVideo } from "@/lib/video/processor";
import type { GeneratedVideo, SeedanceEngine } from "@/lib/types";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;

interface CompleteSeedanceVideoParams {
  supabase: SupabaseAdmin;
  video: GeneratedVideo;
  rawVideoUrl: string;
  thumbnailUrl?: string | null;
  /**
   * Actual Enhancor credits from the 2.5 webhook / status `cost` field.
   * When present the provisional `processing_cost` estimate is replaced by
   * `credits × video_settings.usd_per_credit`; when absent the estimate stands.
   */
  creditsCost?: number | null;
  /** Defaults to "2.0" so every existing caller keeps the legacy cost formula. */
  engine?: SeedanceEngine;
}

export async function completeSeedanceVideo({
  supabase,
  video,
  rawVideoUrl,
  thumbnailUrl: providerThumbnailUrl,
  creditsCost = null,
  engine = "2.0",
}: CompleteSeedanceVideoParams): Promise<GeneratedVideo> {
  if (!isPublicHttpsUrl(rawVideoUrl)) {
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

  // A provider thumbnail is rendered in an <img> on our pages, so it gets the
  // SAME SSRF/scheme guard as the video URL — an unusable one is simply dropped
  // (Cloudinary post-processing below usually replaces it anyway).
  const safeProviderThumbnailUrl =
    providerThumbnailUrl && isPublicHttpsUrl(providerThumbnailUrl)
      ? providerThumbnailUrl
      : null;
  if (providerThumbnailUrl && !safeProviderThumbnailUrl) {
    console.warn("[seedance/complete] Dropped unsafe thumbnail URL for video", video.id);
  }

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
      thumbnail_url: safeProviderThumbnailUrl,
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
  let thumbnailUrl = safeProviderThumbnailUrl;
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
    thumbnailUrl = processed.thumbnailUrl ?? safeProviderThumbnailUrl;

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

  // Cost. Engine 2.5 reports the REAL credit spend on the callback — record it
  // (and the USD it converts to at the live rate). Engine 2.0 never reports a
  // cost, so its legacy per-second estimate formula is unchanged.
  let recordedCostUsd: number | null = null;
  try {
    if (engine === "2.5") {
      if (creditsCost != null && Number.isFinite(creditsCost)) {
        const settings = await getVideoSettings(supabase);
        const usd = Number(creditsToUsd(creditsCost, settings.usd_per_credit).toFixed(4));
        await recordActualCost(video.id, usd, { credits: creditsCost });
        recordedCostUsd = usd;
      }
      // No cost in the callback → leave the provisional estimate written at insert.
    } else {
      const durationSec = video.duration_seconds ?? 15;
      const totalCost =
        durationSec * SEEDANCE_COSTS.COST_PER_SECOND_720P_NO_VIDEO +
        SEEDANCE_COSTS.POST_PROCESSING;
      await recordActualCost(video.id, totalCost);
      recordedCostUsd = totalCost;
    }
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
    credits_cost: creditsCost ?? video.credits_cost ?? null,
    // The in-wizard card renders `processing_cost`. When the real spend was
    // just recorded it must replace the provisional estimate here too,
    // otherwise the card shows the estimate until the page is reloaded.
    processing_cost: recordedCostUsd ?? video.processing_cost ?? null,
  };
}
