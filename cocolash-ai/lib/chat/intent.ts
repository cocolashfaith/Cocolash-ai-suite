/**
 * lib/chat/intent.ts — Per-turn intent classifier.
 *
 * Single Claude Haiku 4.5 call per user message returning one of:
 *   product / tryon / order / support / lead_capture / other
 *
 * Decisions D-02, D-11, D-12 (.planning/phases/02-chat-api/02-CONTEXT.md).
 * Defaults to "other" on any parse failure so a flaky classifier never
 * blocks the chat reply.
 */

import { completeChatOnce } from "../openrouter/chat";
import type { IntentLabel } from "./types";

export const INTENT_MODEL = "anthropic/claude-haiku-4.5";

export const INTENT_LABELS: ReadonlyArray<IntentLabel> = [
  "product",
  "tryon",
  "order",
  "support",
  "lead_capture",
  "other",
];

export const INTENT_SYSTEM_PROMPT = `
You classify a single user message from a CocoLash on-site chatbot visitor
into ONE of these intents:

- product       → asking about a product (style, fit, ingredients, price,
                  comparison, reviews, recommendation request).
- tryon         → asking to see the lashes on themselves, asking how it
                  would look, or specifically wanting a virtual try-on.
- order         → asking about shipping, tracking, modification, return,
                  refund, exchange, an existing order, account, or subscription.
- support       → frustration, complaint, sensitive concern, request to
                  reach a human, complex question outside the FAQ.
- lead_capture  → about to leave / browsing without purchase intent /
                  asking for a discount or coupon / explicitly leaving
                  contact details.
- other         → small talk, greetings only, or anything that doesn't fit.

Respond with EXACTLY one word — the label — and nothing else.
`.trim();

export interface ClassifyOptions {
  /** Optional override (eg. for tests). */
  model?: string;
}

/**
 * Classify a single user message. Returns the label and the underlying
 * usage stats so the caller can record costs.
 */
export async function classifyIntent(
  message: string,
  options: ClassifyOptions = {}
): Promise<{
  intent: IntentLabel;
  inputTokens: number | null;
  outputTokens: number | null;
}> {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return { intent: "other", inputTokens: 0, outputTokens: 0 };
  }

  try {
    const res = await completeChatOnce({
      systemPrompt: INTENT_SYSTEM_PROMPT,
      history: [{ role: "user", content: trimmed }],
      model: options.model ?? INTENT_MODEL,
      maxTokens: 8,
      temperature: 0,
    });
    return {
      intent: parseIntent(res.text),
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    };
  } catch {
    // Never block the chat on a classifier failure. Default to "other".
    return { intent: "other", inputTokens: null, outputTokens: null };
  }
}

/**
 * Strict parser exported for unit tests. Lower-cases, trims, and matches
 * against the known label set. Falls back to "other".
 */
export function parseIntent(raw: string): IntentLabel {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z_]/g, "");
  if ((INTENT_LABELS as ReadonlyArray<string>).includes(cleaned)) {
    return cleaned as IntentLabel;
  }
  // Try the first whitespace-separated token in case the model adds a period
  // or comment.
  const firstToken = raw.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z_]/g, "") ?? "";
  if ((INTENT_LABELS as ReadonlyArray<string>).includes(firstToken)) {
    return firstToken as IntentLabel;
  }
  return "other";
}
