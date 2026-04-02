/**
 * HeyGen API Client
 *
 * Handles all communication with the HeyGen v2 API:
 * - Upload talking photos (for avatar creation from composed images)
 * - Generate videos (talking photo + voice + background)
 * - Poll video status (pending → processing → completed/failed)
 * - List available voices (cached in DB)
 */

import {
  HeyGenError,
  type HeyGenResponse,
  type HeyGenLegacyResponse,
  type TalkingPhoto,
  type VideoGenParams,
  type VideoGenResult,
  type VideoStatusResult,
  type HeyGenVoice,
  type VoiceListResult,
} from "./types";

const API_BASE = "https://api.heygen.com";
const UPLOAD_BASE = "https://upload.heygen.com";

function getApiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) {
    throw new HeyGenError(
      "HEYGEN_API_KEY is not configured",
      500,
      "missing_api_key"
    );
  }
  return key;
}

async function heygenFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = getApiKey();

  const response = await fetch(url, {
    ...options,
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage: string | null = null;
    try {
      const errorBody = await response.json();
      errorMessage =
        typeof errorBody.error === "string"
          ? errorBody.error
          : errorBody.error?.message ?? JSON.stringify(errorBody);
    } catch {
      errorMessage = await response.text().catch(() => null);
    }

    throw new HeyGenError(
      `HeyGen API error (${response.status}): ${errorMessage ?? "Unknown error"}`,
      response.status,
      errorMessage
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Execute a HeyGen API call with automatic retry on 500/503.
 * Retries once after a 1-second delay.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (
      retries > 0 &&
      error instanceof HeyGenError &&
      (error.statusCode === 500 || error.statusCode === 503)
    ) {
      await new Promise((r) => setTimeout(r, 1000));
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
}

// ── Talking Photo Upload ──────────────────────────────────────

/**
 * Upload an image as a talking photo to HeyGen.
 * Downloads the image from the given URL, then uploads the binary
 * to HeyGen's upload endpoint.
 *
 * Returns the talking_photo_id needed for video generation.
 */
export async function uploadTalkingPhoto(
  imageUrl: string
): Promise<TalkingPhoto> {
  return withRetry(async () => {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new HeyGenError(
        `Failed to download image from URL: ${imageResponse.status}`,
        400,
        "image_download_failed"
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

    const apiKey = getApiKey();
    const response = await fetch(`${UPLOAD_BASE}/v1/talking_photo`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": contentType,
      },
      body: imageBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new HeyGenError(
        `Failed to upload talking photo: ${errorText}`,
        response.status,
        errorText
      );
    }

    const result = (await response.json()) as HeyGenLegacyResponse<TalkingPhoto>;

    if (result.code !== 100 || !result.data?.talking_photo_id) {
      throw new HeyGenError(
        `Talking photo upload returned unexpected response: ${result.msg ?? "no data"}`,
        500,
        result.msg
      );
    }

    return result.data;
  });
}

// ── Video Generation ──────────────────────────────────────────

/**
 * Submit a video generation request to HeyGen.
 * Returns the video_id for status polling.
 *
 * The video is generated asynchronously — use getVideoStatus()
 * to poll for completion.
 */
export async function generateVideo(
  params: VideoGenParams
): Promise<VideoGenResult> {
  return withRetry(async () => {
    const result = await heygenFetch<HeyGenResponse<VideoGenResult>>(
      `${API_BASE}/v2/video/generate`,
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );

    if (result.error) {
      throw new HeyGenError(
        `Video generation failed: ${result.error}`,
        400,
        result.error
      );
    }

    if (!result.data?.video_id) {
      throw new HeyGenError(
        "Video generation returned no video_id",
        500,
        "missing_video_id"
      );
    }

    return result.data;
  });
}

// ── Video Status Polling ──────────────────────────────────────

/**
 * Check the current status of a video generation request.
 * Returns status, video URL (when completed), thumbnail, duration, etc.
 *
 * Note: Uses v1 endpoint as per HeyGen documentation.
 * URLs expire after 7 days — re-call to get fresh URLs.
 */
export async function getVideoStatus(
  videoId: string
): Promise<VideoStatusResult> {
  const result = await heygenFetch<HeyGenResponse<VideoStatusResult>>(
    `${API_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`
  );

  if (result.error) {
    throw new HeyGenError(
      `Video status check failed: ${result.error}`,
      400,
      result.error
    );
  }

  return result.data;
}

// ── Voice Listing ─────────────────────────────────────────────

/**
 * Fetch all available voices from HeyGen.
 * Returns voice_id, name, gender, language, preview audio URL, etc.
 */
export async function listVoices(): Promise<HeyGenVoice[]> {
  const result = await heygenFetch<HeyGenResponse<VoiceListResult>>(
    `${API_BASE}/v2/voices`
  );

  if (result.error) {
    throw new HeyGenError(
      `Voice listing failed: ${result.error}`,
      400,
      result.error
    );
  }

  return result.data?.voices ?? [];
}
