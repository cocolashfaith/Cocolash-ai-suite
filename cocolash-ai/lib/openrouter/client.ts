import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenRouterClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "CocoLash AI Studio",
      },
    });
  }
  return _client;
}

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

export async function openrouterRequest<T>(
  fn: () => Promise<T>,
  retries = 5,
  attempt = 1
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const status =
      error instanceof OpenAI.APIError ? error.status : undefined;

    const shouldRetry =
      retries > 0 &&
      (status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        isTransientNetworkError(error));

    if (shouldRetry) {
      // Exponential backoff, capped at 10s, with small jitter.
      const base = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
      const jitter = Math.floor(Math.random() * 500);
      const delay = status === 429 ? 2500 : base + jitter;
      console.warn(
        `[openrouter] Request failed (attempt ${attempt}/${attempt + retries}), retrying in ${delay}ms…`,
        error instanceof Error ? error.message : error
      );
      await new Promise((r) => setTimeout(r, delay));
      return openrouterRequest(fn, retries - 1, attempt + 1);
    }

    throw error;
  }
}
