/**
 * lib/chat/embeddings.ts — OpenAI embedding wrapper for the chatbot RAG.
 *
 * Uses OpenAI's text-embedding-3-small (1536-dim, $0.02/1M tokens) per
 * decision D-18 in .planning/phases/01-foundation/01-CONTEXT.md.
 *
 * NOTE: distinct from lib/openrouter/client.ts which talks to OpenRouter for
 * Claude chat completions. OpenRouter does not expose OpenAI's embeddings
 * endpoint, so we use the official OpenAI SDK directly here.
 */

import OpenAI from "openai";
import { ChatError } from "./error";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ChatError(
      "OPENAI_API_KEY is not configured",
      500,
      "missing_api_key"
    );
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

/**
 * Embed a single text. Throws ChatError on missing key or API failure.
 */
export async function embed(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new ChatError(
      "Cannot embed empty text",
      400,
      "invalid_input"
    );
  }

  const client = getClient();
  return withRetry(async () => {
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    const vector = res.data[0]?.embedding;
    if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
      throw new ChatError(
        `Embedding response invalid (length=${vector?.length ?? 0})`,
        502,
        "embedding_failed"
      );
    }
    return vector;
  });
}

/**
 * Embed many texts in a single API call. OpenAI accepts up to 2048 inputs
 * per request; callers should chunk above that. Returns a vector per input,
 * preserving order.
 */
export async function embedMany(texts: ReadonlyArray<string>): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.some((t) => !t || t.trim().length === 0)) {
    throw new ChatError(
      "Cannot embed empty text in batch",
      400,
      "invalid_input"
    );
  }
  if (texts.length > 2048) {
    throw new ChatError(
      `Batch size ${texts.length} exceeds OpenAI 2048-input limit; chunk before calling embedMany`,
      400,
      "invalid_input"
    );
  }

  const client = getClient();
  return withRetry(async () => {
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [...texts],
    });
    if (res.data.length !== texts.length) {
      throw new ChatError(
        `Embedding response count mismatch (got ${res.data.length}, expected ${texts.length})`,
        502,
        "embedding_failed"
      );
    }
    return res.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  });
}

// ── Retry helper with exponential backoff on 429 / 5xx ────────
const MAX_RETRIES = 4;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt < MAX_RETRIES) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = extractStatus(err);
      const retriable = status === 429 || (status !== undefined && status >= 500);
      if (!retriable) throw err;
      const backoffMs = 250 * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
      await sleep(backoffMs);
      attempt += 1;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ChatError("Embedding retries exhausted", 502, "embedding_failed");
}

function extractStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stable content hash used to skip re-embedding unchanged chunks (D-17).
 * Async API mirrors Web Crypto.
 */
export async function contentHash(content: string): Promise<string> {
  const enc = new TextEncoder().encode(content);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
