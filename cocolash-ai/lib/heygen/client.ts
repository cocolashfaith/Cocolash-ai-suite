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
  type PhotoAvatarResult,
  type VideoGenParams,
  type VideoGenResult,
  type VideoStatusResult,
  type HeyGenVideoStatusValue,
  type V3VideoGenParams,
  type HeyGenEngine,
  type HeyGenVoice,
  type VoiceListResult,
} from "./types";

const API_BASE = "https://api.heygen.com";
const UPLOAD_BASE = "https://upload.heygen.com";

/**
 * Which HeyGen API generation to use. v3 is the current generation (Avatar IV/V,
 * resolution tiers, expressiveness, motion). Set HEYGEN_API_VERSION=v2 to fall
 * back to the legacy talking-photo flow. Defaults to v3.
 */
export const HEYGEN_API_VERSION: "v2" | "v3" =
  process.env.HEYGEN_API_VERSION === "v2" ? "v2" : "v3";

/**
 * Engine-selection policy for the v3 `POST /v3/videos` path.
 * - `auto` (default) — use Avatar V when the avatar look advertises it via
 *   `supported_api_engines`, otherwise Avatar IV.
 * - `avatar_v` — always request Avatar V (still falls back to IV on a 400).
 * - `avatar_iv` — force today's Avatar IV behavior (instant rollback switch,
 *   no code change needed).
 * Override with HEYGEN_AVATAR_ENGINE.
 */
export const HEYGEN_AVATAR_ENGINE: "auto" | "avatar_v" | "avatar_iv" =
  process.env.HEYGEN_AVATAR_ENGINE === "avatar_v"
    ? "avatar_v"
    : process.env.HEYGEN_AVATAR_ENGINE === "avatar_iv"
      ? "avatar_iv"
      : "auto";

/**
 * Whether a look's `supported_api_engines` advertises Avatar V. Tolerant to
 * HeyGen's inconsistent engine tokens — matches any value containing "avatar_v"
 * (never matches "avatar_iv", which has no "avatar_v" substring).
 */
export function supportsAvatarV(supportedEngines: readonly string[]): boolean {
  return supportedEngines.some((e) => e.toLowerCase().includes("avatar_v"));
}

/**
 * Resolve the engine for a render from the policy + the avatar's eligibility.
 * In `auto` we only pick Avatar V when the look supports it; the forced modes
 * still rely on `generateVideoV3`'s 400 fallback as a safety net.
 */
export function resolveAvatarEngine(
  supportedEngines: readonly string[]
): HeyGenEngine {
  if (HEYGEN_AVATAR_ENGINE === "avatar_iv") return "avatar_iv";
  if (HEYGEN_AVATAR_ENGINE === "avatar_v") return "avatar_v";
  return supportsAvatarV(supportedEngines) ? "avatar_v" : "avatar_iv";
}

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

/**
 * Transient network errors that warrant a retry. These are caused by
 * flaky local connectivity, DNS hiccups, or the remote server closing
 * the TCP connection mid-request. Not real API failures.
 */
function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message || "";
  const cause = (err as { cause?: { code?: string } }).cause;
  const code = cause?.code ?? "";
  return (
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    /fetch failed|terminated|socket hang up/i.test(msg)
  );
}

/**
 * A 400 that means "this avatar look can't use Avatar V" — so we should retry on
 * Avatar IV instead of surfacing an error. Matched heuristically on the engine /
 * eligibility wording since HeyGen doesn't expose a dedicated error code for it.
 * Unrelated 400s (bad script, etc.) are NOT swallowed.
 */
function isAvatarVIneligibleError(err: unknown): boolean {
  if (!(err instanceof HeyGenError) || err.statusCode !== 400) return false;
  const text = `${err.apiError ?? ""} ${err.message}`.toLowerCase();
  return (
    text.includes("avatar_v") ||
    text.includes("engine") ||
    text.includes("eligib") ||
    text.includes("not support") ||
    text.includes("unsupported")
  );
}

async function heygenFetch<T>(
  url: string,
  options: RequestInit = {},
  networkRetries = 3
): Promise<T> {
  const apiKey = getApiKey();

  let lastError: unknown;
  for (let attempt = 1; attempt <= networkRetries + 1; attempt++) {
    try {
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
    } catch (err) {
      lastError = err;
      if (attempt <= networkRetries && isTransientNetworkError(err)) {
        const delay = 1000 * attempt;
        console.warn(
          `[HeyGen] Transient network error (attempt ${attempt}/${networkRetries + 1}), retrying in ${delay}ms…`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Execute a HeyGen API call with automatic retry on 500/503 AND on
 * transient network errors (ECONNRESET/terminated/etc.) from any raw
 * fetch inside the function. This makes uploadAsset/uploadAudioAsset
 * resilient to flaky local connectivity.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 1;
  let lastError: unknown;
  while (attempt <= retries + 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retriable =
        (error instanceof HeyGenError &&
          (error.statusCode === 500 ||
            error.statusCode === 502 ||
            error.statusCode === 503 ||
            error.statusCode === 504)) ||
        isTransientNetworkError(error);

      if (retriable && attempt <= retries) {
        const delay = 1000 * attempt;
        console.warn(
          `[HeyGen] withRetry attempt ${attempt}/${retries + 1} failed (${
            error instanceof Error ? error.message : error
          }), retrying in ${delay}ms…`
        );
        await new Promise((r) => setTimeout(r, delay));
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
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

/**
 * Upload an audio buffer (e.g. from ElevenLabs TTS) to HeyGen.
 * Returns an asset_id to use with voice.type='audio'.
 */
export async function uploadAudioAsset(
  audioBuffer: Buffer,
  contentType = "audio/mpeg"
): Promise<string> {
  return withRetry(async () => {
    const apiKey = getApiKey();
    const bodyBytes = new Uint8Array(audioBuffer);
    const response = await fetch(`${UPLOAD_BASE}/v1/asset`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": contentType,
      },
      body: bodyBytes,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new HeyGenError(
        `Failed to upload audio asset: ${errorText}`,
        response.status,
        errorText
      );
    }

    const result = (await response.json()) as HeyGenLegacyResponse<UploadAssetResult>;

    if (result.code !== 100 || !result.data?.id) {
      throw new HeyGenError(
        `Audio asset upload returned unexpected response: ${result.msg ?? result.message ?? "no data"}`,
        500,
        result.msg ?? result.message
      );
    }

    return result.data.id;
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
): Promise<PhotoAvatarResult> {
  if (HEYGEN_API_VERSION === "v3") {
    return createPhotoAvatarV3(imageUrl, avatarName);
  }
  return createPhotoAvatarV2(imageUrl, avatarName);
}

/**
 * v3 photo-avatar creation: a single `POST /v3/avatars` call turns the image
 * into a photo avatar and returns the look id (used as `avatar_id` for
 * `POST /v3/videos`). Replaces the v2 three-step asset→group→poll flow.
 *
 * Return shape matches createPhotoAvatarV2 so callers are version-agnostic
 * (`talking_photo_id` carries the v3 `avatar_id`).
 */
export async function createPhotoAvatarV3(
  imageUrl: string,
  avatarName: string = "CocoLash Avatar"
): Promise<PhotoAvatarResult> {
  return withRetry(async () => {
    const result = await heygenFetch<{
      data?: {
        avatar_item?: {
          id?: string;
          group_id?: string;
          preview_image_url?: string;
          supported_api_engines?: string[];
        };
      };
    }>(`${API_BASE}/v3/avatars`, {
      method: "POST",
      body: JSON.stringify({
        type: "photo",
        name: avatarName,
        file: { type: "url", url: imageUrl },
      }),
    });

    const item = result.data?.avatar_item;
    if (!item?.id) {
      throw new HeyGenError(
        "v3 photo avatar creation returned no avatar id",
        500,
        "missing_avatar_id"
      );
    }

    return {
      talking_photo_id: item.id,
      avatar_url: item.preview_image_url ?? imageUrl,
      group_id: item.group_id ?? "",
      // Drives Avatar V eligibility downstream. Empty/absent → Avatar IV under `auto`.
      supportedEngines: item.supported_api_engines ?? [],
    };
  });
}

async function createPhotoAvatarV2(
  imageUrl: string,
  avatarName: string = "CocoLash Avatar"
): Promise<PhotoAvatarResult> {
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
    // v2 has no engine metadata; Avatar V is v3-only.
    supportedEngines: [],
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

/**
 * v3 video generation from a photo avatar (`POST /v3/videos`). Adds the modern
 * quality controls: resolution tier (1080p/4K), expressiveness, and motion.
 *
 * Captions are deliberately NOT requested here — our Shotstack pipeline burns
 * them downstream. When `audioAssetId` is provided (our ElevenLabs TTS), the
 * spoken audio stays perfectly aligned with our caption SRT.
 */
export async function generateVideoV3(
  params: V3VideoGenParams
): Promise<VideoGenResult> {
  /** Build the request body for a specific engine. */
  const buildBody = (engine: HeyGenEngine): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      type: "avatar",
      avatar_id: params.avatarId,
      resolution: params.resolution,
      aspect_ratio: params.aspectRatio,
    };

    if (params.audioAssetId) {
      body.audio_asset_id = params.audioAssetId;
    } else if (params.voiceId && params.script) {
      body.voice_id = params.voiceId;
      body.script = params.script;
    }

    if (engine === "avatar_v") {
      // Avatar V: HeyGen's cross-reference engine. expressiveness is REJECTED
      // here, so we deliberately do NOT send it.
      body.engine = { type: "avatar_v" };
    } else if (params.expressiveness) {
      // Avatar IV only.
      body.expressiveness = params.expressiveness;
    }

    // motion_prompt is supported on BOTH engines for photo avatars.
    if (params.motionPrompt) body.motion_prompt = params.motionPrompt;
    if (params.title) body.title = params.title;

    return body;
  };

  /** Submit one engine attempt (with the network/5xx retry wrapper). */
  const submit = (engine: HeyGenEngine): Promise<VideoGenResult> =>
    withRetry(async () => {
      const headers: Record<string, string> = {};
      if (params.idempotencyKey) {
        // Namespace per engine so a failed Avatar V attempt is never replayed
        // onto the Avatar IV fallback (and vice-versa).
        headers["Idempotency-Key"] = `${params.idempotencyKey}-${engine}`;
      }

      const result = await heygenFetch<{ data?: VideoGenResult }>(
        `${API_BASE}/v3/videos`,
        { method: "POST", body: JSON.stringify(buildBody(engine)), headers }
      );

      if (!result.data?.video_id) {
        throw new HeyGenError(
          "v3 video generation returned no video_id",
          500,
          "missing_video_id"
        );
      }

      return result.data;
    });

  // Avatar IV (default) — single attempt.
  if (params.engine !== "avatar_v") {
    return submit("avatar_iv");
  }

  // Avatar V requested — fall back to Avatar IV if the look turns out ineligible.
  try {
    return await submit("avatar_v");
  } catch (err) {
    if (isAvatarVIneligibleError(err)) {
      console.warn(
        "[HeyGen] Avatar V rejected for this look — falling back to Avatar IV."
      );
      return submit("avatar_iv");
    }
    throw err;
  }
}

// ── Video Status Polling ──────────────────────────────────────

function mapV3Status(status: string): HeyGenVideoStatusValue {
  if (
    status === "pending" ||
    status === "processing" ||
    status === "completed" ||
    status === "failed"
  ) {
    return status;
  }
  if (status === "waiting") return "waiting";
  return "processing";
}

/**
 * Check the current status of a video generation request. Delegates to the v3
 * status endpoint when on v3, returning the SAME VideoStatusResult shape so the
 * status route + post-processing (Cloudinary + Shotstack caption burn) are
 * unchanged.
 *
 * URLs expire after a few days — re-call to get fresh URLs.
 */
export async function getVideoStatus(
  videoId: string
): Promise<VideoStatusResult> {
  if (HEYGEN_API_VERSION === "v3") {
    return getVideoStatusV3(videoId);
  }
  return getVideoStatusV2(videoId);
}

/** v3: GET /v3/videos/{id} → mapped to VideoStatusResult. */
export async function getVideoStatusV3(
  videoId: string
): Promise<VideoStatusResult> {
  const result = await heygenFetch<{
    data?: {
      id?: string;
      video_id?: string;
      status?: string;
      video_url?: string;
      thumbnail_url?: string;
      duration?: number;
      failure_message?: string;
      error?: string;
    };
  }>(`${API_BASE}/v3/videos/${encodeURIComponent(videoId)}`);

  const d = result.data ?? {};
  return {
    video_id: d.video_id ?? d.id ?? videoId,
    status: mapV3Status(d.status ?? "processing"),
    video_url: d.video_url,
    thumbnail_url: d.thumbnail_url,
    duration: d.duration,
    error: d.failure_message ?? d.error,
  };
}

async function getVideoStatusV2(
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
