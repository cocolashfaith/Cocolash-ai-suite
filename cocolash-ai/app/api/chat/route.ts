/**
 * POST /api/chat — milestone v3.0 Sales Assistant chat endpoint.
 *
 * Server-Sent Events (SSE) stream that:
 *   1. Validates the request body (Zod).
 *   2. Loads / creates a chat session.
 *   3. Reads chat_settings (kill-switch + voice fragments).
 *   4. Embeds the query + retrieves top-K chunks (lib/chat/retrieve.ts).
 *   5. Runs intent classification in parallel with the chat completion.
 *   6. Composes the system prompt via lib/chat/voice.ts.
 *   7. Streams Claude Sonnet 4.6 deltas as SSE 'token' events.
 *   8. Persists user + assistant messages with intent + retrieval refs.
 *
 * Out of scope this phase: product cards (Phase 4), discount injection
 * (Phase 5), try-on (Phase 6), App Proxy customer recognition (Phase 8),
 * cost kill-switch enforcement + structured logging (Phase 9).
 */

import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { ChatError } from "@/lib/chat/error";
import { isBusinessHours } from "@/lib/chat/hours";
import { classifyIntent } from "@/lib/chat/intent";
import { retrieve } from "@/lib/chat/retrieve";
import { buildProductContext } from "@/lib/chat/product-context";
import { fetchActiveDiscounts, selectDiscountForTurn } from "@/lib/chat/discount";
import { preflight } from "@/lib/chat/preflight";
import { chatRateLimiter } from "@/lib/chat/rate-limit";
import { log } from "@/lib/log";
import { streamChat } from "@/lib/openrouter/chat";
import { composeSystemPrompt, DEFAULT_VOICE_FRAGMENTS } from "@/lib/chat/voice";
import {
  appendMessage,
  createSession,
  getChatSettings,
  listMessagesForSession,
  recordCostEvent,
  touchSession,
} from "@/lib/chat/db";
import type { ChatMessageInput } from "@/lib/openrouter/chat";
import type { VoiceFragments, IntentLabel } from "@/lib/chat/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ChatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000),
  customerId: z.string().min(1).max(100).optional(),
  shopDomain: z.string().min(1).max(200).optional(),
});

// Rough token-cost figures for the daily-cap accounting (Phase 9 reads). Per
// 1M tokens: Claude Sonnet 4.6 ~$3 in / $15 out, Haiku 4.5 ~$1 in / $5 out,
// embedding-3-small ~$0.02 in. Numbers are approximate; final source is the
// per-request usage stats from each call.
const COST_PER_M = {
  sonnet_in: 3,
  sonnet_out: 15,
  haiku_in: 1,
  haiku_out: 5,
  embedding_in: 0.02,
} as const;

function usd(tokens: number, perM: number): number {
  return (tokens / 1_000_000) * perM;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ChatError(
      "Supabase service-role config missing",
      500,
      "missing_api_key"
    );
  }
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

function sseFrame(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const start = Date.now();

  // Parse + validate body.
  let body: z.infer<typeof ChatRequestSchema>;
  try {
    const parsed = ChatRequestSchema.parse(await req.json());
    body = parsed;
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "invalid_request",
        message: err instanceof z.ZodError ? err.issues : String(err),
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const supabase = (() => {
    try {
      return getServiceSupabase();
    } catch (err) {
      const e = err instanceof ChatError ? err : new ChatError(String(err), 500, "internal_error");
      throw e;
    }
  })();

  // Phase 9 preflight: kill-switch + cost-cap.
  const pre = await preflight(supabase);
  if (!pre.canProceed) {
    log.warn("chat.preflight_block", {
      requestId,
      reason: pre.reason,
      spentToday: pre.spentToday,
      capUsd: pre.capUsd,
    });
    const message =
      pre.reason === "cost_cap_exceeded"
        ? "Coco's hit her daily limit — back tomorrow!"
        : "Coco is taking a quick break. Please try again later.";
    return new Response(
      JSON.stringify({ error: pre.reason ?? "bot_disabled", message }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }

  // Phase 9 rate limit: 30 / 5 min per session (or IP).
  const rateKey = body.sessionId ?? req.headers.get("x-forwarded-for") ?? "anon";
  const rl = chatRateLimiter.consume(rateKey);
  if (!rl.allowed) {
    log.warn("chat.rate_limited", { requestId, key: rateKey, resetMs: rl.resetMs });
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "Slow down a sec gorgeous — try again in a moment.",
        retryAfterMs: rl.resetMs,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(Math.ceil(rl.resetMs / 1000)),
        },
      }
    );
  }

  // Load settings (we still need voice_fragments + default_top_k below).
  const settings = await getChatSettings(supabase);

  // Resolve / create session.
  const session = body.sessionId
    ? { id: body.sessionId }
    : await createSession(supabase, {
        shopify_customer_id: body.customerId ?? null,
        shop_domain: body.shopDomain ?? null,
      });

  // Persist the user message immediately so transcripts are durable even
  // if the model call fails mid-stream.
  await appendMessage(supabase, {
    session_id: session.id,
    role: "user",
    content: body.message,
  });

  // Phase 14: detect an email in the user's message and write a
  // `lead_captures` row. The widget never explicitly POSTs to /api/chat/lead
  // — visitors just type their email mid-conversation. We extract here so
  // the admin Leads panel actually populates.
  const emailMatch = body.message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) {
    const email = emailMatch[0].toLowerCase();
    try {
      const { error } = await supabase.from("lead_captures").insert({
        session_id: session.id,
        email,
        consent: true,
        intent_at_capture: null,
        discount_offered: null,
        notes: "captured from chat message",
      });
      if (error) {
        log.warn("chat.lead_capture_failed", {
          requestId,
          sessionId: session.id,
          error: error.message,
        });
      } else {
        log.info("chat.lead_captured", { requestId, sessionId: session.id, email });
      }
    } catch (err) {
      log.warn("chat.lead_capture_threw", {
        requestId,
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Run intent + retrieval + history in parallel.
  const [intentResult, retrieveResult, history] = await Promise.all([
    classifyIntent(body.message),
    retrieve(supabase, body.message, { topK: settings.default_top_k }),
    listMessagesForSession(supabase, session.id, 20).catch(() => []),
  ]);

  // Build live product context (Phase 4). Best-effort: failure is silent.
  // Pull the most recent assistant turn so generic follow-ups like "yes, try
  // it on" still surface whichever product Coco just recommended.
  const lastAssistantText = (() => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "assistant") return history[i].content;
    }
    return "";
  })();
  // Don't-know guardrail (RAG-05): force lead_capture when no chunk passes threshold.
  // (Computed up-front so the discount selector sees the post-guardrail intent.)
  const intentForOffer = retrieveResult.noConfidentMatch
    ? ("lead_capture" as const)
    : intentResult.intent;

  // Phase 5: pick a discount code (Stage 1: one per turn). Best-effort.
  // We pick the discount BEFORE building product cards so the Add-to-cart
  // permalink can carry `?discount=CODE`. The current rule corpus uses
  // null product_line_scope (any-product), so passing an empty handle list
  // here doesn't cause spurious rejects.
  const discountRules = await fetchActiveDiscounts(supabase).catch(() => []);
  const offered = selectDiscountForTurn(discountRules, {
    intent: intentForOffer,
    productHandles: [],
  });

  const productContext = await buildProductContext(
    body.message,
    retrieveResult.chunks,
    lastAssistantText,
    offered?.code ?? null
  ).catch(() => ({ cards: [], promptText: "" }));

  const finalIntent: IntentLabel = intentForOffer;

  // Build the system prompt.
  const fragments: VoiceFragments =
    (settings.voice_fragments as VoiceFragments) ?? DEFAULT_VOICE_FRAGMENTS;

  const systemPrompt = composeSystemPrompt({
    fragments,
    retrievedChunks: retrieveResult.noConfidentMatch ? [] : retrieveResult.chunks,
    isBusinessHours: isBusinessHours(),
    productContext: productContext.promptText,
    discountCode: offered ? { code: offered.code, description: offered.description } : null,
  });

  // Convert the persisted history (which already includes the user turn we
  // just appended) into Claude messages. We slice to the last 20 turns.
  const claudeHistory: ChatMessageInput[] = history
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  // If history fetch failed (e.g. transient), include just the current
  // message as fallback.
  if (claudeHistory.length === 0) {
    claudeHistory.push({ role: "user", content: body.message });
  }

  // Open the SSE stream.
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      void runStream(controller);
    },
  });

  async function runStream(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    let assistantText = "";
    try {
      controller.enqueue(
        sseFrame("sources", {
          chunkIds: retrieveResult.chunks.map((c) => c.id),
          noConfidentMatch: retrieveResult.noConfidentMatch,
        })
      );

      // Hold product cards until AFTER the assistant text streams (Phase 11
      // fix #1). Emitting up-front made the widget paint cards into an empty
      // bubble while text was still streaming, so cards appeared "above" the
      // text. We now emit a single consolidated products frame post-stream.

      const { tokens, done } = streamChat({
        systemPrompt,
        history: claudeHistory,
      });

      for await (const delta of tokens) {
        assistantText += delta;
        controller.enqueue(sseFrame("token", { delta }));
      }

      // Now that the assistant text is fully streamed, emit ONE consolidated
      // products frame. This includes both candidates from the user message
      // and any product names Coco mentioned mid-response.
      if (assistantText.length > 0) {
        const followup = await buildProductContext(
          body.message,
          retrieveResult.chunks,
          assistantText,
          offered?.code ?? null
        ).catch(() => ({ cards: [], promptText: "" }));
        const merged = new Map<string, (typeof productContext.cards)[number]>();
        for (const c of productContext.cards) merged.set(c.handle, c);
        for (const c of followup.cards) if (!merged.has(c.handle)) merged.set(c.handle, c);
        const finalCards = [...merged.values()];
        if (finalCards.length > 0) {
          controller.enqueue(sseFrame("products", { products: finalCards }));
        }
      } else if (productContext.cards.length > 0) {
        // Stream produced nothing (rare, e.g. content-filter), but we did
        // resolve cards up-front — surface them so the user still has options.
        controller.enqueue(sseFrame("products", { products: productContext.cards }));
      }

      const usage = await done;

      // Record cost events.
      const sonnetCost =
        usd(usage.inputTokens ?? 0, COST_PER_M.sonnet_in) +
        usd(usage.outputTokens ?? 0, COST_PER_M.sonnet_out);
      await recordCostEvent(supabase, {
        session_id: session.id,
        pipeline: "chat_completion",
        model: "anthropic/claude-sonnet-4.6",
        tokens_in: usage.inputTokens ?? undefined,
        tokens_out: usage.outputTokens ?? undefined,
        unit_cost_usd: undefined,
        total_cost_usd: sonnetCost,
      }).catch(() => undefined);

      if (intentResult.inputTokens !== null && intentResult.outputTokens !== null) {
        const haikuCost =
          usd(intentResult.inputTokens, COST_PER_M.haiku_in) +
          usd(intentResult.outputTokens, COST_PER_M.haiku_out);
        await recordCostEvent(supabase, {
          session_id: session.id,
          pipeline: "intent_classify",
          model: "anthropic/claude-haiku-4.5",
          tokens_in: intentResult.inputTokens,
          tokens_out: intentResult.outputTokens,
          total_cost_usd: haikuCost,
        }).catch(() => undefined);
      }

      // Persist the assistant turn.
      await appendMessage(supabase, {
        session_id: session.id,
        role: "assistant",
        content: assistantText,
        intent: finalIntent,
        retrieved_chunk_ids: retrieveResult.chunks.map((c) => c.id),
        tokens_in: usage.inputTokens,
        tokens_out: usage.outputTokens,
        latency_ms: Date.now() - start,
      });

      await touchSession(supabase, session.id).catch(() => undefined);

      controller.enqueue(
        sseFrame("done", {
          requestId,
          sessionId: session.id,
          intent: finalIntent,
          tokensIn: usage.inputTokens,
          tokensOut: usage.outputTokens,
          latencyMs: Date.now() - start,
        })
      );
      log.info("chat.completed", {
        requestId,
        sessionId: session.id,
        intent: finalIntent,
        retrievedChunkIds: retrieveResult.chunks.map((c) => c.id),
        productHandles: productContext.cards.map((c) => c.handle),
        offeredCode: offered?.code ?? null,
        tokensIn: usage.inputTokens,
        tokensOut: usage.outputTokens,
        latencyMs: Date.now() - start,
        spentTodayUsd: pre.spentToday,
        capUsd: pre.capUsd,
      });
    } catch (err: unknown) {
      const ce = err instanceof ChatError
        ? err
        : new ChatError(
            err instanceof Error ? err.message : "Internal error",
            500,
            "internal_error"
          );
      controller.enqueue(
        sseFrame("error", {
          status: ce.status,
          code: ce.code,
          message: ce.code === "internal_error" ? "Something went wrong on our side." : ce.message,
          requestId,
        })
      );
      // Best-effort: persist the partial assistant turn so the transcript
      // captures what was produced before the failure.
      if (assistantText.length > 0) {
        await appendMessage(supabase, {
          session_id: session.id,
          role: "assistant",
          content: assistantText,
          intent: finalIntent,
          retrieved_chunk_ids: retrieveResult.chunks.map((c) => c.id),
          latency_ms: Date.now() - start,
        }).catch(() => undefined);
      }
    } finally {
      controller.close();
    }
  }

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-chat-session-id": session.id,
      "x-chat-request-id": requestId,
      "x-accel-buffering": "no",
    },
  });
}
