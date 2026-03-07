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

export async function openrouterRequest<T>(
  fn: () => Promise<T>,
  retries = 1
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const status =
      error instanceof OpenAI.APIError ? error.status : undefined;

    if (retries > 0 && (status === 429 || status === 500 || status === 503)) {
      const delay = status === 429 ? 2000 : 1000;
      await new Promise((r) => setTimeout(r, delay));
      return openrouterRequest(fn, retries - 1);
    }

    throw error;
  }
}
