/**
 * Video Processing Pipeline
 *
 * Orchestrates the post-production flow for HeyGen-generated videos:
 * 1. Download raw video from HeyGen URL
 * 2. Upload to Cloudinary
 * 3. Apply transformations (watermark, captions)
 * 4. Generate thumbnail
 * 5. Return final URLs
 *
 * Uses Cloudinary URL-based transformations (no FFmpeg / Vercel-safe).
 */

import type { ProcessedVideo } from "@/lib/types";
import {
  uploadVideoFromUrl,
  getWatermarkedUrl,
  getThumbnailUrl,
  getCaptionedUrl,
  uploadSRT,
} from "@/lib/cloudinary/video";
import { generateSRTFromScript } from "./captions";

export interface ProcessVideoParams {
  rawVideoUrl: string;
  title?: string;
  scriptText?: string;
  durationSeconds?: number;
  addWatermark: boolean;
  addCaptions: boolean;
  heygenCaptionUrl?: string | null;
}

/**
 * Process a raw HeyGen video through the Cloudinary pipeline.
 *
 * Workflow:
 * - Always uploads to Cloudinary for permanent hosting
 * - Optionally adds text watermark
 * - For captions: prefers HeyGen's built-in captioned URL if available,
 *   otherwise generates SRT from script and applies via Cloudinary
 * - Always generates a thumbnail from the first frame
 */
export async function processVideo(
  params: ProcessVideoParams
): Promise<ProcessedVideo> {
  const {
    rawVideoUrl,
    title,
    scriptText,
    durationSeconds,
    addWatermark,
    addCaptions,
    heygenCaptionUrl,
  } = params;

  // 1. Upload raw video to Cloudinary
  const uploaded = await uploadVideoFromUrl(rawVideoUrl, {
    title,
    tags: ["cocolash", "ugc", "video"],
  });

  const { publicId } = uploaded;
  const duration = durationSeconds ?? uploaded.duration;

  // 2. Generate watermarked URL if requested
  let watermarkedUrl: string | null = null;
  if (addWatermark) {
    watermarkedUrl = getWatermarkedUrl(publicId);
  }

  // 3. Handle captions
  let captionedUrl: string | null = null;
  let srtPublicId: string | null = null;

  if (addCaptions) {
    if (heygenCaptionUrl) {
      // HeyGen already produced a captioned version — use it directly
      // but also upload to Cloudinary for permanent storage
      const captionUpload = await uploadVideoFromUrl(heygenCaptionUrl, {
        title: title ? `${title} (captioned)` : "Captioned video",
        tags: ["cocolash", "ugc", "captioned"],
      });
      captionedUrl = captionUpload.secureUrl;
    } else if (scriptText && duration > 0) {
      // Generate SRT from script and apply via Cloudinary overlay
      const srtContent = generateSRTFromScript(scriptText, duration);
      if (srtContent) {
        srtPublicId = await uploadSRT(srtContent, publicId);
        captionedUrl = getCaptionedUrl(publicId, srtPublicId);
      }
    }
  }

  // 4. Generate thumbnail
  const thumbnailUrl = getThumbnailUrl(publicId, {
    width: 640,
    height: 360,
  });

  // 5. Determine the best final video URL
  // Priority: captioned+watermarked > watermarked > captioned > original
  let videoUrl = uploaded.secureUrl;
  if (watermarkedUrl) {
    videoUrl = watermarkedUrl;
  }

  return {
    cloudinaryPublicId: publicId,
    videoUrl,
    thumbnailUrl,
    watermarkedUrl,
    captionedUrl,
    srtPublicId,
    duration,
    width: uploaded.width,
    height: uploaded.height,
    format: uploaded.format,
  };
}
