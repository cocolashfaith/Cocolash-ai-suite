/**
 * HeyGen API Client
 *
 * Handles all communication with the HeyGen v2 API:
 * - Upload assets (images for photo avatar creation)
 * - Create photo avatar groups from uploaded assets
 * - Generate videos (photo avatar + voice, Avatar IV engine)
 * - Poll video status (pending → processing → completed/failed)
 * - List available voices (cached in DB)
 */

import {
  HeyGenError,
  type HeyGenResponse,
  type HeyGenLegacyResponse,
  type UploadAssetResult,
  type PhotoAvatarGroup,
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

// ── Upload Asset ──────────────────────────────────────────────

/**
 * Upload an image to HeyGen via the Upload Asset API (/v1/asset).
 * Returns asset details including `image_key` for photo avatar creation.
 */
export async function uploadAsset(
  imageUrl: string
): Promise<UploadAssetResult> {
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
    const response = await fetch(`${UPLOAD_BASE}/v1/asset`, {
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
        `Failed to upload asset: ${errorText}`,
        response.status,
        errorText
      );
    }

    const result = (await response.json()) as HeyGenLegacyResponse<UploadAssetResult>;

    if (result.code !== 100 || !result.data?.id) {
      throw new HeyGenError(
        `Asset upload returned unexpected response: ${result.msg ?? result.message ?? "no data"}`,
        500,
        result.msg ?? result.message
      );
    }

    return result.data;
  });
}

// ── Photo Avatar Group ────────────────────────────────────────

/**
 * Create a photo avatar group from an uploaded image.
 * Uses the image_key from uploadAsset().
 */
export async function createPhotoAvatarGroup(
  name: string,
  imageKey: string
): Promise<PhotoAvatarGroup> {
  return withRetry(async () => {
    const result = await heygenFetch<HeyGenResponse<PhotoAvatarGroup>>(
      `${API_BASE}/v2/photo_avatar/avatar_group/create`,
      {
        method: "POST",
        body: JSON.stringify({ name, image_key: imageKey }),
      }
    );

    if (result.error) {
      throw new HeyGenError(
        `Photo avatar group creation failed: ${result.error}`,
        400,
        result.error
      );
    }

    if (!result.data?.id) {
      throw new HeyGenError(
        "Photo avatar group creation returned no group ID",
        500,
        "missing_group_id"
      );
    }

    return result.data;
  });
}

interface AvatarLook {
  id: string;
  image_url: string;
  status: string;
  group_id: string;
}

/**
 * List all avatar looks in a photo avatar group.
 * Endpoint: GET /v2/avatar_group/{group_id}/avatars
 * Each avatar's `id` is the `talking_photo_id` for video generation.
 */
export async function listAvatarsInGroup(
  groupId: string
): Promise<AvatarLook[]> {
  const result = await heygenFetch<HeyGenResponse<{ avatar_list: AvatarLook[] }>>(
    `${API_BASE}/v2/avatar_group/${groupId}/avatars`
  );

  if (result.error) {
    throw new HeyGenError(
      `Failed to list avatars in group: ${result.error}`,
      400,
      result.error
    );
  }

  return result.data?.avatar_list ?? [];
}

/**
 * Poll for avatars in a group until at least one reaches "completed" status.
 * Newly created groups start with status "pending" and HeyGen needs time
 * to process image dimensions before the avatar is usable for video generation.
 */
async function waitForAvatarInGroup(
  groupId: string,
  maxAttempts = 20,
  intervalMs = 5000
): Promise<AvatarLook> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const avatars = await listAvatarsInGroup(groupId);

    const ready = avatars.find((a) => a.status === "completed");
    if (ready) {
      return ready;
    }

    if (avatars.length > 0) {
      console.log(
        `[HeyGen] Avatar ${avatars[0].id} status: ${avatars[0].status} (attempt ${attempt}/${maxAttempts})`
      );
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new HeyGenError(
    `Avatar in group ${groupId} did not reach "completed" status after ${maxAttempts} attempts`,
    500,
    "avatar_not_ready"
  );
}

/**
 * Full pipeline: upload image → create photo avatar group → get talking_photo_id.
 * This replaces the deprecated uploadTalkingPhoto() flow.
 *
 * The avatar `id` returned from the group's avatar list is the
 * `talking_photo_id` used in /v2/video/generate.
 */
export async function createPhotoAvatar(
  imageUrl: string,
  avatarName: string = "CocoLash Avatar"
): Promise<{ talking_photo_id: string; avatar_url: string; group_id: string }> {
  const asset = await uploadAsset(imageUrl);

  if (!asset.image_key) {
    throw new HeyGenError(
      "Uploaded asset has no image_key — cannot create photo avatar",
      500,
      "missing_image_key"
    );
  }

  const group = await createPhotoAvatarGroup(avatarName, asset.image_key);

  const avatar = await waitForAvatarInGroup(group.id);

  return {
    talking_photo_id: avatar.id,
    avatar_url: avatar.image_url ?? asset.url,
    group_id: group.id,
  };
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
