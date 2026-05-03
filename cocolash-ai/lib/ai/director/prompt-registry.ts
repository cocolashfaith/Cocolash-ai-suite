/**
 * Suite-wide AI prompt registry.
 *
 * `/admin/prompts` (Phase 19) imports `getFullPromptRegistry()` to render
 * every AI system prompt the suite uses — Director prompts, chat, intent,
 * captions, image generation. When you add a new AI prompt anywhere in
 * lib/, register it here so admins can review it without spelunking the
 * codebase.
 */

import { PROMPT_REGISTRY as DIRECTOR_PROMPTS } from "./system-prompts";
import type { PromptRegistryEntry } from "./system-prompts";

export type { PromptRegistryEntry } from "./system-prompts";

/**
 * Get the full registry of AI system prompts in the suite.
 *
 * The Director prompts come from system-prompts.ts. The other prompts
 * (chat, intent, captions, image-gen, video-script) are sourced lazily
 * from their owning modules so we don't pay import-time cost on every
 * page that imports this file.
 */
export function getFullPromptRegistry(): PromptRegistryEntry[] {
  // Prompts from other modules — collected here so /admin/prompts has one place to read.
  const otherPrompts: PromptRegistryEntry[] = [];

  // Chat — brand-voice system prompt is composed dynamically (greeting fragments
  // + brand-voice rules + KB-grounded context). We surface the foundation here.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const voice = require("@/lib/chat/voice") as typeof import("@/lib/chat/voice");
    if (voice.DEFAULT_VOICE_FRAGMENTS) {
      const sample = voice.composeSystemPrompt({
        fragments: voice.DEFAULT_VOICE_FRAGMENTS,
        isBusinessHours: true,
      });
      otherPrompts.push({
        id: "chat-brand-voice",
        name: "Chatbot — Brand Voice System Prompt (composed)",
        surface:
          "/widget on cocolash.com → every customer message → /api/chat → Claude Sonnet 4.6",
        model: "anthropic/claude-sonnet-4.6",
        filePath: "lib/chat/voice.ts (composeSystemPrompt + DEFAULT_VOICE_FRAGMENTS)",
        text: sample,
      });
    }
  } catch {
    // composeSystemPrompt may have unmet deps in test env; skip silently
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const intent = require("@/lib/chat/intent") as typeof import("@/lib/chat/intent");
    if (intent.INTENT_SYSTEM_PROMPT) {
      otherPrompts.push({
        id: "chat-intent-classifier",
        name: "Chatbot — Intent Classifier",
        surface:
          "/widget on cocolash.com → every customer message → intent label (product / tryon / order / support / lead_capture / other)",
        model: intent.INTENT_MODEL,
        filePath: "lib/chat/intent.ts",
        text: intent.INTENT_SYSTEM_PROMPT,
      });
    }
  } catch {
    // skip silently
  }

  return [...DIRECTOR_PROMPTS, ...otherPrompts];
}
