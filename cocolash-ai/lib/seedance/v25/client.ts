/**
 * Seedance 2.5 (Enhancor) API client.
 *
 *   POST {SEEDANCE_25_API_BASE}/queue    → { success, requestId }
 *   POST {SEEDANCE_25_API_BASE}/status   → { success, requestId, status, result?, thumbnail?, cost? }
 *   header: x-api-key: ENHANCOR_API_KEY   (the SAME key as 2.0)
 *
 * Two hard rules (02-DECISIONS.md):
 *   1. The queue endpoint is POSTed EXACTLY ONCE and is NEVER retried — a retry
 *      bills a second job. There is deliberately no `withRetry` here (that
 *      helper lives in the 2.0 client and stays there). The status endpoint IS
 *      idempotent, so it retries once on 500/503.
 *   2. `webhook_url` carries ENHANCOR_WEBHOOK_SECRET → it is REDACTED in logs
 *      and never persisted.
 *
 * The wire body is built from the NORMALIZED request only (output of
 * Seedance25RequestSchema) and then filtered through the 2.5 allow-list, so a
 * field Enhancor does not accept for a mode can never reach the API.
 */

import { SEEDANCE_25_API_BASE } from "../engines";
import { pickAllowed } from "../mode-allowlist";
import { SeedanceError } from "../types";
import { redactWebhookSecret } from "../webhook-url";
import { parseSeedance25Callback } from "./schema";
import type {
  Seedance25QueuePayload,
  Seedance25QueueResponse,
  Seedance25Request,
  Seedance25TaskResult,
} from "./types";

/** Enhancor's /queue call is fast (it only enqueues), but never hang a route on it. */
const QUEUE_TIMEOUT_MS = 60_000;
const STATUS_TIMEOUT_MS = 30_000;

function getApiKey(): string {
  const key = process.env.ENHANCOR_API_KEY;
  if (!key) {
    throw new SeedanceError("ENHANCOR_API_KEY is not configured", 500, "missing_api_key");
  }
  return key;
}

/**
 * `{ ...request, duration: String(duration), webhook_url }` filtered through the
 * 2.5 allow-list — which drops `videos`/`audios` from ugc, and the top-level
 * `prompt`/`duration` from multi_frame (segments carry their own).
 */
export function buildSeedance25QueuePayload(
  request: Seedance25Request,
  webhookUrl: string
): Seedance25QueuePayload {
  const draft: Record<string, unknown> = {
    ...request,
    duration: String(request.duration),
    webhook_url: webhookUrl,
  };
  return pickAllowed(draft, request.mode, "2.5") as unknown as Seedance25QueuePayload;
}

/**
 * One-line summary of the /queue body. The full payload (prompt text + every
 * signed input URL) is NOT logged on the happy path — it is large, it is
 * per-request PII-adjacent, and the interesting failure detail already comes
 * back in the error branch. Set SEEDANCE_DEBUG_PAYLOAD=1 to dump the whole
 * body (still without the secret-bearing webhook_url) while debugging.
 */
function payloadSummary(payload: Seedance25QueuePayload): string {
  const rest: Record<string, unknown> = { ...payload };
  delete rest.webhook_url;
  const prompt = typeof rest.prompt === "string" ? rest.prompt : "";

  if (process.env.SEEDANCE_DEBUG_PAYLOAD === "1") {
    return JSON.stringify({ ...rest, webhook_url: "[redacted]" });
  }

  const counted = (key: string) =>
    Array.isArray(rest[key]) ? `${key}=${(rest[key] as unknown[]).length}` : null;
  const parts = [
    `mode=${String(rest.mode ?? "?")}`,
    `resolution=${String(rest.resolution ?? "?")}`,
    `duration=${String(rest.duration ?? "?")}`,
    `prompt_chars=${prompt.length}`,
    ...["products", "influencers", "images", "videos", "audios", "multi_frame_prompts"]
      .map(counted)
      .filter((part): part is string => part !== null),
  ];
  return parts.join(" ");
}

/**
 * The provider error text, with ENHANCOR_WEBHOOK_SECRET scrubbed. Enhancor
 * echoes the offending request (including `webhook_url?token=<secret>`) in some
 * 4xx bodies, and this string is logged, stored in `error_message` and shown to
 * the user — so the scrub happens at the single point where it is read.
 */
async function readErrorMessage(response: Response): Promise<string | null> {
  const raw = await (async () => {
    try {
      const body = (await response.json()) as { error?: unknown; message?: unknown };
      if (typeof body.error === "string") return body.error;
      if (typeof body.message === "string") return body.message;
      return JSON.stringify(body);
    } catch {
      return await response.text().catch(() => null);
    }
  })();
  return raw === null ? null : redactWebhookSecret(raw);
}

/**
 * Combine an optional caller signal with our own timeout. Returns the signal to
 * pass to fetch plus a cleanup function.
 */
function withTimeout(
  timeoutMs: number,
  external?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  external?.addEventListener("abort", onAbort);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Queue a Seedance 2.5 job. **Exactly one POST — never retried.**
 * Returns the provider request id plus the exact payload that was sent (minus
 * nothing: callers persist `request`, not this payload, so the webhook token
 * never lands in the database).
 */
export async function createSeedance25Task(
  request: Seedance25Request,
  webhookUrl: string,
  opts?: { signal?: AbortSignal }
): Promise<{ requestId: string; payload: Seedance25QueuePayload }> {
  const apiKey = getApiKey();
  const payload = buildSeedance25QueuePayload(request, webhookUrl);

  console.log("[seedance2.5] /queue", payloadSummary(payload));

  const { signal, cleanup } = withTimeout(QUEUE_TIMEOUT_MS, opts?.signal);
  let response: Response;
  try {
    response = await fetch(`${SEEDANCE_25_API_BASE}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    // Network failure / timeout. We do NOT retry: the job may already be queued.
    const message = redactWebhookSecret(
      error instanceof Error ? error.message : String(error)
    );
    throw new SeedanceError(`Enhancor 2.5 API error (0): ${message}`, 0, message);
  } finally {
    cleanup();
  }

  if (!response.ok) {
    const errorMessage = await readErrorMessage(response);
    throw new SeedanceError(
      `Enhancor 2.5 API error (${response.status}): ${errorMessage ?? "Unknown error"}`,
      response.status,
      errorMessage
    );
  }

  const result = (await response.json().catch(() => ({}))) as Seedance25QueueResponse;
  const requestId =
    result?.requestId ??
    result?.request_id ??
    result?.id ??
    result?.data?.requestId ??
    result?.data?.request_id ??
    result?.data?.id;

  if (!requestId) {
    throw new SeedanceError(
      "Enhancor 2.5 queue returned no requestId",
      500,
      "missing_request_id"
    );
  }

  return { requestId, payload };
}

/**
 * Poll a 2.5 job. Idempotent → one retry after 1 s on 500/503 is safe (unlike
 * /queue). Returns the same normalized shape the webhook produces.
 */
export async function querySeedance25Task(requestId: string): Promise<Seedance25TaskResult> {
  const apiKey = getApiKey();

  const attempt = async (): Promise<Seedance25TaskResult> => {
    const { signal, cleanup } = withTimeout(STATUS_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${SEEDANCE_25_API_BASE}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ request_id: requestId }),
        signal,
      });
    } finally {
      cleanup();
    }

    if (!response.ok) {
      const errorMessage = await readErrorMessage(response);
      throw new SeedanceError(
        `Enhancor 2.5 status error (${response.status}): ${errorMessage ?? "Unknown error"}`,
        response.status,
        errorMessage
      );
    }

    const json = await response.json().catch(() => null);
    const parsed = parseSeedance25Callback(json, requestId);
    if (!parsed) {
      throw new SeedanceError(
        "Enhancor 2.5 status returned an unreadable response",
        500,
        "invalid_response"
      );
    }
    return parsed;
  };

  try {
    return await attempt();
  } catch (error) {
    if (
      error instanceof SeedanceError &&
      (error.statusCode === 500 || error.statusCode === 503) &&
      error.apiError !== "invalid_response"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return attempt();
    }
    throw error;
  }
}
