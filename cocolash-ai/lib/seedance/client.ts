/**
 * Seedance 2.0 API Client (via Kie.ai)
 *
 * Handles all communication with the Kie.ai API for Seedance 2.0 video generation:
 * - Create video generation tasks (POST /api/v1/jobs/createTask)
 * - Poll task status (GET /api/v1/jobs/queryTask)
 *
 * Mirrors the HeyGen client pattern: custom error class, retry on 500/503,
 * typed responses.
 */

import {
  SeedanceError,
  type SeedanceInput,
  type SeedanceCreateTaskRequest,
  type SeedanceTaskResponse,
} from "./types";

const API_BASE = "https://api.kie.ai/api/v1/jobs";
const MODEL = "bytedance/seedance-2" as const;

function getApiKey(): string {
  const key = process.env.KIE_AI_API_KEY;
  if (!key) {
    throw new SeedanceError(
      "KIE_AI_API_KEY is not configured",
      500,
      "missing_api_key"
    );
  }
  return key;
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
 * Submit a Seedance 2.0 video generation task to Kie.ai.
 * Returns the taskId for status polling.
 */
export async function createSeedanceTask(
  input: SeedanceInput,
  callBackUrl?: string
): Promise<string> {
  return withRetry(async () => {
    const apiKey = getApiKey();

    const body: SeedanceCreateTaskRequest = {
      model: MODEL,
      input,
      ...(callBackUrl && { callBackUrl }),
    };

    const response = await fetch(`${API_BASE}/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
        `Kie.ai API error (${response.status}): ${errorMessage ?? "Unknown error"}`,
        response.status,
        errorMessage
      );
    }

    const result = (await response.json()) as { taskId?: string } & Record<
      string,
      unknown
    >;

    if (!result.taskId) {
      throw new SeedanceError(
        "Kie.ai createTask returned no taskId",
        500,
        "missing_task_id"
      );
    }

    return result.taskId;
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

    const response = await fetch(
      `${API_BASE}/queryTask?taskId=${encodeURIComponent(taskId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

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
        `Kie.ai query error (${response.status}): ${errorMessage ?? "Unknown error"}`,
        response.status,
        errorMessage
      );
    }

    const result = (await response.json()) as SeedanceTaskResponse;

    if (!result.taskId) {
      throw new SeedanceError(
        "Kie.ai queryTask returned invalid response (no taskId)",
        500,
        "invalid_response"
      );
    }

    return result;
  });
}
