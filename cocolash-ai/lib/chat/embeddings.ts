/**
 * lib/chat/embeddings.ts — Embedding wrapper for the chatbot RAG.
 *
 * Routes through OpenRouter (`/api/v1/embeddings`) reusing the existing
 * `OPENROUTER_API_KEY`. The OpenAI SDK is OpenAI-compatible and points at
 * OpenRouter via `lib/openrouter/client.ts`. Model id is namespaced as
 * `openai/text-embedding-3-small` (1536-dim, ~$0.02 / 1M tokens).
 *
 * Decision D-18 (.planning/phases/01-foundation/01-CONTEXT.md) originally
 * specified the direct OpenAI endpoint; we consolidated to OpenRouter at the
 * start of Phase 4 testing to drop a redundant API key. The chunk
 * embedding_model column still records "text-embedding-3-small" so a future
 * vendor swap is detectable.
 */

import { getOpenRouterClient, openrouterRequest } from "../openrouter/client";
import { ChatError } from "./error";

/** Stored verbatim in `knowledge_chunks.embedding_model`. Drop the `openai/`
 *  namespace so a future swap (e.g. to `voyage-3-large`) is unambiguous. */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
const OPENROUTER_MODEL_ID = "openai/text-embedding-3-small";

function ensureKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new ChatError(
      "OPENROUTER_API_KEY is not configured",
      500,
      "missing_api_key"
    );
  }
}

/**
 * Embed a single text. Throws ChatError on missing key or API failure.
 */
export async function embed(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new ChatError("Cannot embed empty text", 400, "invalid_input");
  }
  ensureKey();
  const client = getOpenRouterClient();
  return openrouterRequest(async () => {
    const res = await client.embeddings.create({
      model: OPENROUTER_MODEL_ID,
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
 * Embed many texts in a single API call. OpenAI/OpenRouter accept large
 * batches; we cap at 2048 inputs per request so callers pre-chunk.
 * Returns a vector per input, preserving order.
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
      `Batch size ${texts.length} exceeds 2048-input limit; chunk before calling embedMany`,
      400,
      "invalid_input"
    );
  }
  ensureKey();
  const client = getOpenRouterClient();
  return openrouterRequest(async () => {
    const res = await client.embeddings.create({
      model: OPENROUTER_MODEL_ID,
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
