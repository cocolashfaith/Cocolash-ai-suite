/**
 * lib/chat/voice.ts — System-prompt composer for the milestone v3.0 chatbot.
 *
 * Single entrypoint for assembling the prompt sent to Claude. Order is fixed:
 *
 *   1. PERSONA_HEADER          — "You are Coco, …"
 *   2. EDITABLE_FRAGMENTS      — greeting, recommend intro, escalation, etc.
 *   3. LOCKED_RULES            — never-shadowable, from voice-rules.ts
 *   4. RETRIEVED_CONTEXT       — KB chunks injected by lib/chat/retrieve.ts (Phase 2)
 *   5. CONVERSATION_HISTORY    — handled by the caller
 *
 * Rules are appended AFTER editable fragments so an admin edit cannot
 * shadow them. If the order ever changes, the smoke test in
 * voice-rules.test.ts must be updated alongside.
 */

import type { KnowledgeChunk, VoiceFragments } from "./types";
import { VOICE_RULES, VOICE_RULES_VERSION } from "./voice-rules";

/**
 * CocoLash's live AR (camera) try-on experience — a separate, richer try-on
 * than the in-chat "See it on you" selfie compositor. Surfaced in the prompt so
 * Coco recommends it when a visitor wants to see lashes on themselves.
 */
export const AR_TRYON_URL = "https://cocolash.com/pages/ar-try-on";

// ── Defaults seeded by the migration ──────────────────────────
// Identical to the values inserted into chat_settings.voice_fragments by
// supabase/migrations/20260502_chatbot_foundation.sql. Used as a fallback
// in tests and when the settings row hasn't been hydrated yet.
export const DEFAULT_VOICE_FRAGMENTS: VoiceFragments = {
  persona_name: "Coco",
  greeting: "Hey gorgeous! I'm Coco. What can I help you find today?",
  recommend_intro:
    "Tell me a little about your look. Natural and everyday, or bold for a moment? And are you new to lash extensions or a regular?",
  escalation:
    "Let me get this to Faith's team. They'll reach out at the email you give me. What's the best one to use?",
  after_hours_suffix:
    "They're online Mon to Fri, 9 AM to 5 PM EST and aim to reply within 24h.",
  lead_capture:
    "If you're not ready to commit, no pressure. Drop your email and I'll send a little something to make your first set easier on the wallet.",
  tryon_offer:
    "Want to see {product} on you? Tap the See it on you button on the product card below and upload a quick selfie.",
  dont_know:
    "I want to get this right. Let me check with the team. What email should I send the answer to?",
};

export interface ComposeSystemPromptInput {
  fragments: VoiceFragments;
  retrievedChunks?: ReadonlyArray<KnowledgeChunk>;
  /** Optional product context the bot may reference this turn (Phase 4). */
  productContext?: string;
  /** Optional discount code rendered in the prompt for this turn (Phase 5). */
  discountCode?: { code: string; description: string } | null;
  /**
   * Whether the request is inside business hours (Mon–Fri 9–5 EST). When
   * false, the after_hours_suffix is appended to the escalation fragment.
   */
  isBusinessHours: boolean;
  /** Whether the visitor is recognised as a logged-in Shopify customer (Phase 8). */
  customerContext?: { firstName?: string; lastOrderSummary?: string } | null;
  /**
   * If the visitor's message this turn contained an email address, it's passed
   * here. The route has already saved it to the team's leads inbox, so Coco
   * must acknowledge it once and NOT ask for it again (fixes the email loop).
   */
  customerProvidedEmail?: string | null;
}

const PERSONA_HEADER = (personaName: string): string => `
You are ${personaName}, the on-site shopping assistant for CocoLash, a luxury
DIY lash brand. You help visitors find the right lashes, answer product and
ordering questions, and (when invited) preview a style on their selfie.
`.trim();

/**
 * Renders the editable fragments section. The order is intentional and
 * mirrors how a conversation typically unfolds.
 */
function renderFragments(
  fragments: VoiceFragments,
  isBusinessHours: boolean
): string {
  const escalationLine = isBusinessHours
    ? fragments.escalation
    : `${fragments.escalation} ${fragments.after_hours_suffix}`;

  return [
    `Persona name: ${fragments.persona_name}`,
    `Default greeting (use early in a session): "${fragments.greeting}"`,
    `When recommending products, open with: "${fragments.recommend_intro}"`,
    `When you cannot help and need to hand off: "${escalationLine}"`,
    `When offering a lead-capture discount: "${fragments.lead_capture}"`,
    `When proactively offering virtual try-on: "${fragments.tryon_offer}" — replace {product} with the actual product name.`,
    `We also offer a live AR try-on (uses the visitor's camera) at ${AR_TRYON_URL}. When a visitor wants to see lashes on themselves, is torn between styles, or asks about trying them on, recommend it alongside the in-chat "See it on you" button — share it as a clickable Markdown link, e.g. "[try them on live in AR](${AR_TRYON_URL})". Only mention it for lash styles, not for accessories or tools.`,
    `When you don't know an answer: "${fragments.dont_know}"`,
  ].join("\n");
}

function renderChunks(chunks: ReadonlyArray<KnowledgeChunk>): string {
  if (chunks.length === 0) {
    return (
      "No retrieval context for this turn. This is NORMAL and does not mean you can't help. " +
      "Answer from the CocoLash facts and the live product context above — they cover wear time, " +
      "reusability, application, shipping, returns, ingredients, and each style's look. Only hand off " +
      "to the team for things genuinely outside those (personal order details, custom requests, complaints)."
    );
  }
  return chunks
    .map((c, i) => {
      const meta = Object.keys(c.metadata).length > 0
        ? ` [meta: ${JSON.stringify(c.metadata)}]`
        : "";
      return `--- Source ${i + 1} (tier ${c.tier}, ${c.source_type}/${c.source_id})${meta} ---\n${c.title}\n${c.content}`;
    })
    .join("\n\n");
}

function renderCustomerContext(
  customer: ComposeSystemPromptInput["customerContext"]
): string {
  if (!customer) return "Visitor: anonymous (not logged into Shopify).";
  const parts = ["Visitor: logged-in Shopify customer."];
  if (customer.firstName) parts.push(`First name: ${customer.firstName}.`);
  if (customer.lastOrderSummary) parts.push(`Last order: ${customer.lastOrderSummary}.`);
  return parts.join(" ");
}

function renderDiscount(
  discount: ComposeSystemPromptInput["discountCode"]
): string {
  if (!discount) {
    return "Discount available this turn: none. Do not promise or invent a code.";
  }
  return `Discount available this turn: code "${discount.code}" — ${discount.description}. Use it only when contextually appropriate (do not push).`;
}

function renderEmailAck(email: string | null | undefined): string | null {
  if (!email) return null;
  return (
    `The visitor just shared their email (${email}) in their message, and the system has ALREADY ` +
    `saved it to the team's leads inbox. Acknowledge it warmly in one short line (e.g. "Got it, ` +
    `I've passed your email to the team — they'll be in touch soon, watch your inbox") and do NOT ` +
    `ask for their email again this turn. Then continue helping if they asked something else.`
  );
}

/**
 * Compose the final system prompt. This is the single source of truth for
 * the prompt structure used in app/api/chat/route.ts (Phase 2).
 */
export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  const sections: string[] = [
    PERSONA_HEADER(input.fragments.persona_name),
    "## Editable voice fragments",
    renderFragments(input.fragments, input.isBusinessHours),
    "## Locked brand-voice rules (non-negotiable)",
    VOICE_RULES,
    "## Visitor context",
    renderCustomerContext(input.customerContext ?? null),
    "## Discount context",
    renderDiscount(input.discountCode ?? null),
  ];

  const emailAck = renderEmailAck(input.customerProvidedEmail ?? null);
  if (emailAck) {
    sections.push("## Visitor just shared their email");
    sections.push(emailAck);
  }

  if (input.productContext && input.productContext.trim().length > 0) {
    sections.push("## Live product context (this turn)");
    sections.push(input.productContext.trim());
  }

  sections.push("## Retrieved knowledge (this turn)");
  sections.push(renderChunks(input.retrievedChunks ?? []));

  sections.push(`-- voice rules version: ${VOICE_RULES_VERSION} --`);

  return sections.join("\n\n");
}
