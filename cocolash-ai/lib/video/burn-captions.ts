/**
 * Shared caption-burn step.
 *
 * This is the exact two-step the HeyGen pipeline uses to produce styled,
 * burned-in captions (see app/api/videos/[id]/status/route.ts):
 *   1. burnCaptionsWithShotstack — render the SRT onto the video (Shotstack)
 *   2. uploadVideoFromUrl        — store the captioned MP4 on Cloudinary
 *
 * Extracted so the Seedance 2.0 pipeline can reuse the SAME pattern without
 * duplicating it (completion + status-route repair both call this).
 */

import { burnCaptionsWithShotstack } from "@/lib/shotstack/client";
import { uploadVideoFromUrl } from "@/lib/cloudinary/video";

export interface BurnCaptionsParams {
  videoUrl: string;
  srtContent: string;
  durationSeconds: number;
  videoPublicId: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
}

/**
 * Burn styled captions onto a video via Shotstack, then persist the result to
 * Cloudinary. Returns the durable captioned video URL. Throws if either the
 * render or the upload fails (callers decide how to degrade).
 */
export async function burnAndUploadCaptions(
  params: BurnCaptionsParams
): Promise<string> {
  const { captionedVideoUrl } = await burnCaptionsWithShotstack(params);

  const uploaded = await uploadVideoFromUrl(captionedVideoUrl, {
    title: "CocoLash Video (captioned)",
    tags: ["cocolash", "brand-content", "captioned", "shotstack"],
  });

  return uploaded.secureUrl;
}
