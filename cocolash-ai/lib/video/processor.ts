/**
 * Video Processing Pipeline
 *
 * Orchestrates the post-production flow for HeyGen-generated videos:
 * 1. Download raw video from HeyGen URL
 * 2. Upload to Cloudinary
 * 3. Apply transformations (watermark)
 * 4. Generate thumbnail
 * 5. Return final URLs
 *
 * Captions are handled separately by Shotstack (server-side render
 * with styled pill-background captions burned in).
 */

import type { ProcessedVideo, CaptionMethod } from "@/lib/types";
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
  captionMethod?: CaptionMethod;
}

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
    captionMethod = "cloudinary-srt",
  } = params;

  const uploaded = await uploadVideoFromUrl(rawVideoUrl, {
    title,
    tags: ["cocolash", "brand-content", "video"],
  });

  const { publicId } = uploaded;
  const duration = durationSeconds ?? uploaded.duration;

  let watermarkedUrl: string | null = null;
  if (addWatermark) {
    watermarkedUrl = getWatermarkedUrl(publicId);
  }

  let captionedUrl: string | null = null;
  let srtPublicId: string | null = null;
  let resolvedMethod: CaptionMethod = "none";

  if (addCaptions) {
    const result = await applyCaptions({
      method: captionMethod,
      publicId,
      scriptText,
      duration,
      heygenCaptionUrl,
      title,
    });

    captionedUrl = result.captionedUrl;
    srtPublicId = result.srtPublicId;
    resolvedMethod = result.method;
  }

  const thumbnailUrl = getThumbnailUrl(publicId, {
    width: 640,
    height: 360,
  });

  let videoUrl = uploaded.secureUrl;
  if (captionedUrl) {
    videoUrl = captionedUrl;
  } else if (watermarkedUrl) {
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
    captionMethod: resolvedMethod,
  };
}

// ── Internal: Caption Fallback Chain ────────────────────────

interface ApplyCaptionsParams {
  method: CaptionMethod;
  publicId: string;
  scriptText?: string;
  duration: number;
  heygenCaptionUrl?: string | null;
  title?: string;
}

interface CaptionResult {
  captionedUrl: string | null;
  srtPublicId: string | null;
  method: CaptionMethod;
}

async function applyCaptions(params: ApplyCaptionsParams): Promise<CaptionResult> {
  const { method, publicId, scriptText, duration, heygenCaptionUrl, title } = params;

  const methods: CaptionMethod[] = buildFallbackChain(method, heygenCaptionUrl);

  for (const m of methods) {
    try {
      const result = await tryCaptionMethod(m, { publicId, scriptText, duration, heygenCaptionUrl, title });
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

  if (preferred === "cloudinary-srt") {
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
  const { publicId, scriptText, duration, heygenCaptionUrl, title } = params;

  switch (method) {
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
