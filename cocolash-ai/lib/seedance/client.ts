/**
 * Seedance 2.0 API Client (via Enhancor.ai Full Access)
 *
 * Handles all communication with the Enhancor.ai API for Seedance 2.0 video generation:
 * - Queue video generation requests (POST /queue)
 * - Poll request status when webhook completion has not arrived yet
 *
 * Mirrors the HeyGen client pattern: custom error class, retry on 500/503,
 * typed responses.
 */

import {
  SeedanceError,
  type SeedanceInput,
  type SeedanceCreateTaskRequest,
  type SeedanceQueueResponse,
  type SeedanceTaskResponse,
} from "./types";

const DEFAULT_API_BASE =
  "https://apireq.enhancor.ai/api/enhancor-ugc-full-access/v1";

function getApiKey(): string {
  const key = process.env.ENHANCOR_API_KEY;
  if (!key) {
    throw new SeedanceError(
      "ENHANCOR_API_KEY is not configured",
      500,
      "missing_api_key"
    );
  }
  return key;
}

function getApiBase(): string {
  return process.env.ENHANCOR_API_BASE_URL ?? DEFAULT_API_BASE;
}

/**
 * Execute an API call with automatic retry on 500/503.
 * Retries once after a 1-second delay.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (
      retries > 0 &&
      error instanceof SeedanceError &&
      (error.statusCode === 500 || error.statusCode === 503)
    ) {
      await new Promise((r) => setTimeout(r, 1000));
      return withRetry(fn, retries - 1);
    }
    throw error;
  }
}

// ── Create Task ──────────────────────────────────────────────

/**
 * Submit a Seedance 2.0 video generation request to Enhancor.
 * Returns the requestId for webhook dedupe and status polling.
 */
export async function createSeedanceTask(
  input: SeedanceInput,
  webhookUrl: string
): Promise<string> {
  return withRetry(async () => {
    const apiKey = getApiKey();
    const apiBase = getApiBase();

    const body = buildEnhancorQueueRequest(input, webhookUrl);

    const response = await fetch(`${apiBase}/queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMessage: string | null = null;
      try {
        const errorBody = await response.json();
        errorMessage =
          typeof errorBody.error === "string"
            ? errorBody.error
            : errorBody.message ?? JSON.stringify(errorBody);
      } catch {
        errorMessage = await response.text().catch(() => null);
      }

      throw new SeedanceError(
        `Enhancor API error (${response.status}): ${errorMessage ?? "Unknown error"}`,
        response.status,
        errorMessage
      );
    }

    const result = (await response.json()) as SeedanceQueueResponse;
    const requestId =
      result.requestId ??
      result.request_id ??
      result.id ??
      result.data?.requestId ??
      result.data?.request_id ??
      result.data?.id;

    if (!requestId) {
      throw new SeedanceError(
        "Enhancor queue returned no requestId",
        500,
        "missing_request_id"
      );
    }

    return requestId;
  });
}

// ── Query Task Status ────────────────────────────────────────

/**
 * Check the current status of a Seedance video generation task.
 * Returns status, video URL (when completed), and error info.
 */
export async function querySeedanceTask(
  taskId: string
): Promise<SeedanceTaskResponse> {
  return withRetry(async () => {
    const apiKey = getApiKey();
    const apiBase = getApiBase();

    const response = await fetchEnhancorStatus(apiBase, apiKey, taskId);

    if (!response.ok) {
      let errorMessage: string | null = null;
      try {
        const errorBody = await response.json();
        errorMessage =
          typeof errorBody.error === "string"
            ? errorBody.error
            : errorBody.message ?? JSON.stringify(errorBody);
      } catch {
        errorMessage = await response.text().catch(() => null);
      }

      throw new SeedanceError(
        `Enhancor status error (${response.status}): ${errorMessage ?? "Unknown error"}`,
        response.status,
        errorMessage
      );
    }

    const result = normalizeStatusResponse(
      (await response.json()) as Record<string, unknown>,
      taskId
    );

    if (!result.taskId) {
      throw new SeedanceError(
        "Enhancor status returned invalid response (no requestId)",
        500,
        "invalid_response"
      );
    }

    return result;
  });
}

function buildEnhancorQueueRequest(
  input: SeedanceInput,
  webhookUrl: string
): SeedanceCreateTaskRequest {
  if (input.type === "text-to-video") {
    return {
      type: "text-to-video",
      prompt: input.prompt,
      duration: input.duration,
      resolution: input.resolution,
      aspect_ratio: input.aspect_ratio,
      webhook_url: webhookUrl,
      full_access: input.full_access,
    };
  }

  if (input.mode === "multi_frame") {
    return {
      type: "image-to-video",
      mode: "multi_frame",
      resolution: input.resolution,
      aspect_ratio: input.aspect_ratio,
      webhook_url: webhookUrl,
      full_access: input.full_access,
      multi_frame_prompts: input.multi_frame_prompts ?? [],
      ...(input.videos && input.videos.length > 0 && { videos: input.videos }),
      ...(input.audios && input.audios.length > 0 && { audios: input.audios }),
    };
  }

  if (input.mode === "first_n_last_frames") {
    return {
      type: "image-to-video",
      mode: "first_n_last_frames",
      prompt: input.prompt,
      duration: input.duration,
      resolution: input.resolution,
      aspect_ratio: input.aspect_ratio,
      webhook_url: webhookUrl,
      full_access: input.full_access,
      first_frame_image: input.first_frame_image ?? input.first_frame_url,
      ...(input.last_frame_image && { last_frame_image: input.last_frame_image }),
      ...(input.videos && input.videos.length > 0 && { videos: input.videos }),
      ...(input.audios && input.audios.length > 0 && { audios: input.audios }),
    };
  }

  if (input.mode === "lipsyncing") {
    return {
      type: "image-to-video",
      mode: "lipsyncing",
      prompt: addReferenceTokens(input.prompt, {
        images: input.images?.length ?? 0,
        videos: input.videos?.length ?? 0,
        audios: input.audios?.length ?? 0,
      }),
      duration: input.duration,
      resolution: input.resolution,
      aspect_ratio: input.aspect_ratio,
      webhook_url: webhookUrl,
      full_access: input.full_access,
      ...(input.images && input.images.length > 0 && { images: input.images }),
      ...(input.videos && input.videos.length > 0 && { videos: input.videos }),
      ...(input.audios && input.audios.length > 0 && { audios: input.audios }),
      ...(input.lipsyncing_audio && { lipsyncing_audio: input.lipsyncing_audio }),
    };
  }

  if (input.mode === "multi_reference") {
    const images =
      input.images ??
      [input.first_frame_url, ...(input.reference_image_urls ?? [])].filter(
        (url): url is string => Boolean(url)
      );

    return {
      type: "image-to-video",
      mode: "multi_reference",
      prompt: addReferenceTokens(input.prompt, {
        images: images.length,
        videos: input.videos?.length ?? input.reference_video_urls?.length ?? 0,
        audios: input.audios?.length ?? input.reference_audio_urls?.length ?? 0,
      }),
      duration: input.duration,
      resolution: input.resolution,
      aspect_ratio: input.aspect_ratio,
      webhook_url: webhookUrl,
      full_access: input.full_access,
      ...(images.length > 0 && { images }),
      ...(input.videos && input.videos.length > 0 && { videos: input.videos }),
      ...(input.audios && input.audios.length > 0 && { audios: input.audios }),
    };
  }

  const productImages = input.products ?? input.reference_image_urls ?? [];
  const influencerImages =
    input.influencers ??
    (input.first_frame_url ? [input.first_frame_url] : []);
  const audioUrls = input.reference_audio_urls ?? [];
  const videoUrls = input.reference_video_urls ?? [];

  if (audioUrls.length > 0 || videoUrls.length > 0) {
    const images = [input.first_frame_url, ...productImages].filter(
      (url): url is string => Boolean(url)
    );

    return {
      type: "image-to-video",
      mode: "multi_reference",
      prompt: addReferenceTokens(input.prompt, {
        images: images.length,
        videos: videoUrls.length,
        audios: audioUrls.length,
      }),
      duration: input.duration,
      resolution: input.resolution,
      aspect_ratio: input.aspect_ratio,
      webhook_url: webhookUrl,
      full_access: input.full_access ?? true,
      ...(images.length > 0 && { images }),
      ...(videoUrls.length > 0 && { videos: videoUrls }),
      ...(audioUrls.length > 0 && { audios: audioUrls }),
    };
  }

  return {
    type: "image-to-video",
    mode: "ugc",
    prompt: input.prompt,
    duration: input.duration,
    resolution: input.resolution,
    aspect_ratio: input.aspect_ratio,
    webhook_url: webhookUrl,
    full_access: input.full_access ?? true,
    ...(productImages.length > 0 && { products: productImages }),
    ...(influencerImages.length > 0 && { influencers: influencerImages }),
  };
}

function addReferenceTokens(
  prompt: string,
  counts: { images: number; videos: number; audios: number }
): string {
  const refs = [
    ...Array.from({ length: counts.images }, (_, index) => `@image${index + 1}`),
    ...Array.from({ length: counts.videos }, (_, index) => `@video${index + 1}`),
    ...Array.from({ length: counts.audios }, (_, index) => `@audio${index + 1}`),
  ];

  if (refs.length === 0) {
    return prompt;
  }

  return `${prompt}\n\nUse these references: ${refs.join(" ")}.`;
}

async function fetchEnhancorStatus(
  apiBase: string,
  apiKey: string,
  requestId: string
): Promise<Response> {
  return fetch(`${apiBase}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ request_id: requestId }),
  });
}

function normalizeStatusResponse(
  payload: Record<string, unknown>,
  fallbackTaskId: string
): SeedanceTaskResponse {
  const requestId =
    getString(payload.request_id) ??
    getString(payload.requestId) ??
    getString(payload.id) ??
    fallbackTaskId;
  const status = normalizeStatus(getString(payload.status));
  const resultUrl =
    getString(payload.result) ??
    getString(payload.video_url) ??
    getNestedString(payload.output, "video_url");
  const thumbnailUrl =
    getString(payload.thumbnail) ??
    getString(payload.thumbnail_url) ??
    getNestedString(payload.output, "thumbnail_url");
  const error = getString(payload.error);

  return {
    taskId: requestId,
    status,
    ...((resultUrl || thumbnailUrl) && {
      output: {
        ...(resultUrl && { video_url: resultUrl }),
        ...(thumbnailUrl && { thumbnail_url: thumbnailUrl }),
      },
    }),
    ...(error && { error }),
  };
}

function normalizeStatus(status?: string): SeedanceTaskResponse["status"] {
  const normalized = status?.toUpperCase();
  if (
    normalized === "PENDING" ||
    normalized === "IN_QUEUE" ||
    normalized === "IN_PROGRESS" ||
    normalized === "PROCESSING" ||
    normalized === "COMPLETED" ||
    normalized === "FAILED"
  ) {
    return normalized;
  }

  return "PROCESSING";
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getNestedString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return getString(record[key]);
}
