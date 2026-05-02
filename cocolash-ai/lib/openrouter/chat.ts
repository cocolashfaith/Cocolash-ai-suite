/**
 * lib/openrouter/chat.ts — Streaming Claude chat completions for the chatbot.
 *
 * Mirrors the captions / scripts non-streaming pattern in the same folder
 * but exposes an AsyncIterable<string> of delta tokens. Used by
 * app/api/chat/route.ts to drive the SSE stream.
 *
 * Models (locked in 02-CONTEXT.md):
 *   - chat completions: anthropic/claude-sonnet-4.6
 *   - intent classifier (separate file): anthropic/claude-haiku-4.5
 */

import OpenAI from "openai";
import { getOpenRouterClient, openrouterRequest } from "./client";
import { ChatError } from "../chat/error";

export const CHAT_MODEL = "anthropic/claude-sonnet-4.6";

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChatOptions {
  systemPrompt: string;
  history: ReadonlyArray<ChatMessageInput>;
  /** Defaults to CHAT_MODEL. Override only for eval / experiments. */
  model?: string;
  /** Hard cap on output tokens. Default 1024 (≈ 700 words). */
  maxTokens?: number;
  /** 0..1; default 0.7 — tuned for Coco's warmth without rigidity. */
  temperature?: number;
}

export interface StreamChatResult {
  /** Iterates deltas as they arrive. Final iteration ends naturally. */
  tokens: AsyncIterable<string>;
  /**
   * Resolves when streaming completes. Carries final usage stats. Note this
   * promise only resolves AFTER the consumer has fully drained `tokens`.
   */
  done: Promise<{
    fullText: string;
    inputTokens: number | null;
    outputTokens: number | null;
  }>;
}

/**
 * Stream a chat completion from Claude (via OpenRouter).
 *
 * Throws ChatError on configuration problems; transient errors are retried
 * by the underlying openrouterRequest wrapper for the non-stream path. For
 * streams we do NOT retry mid-stream — partial output is preferable to
 * starting over.
 */
export function streamChat(opts: StreamChatOptions): StreamChatResult {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new ChatError(
      "OPENROUTER_API_KEY is not configured",
      500,
      "missing_api_key"
    );
  }

  const client = getOpenRouterClient();
  const model = opts.model ?? CHAT_MODEL;
  const maxTokens = opts.maxTokens ?? 1024;
  const temperature = opts.temperature ?? 0.7;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Capture state for the done promise.
  let resolveDone: (value: {
    fullText: string;
    inputTokens: number | null;
    outputTokens: number | null;
  }) => void = () => {};
  let rejectDone: (reason: unknown) => void = () => {};
  const done = new Promise<{
    fullText: string;
    inputTokens: number | null;
    outputTokens: number | null;
  }>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  async function* iterate(): AsyncIterable<string> {
    let fullText = "";
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    try {
      // The wrapped non-stream retry helper isn't appropriate for a stream
      // (we'd lose tokens already emitted). We call the SDK directly.
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: maxTokens,
        temperature,
      });

      for await (const part of stream) {
        const delta = part.choices?.[0]?.delta?.content ?? "";
        if (delta.length > 0) {
          fullText += delta;
          yield delta;
        }
        // Usage is sent on the final chunk when include_usage is enabled.
        const usage = part.usage;
        if (usage) {
          inputTokens = usage.prompt_tokens ?? null;
          outputTokens = usage.completion_tokens ?? null;
        }
      }
      resolveDone({ fullText, inputTokens, outputTokens });
    } catch (err: unknown) {
      rejectDone(err);
      throw err instanceof Error
        ? err
        : new ChatError(String(err), 502, "internal_error");
    }
  }

  return { tokens: iterate(), done };
}

/**
 * Non-streaming convenience for places that don't need progressive output
 * (e.g. the intent classifier may use this — though it has its own file).
 */
export async function completeChatOnce(opts: StreamChatOptions): Promise<{
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}> {
  const client = getOpenRouterClient();
  const model = opts.model ?? CHAT_MODEL;
  const maxTokens = opts.maxTokens ?? 1024;
  const temperature = opts.temperature ?? 0.7;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
  ];

  return openrouterRequest(async () => {
    const res = await client.chat.completions.create({
      model,
      messages,
      stream: false,
      max_tokens: maxTokens,
      temperature,
    });
    const text = res.choices?.[0]?.message?.content ?? "";
    return {
      text,
      inputTokens: res.usage?.prompt_tokens ?? null,
      outputTokens: res.usage?.completion_tokens ?? null,
    };
  });
}
