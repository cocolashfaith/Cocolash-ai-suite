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
 * Supports three caption methods:
 * - "ffmpeg-burn": Styled captions via FFmpeg WASM (white pill bg, educational look)
 * - "cloudinary-srt": Cloudinary URL-based SRT overlay (plain text, no background)
 * - "heygen": HeyGen's built-in captioned video URL
 *
 * Fallback chain: FFmpeg burn → Cloudinary SRT → HeyGen built-in → no captions
 */

import type { ProcessedVideo, CaptionMethod, VideoCaptionStyle } from "@/lib/types";
import { DEFAULT_CAPTION_STYLE } from "@/lib/types";
import {
  uploadVideoFromUrl,
  uploadVideoFromBuffer,
  getWatermarkedUrl,
  getThumbnailUrl,
  getCaptionedUrl,
  uploadSRT,
} from "@/lib/cloudinary/video";
import { generateSRTFromScript } from "./captions";
import { burnCaptions, isFFmpegAvailable } from "./ffmpeg-captions";

export interface ProcessVideoParams {
  rawVideoUrl: string;
  title?: string;
  scriptText?: string;
  durationSeconds?: number;
  addWatermark: boolean;
  addCaptions: boolean;
  heygenCaptionUrl?: string | null;
  captionMethod?: CaptionMethod;
  captionStyle?: VideoCaptionStyle;
}

/**
 * Process a raw HeyGen video through the post-production pipeline.
 *
 * Workflow:
 * - Always uploads to Cloudinary for permanent hosting
 * - Optionally adds text watermark
 * - For captions: uses the specified method with automatic fallback:
 *   ffmpeg-burn → cloudinary-srt → heygen → none
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
    captionMethod = "ffmpeg-burn",
    captionStyle = DEFAULT_CAPTION_STYLE,
  } = params;

  // 1. Upload raw video to Cloudinary
  const uploaded = await uploadVideoFromUrl(rawVideoUrl, {
    title,
    tags: ["cocolash", "brand-content", "video"],
  });

  const { publicId } = uploaded;
  const duration = durationSeconds ?? uploaded.duration;

  // 2. Generate watermarked URL if requested
  let watermarkedUrl: string | null = null;
  if (addWatermark) {
    watermarkedUrl = getWatermarkedUrl(publicId);
  }

  // 3. Handle captions with fallback chain
  let captionedUrl: string | null = null;
  let srtPublicId: string | null = null;
  let resolvedMethod: CaptionMethod = "none";

  if (addCaptions) {
    const result = await applyCaptions({
      method: captionMethod,
      rawVideoUrl,
      publicId,
      scriptText,
      duration,
      heygenCaptionUrl,
      captionStyle,
      title,
    });

    captionedUrl = result.captionedUrl;
    srtPublicId = result.srtPublicId;
    resolvedMethod = result.method;
  }

  // 4. Generate thumbnail
  const thumbnailUrl = getThumbnailUrl(publicId, {
    width: 640,
    height: 360,
  });

  // 5. Determine the best final video URL
  // Priority: captioned (ffmpeg) > watermarked > captioned (cloudinary) > original
  let videoUrl = uploaded.secureUrl;
  if (resolvedMethod === "ffmpeg-burn" && captionedUrl) {
    videoUrl = captionedUrl;
  } else if (watermarkedUrl) {
    videoUrl = watermarkedUrl;
  } else if (captionedUrl) {
    videoUrl = captionedUrl;
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
    captionMethod: resolvedMethod,
  };
}

// ── Internal: Caption Fallback Chain ────────────────────────

interface ApplyCaptionsParams {
  method: CaptionMethod;
  rawVideoUrl: string;
  publicId: string;
  scriptText?: string;
  duration: number;
  heygenCaptionUrl?: string | null;
  captionStyle: VideoCaptionStyle;
  title?: string;
}

interface CaptionResult {
  captionedUrl: string | null;
  srtPublicId: string | null;
  method: CaptionMethod;
}

async function applyCaptions(params: ApplyCaptionsParams): Promise<CaptionResult> {
  const {
    method,
    rawVideoUrl,
    publicId,
    scriptText,
    duration,
    heygenCaptionUrl,
    captionStyle,
    title,
  } = params;

  const methods: CaptionMethod[] = buildFallbackChain(method, heygenCaptionUrl);

  for (const m of methods) {
    try {
      const result = await tryCaptionMethod(m, {
        rawVideoUrl,
        publicId,
        scriptText,
        duration,
        heygenCaptionUrl,
        captionStyle,
        title,
      });
      if (result) return result;
    } catch (err) {
      console.warn(`[processor] Caption method "${m}" failed, trying next:`, err);
    }
  }

  return { captionedUrl: null, srtPublicId: null, method: "none" };
}

function buildFallbackChain(
  preferred: CaptionMethod,
  heygenCaptionUrl?: string | null
): CaptionMethod[] {
  const chain: CaptionMethod[] = [];

  if (preferred === "ffmpeg-burn") {
    chain.push("ffmpeg-burn", "cloudinary-srt");
    if (heygenCaptionUrl) chain.push("heygen");
  } else if (preferred === "cloudinary-srt") {
    chain.push("cloudinary-srt");
    if (heygenCaptionUrl) chain.push("heygen");
  } else if (preferred === "heygen") {
    if (heygenCaptionUrl) chain.push("heygen");
    chain.push("cloudinary-srt");
  }

  return chain;
}

async function tryCaptionMethod(
  method: CaptionMethod,
  params: Omit<ApplyCaptionsParams, "method">
): Promise<CaptionResult | null> {
  const { rawVideoUrl, publicId, scriptText, duration, heygenCaptionUrl, captionStyle, title } = params;

  switch (method) {
    case "ffmpeg-burn": {
      if (!scriptText || duration <= 0) return null;

      const available = await isFFmpegAvailable();
      if (!available) {
        console.warn("[processor] FFmpeg WASM not available, skipping");
        return null;
      }

      const srtContent = generateSRTFromScript(scriptText, duration);
      if (!srtContent) return null;

      console.log("[processor] Burning captions via FFmpeg WASM...");
      const captionedBuffer = await burnCaptions(rawVideoUrl, srtContent, captionStyle);

      const uploaded = await uploadVideoFromBuffer(captionedBuffer, {
        title: title ? `${title} (captioned)` : "Captioned video",
        tags: ["cocolash", "brand-content", "captioned", "ffmpeg"],
      });

      console.log(
        `[processor] FFmpeg caption burn complete — ${(captionedBuffer.length / 1024 / 1024).toFixed(1)}MB`
      );

      return {
        captionedUrl: uploaded.secureUrl,
        srtPublicId: null,
        method: "ffmpeg-burn",
      };
    }

    case "cloudinary-srt": {
      if (!scriptText || duration <= 0) return null;

      const srtContent = generateSRTFromScript(scriptText, duration);
      if (!srtContent) return null;

      const srtPubId = await uploadSRT(srtContent, publicId);
      const url = getCaptionedUrl(publicId, srtPubId);

      return {
        captionedUrl: url,
        srtPublicId: srtPubId,
        method: "cloudinary-srt",
      };
    }

    case "heygen": {
      if (!heygenCaptionUrl) return null;

      const captionUpload = await uploadVideoFromUrl(heygenCaptionUrl, {
        title: title ? `${title} (captioned)` : "Captioned video",
        tags: ["cocolash", "brand-content", "captioned"],
      });

      return {
        captionedUrl: captionUpload.secureUrl,
        srtPublicId: null,
        method: "heygen",
      };
    }

    default:
      return null;
  }
}
