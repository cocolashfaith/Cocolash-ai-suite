/**
 * lib/chat/types.ts — Local types for the milestone v3.0 chatbot.
 *
 * Cross-cutting types used outside lib/chat/** belong in lib/types/index.ts.
 * This file holds types internal to the chat pipeline (DB row shapes,
 * configuration, chunking primitives).
 */

// ── Knowledge base ────────────────────────────────────────────

/**
 * Authority tier for retrieval ranking. Lower number = higher authority.
 * Mirrors knowledge_chunks.tier in supabase/migrations/20260502_chatbot_foundation.sql.
 */
export type KnowledgeTier = 1 | 2 | 3;

export type KnowledgeSourceType =
  | "faq_kb"
  | "product_md"
  | "product_csv"
  | "voice_doc"
  | "storefront_api"
  | "admin_upload";

export interface KnowledgeChunk {
  id: string;
  source_type: KnowledgeSourceType;
  source_id: string;
  tier: KnowledgeTier;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  content_hash: string;
  embedding: number[] | null;
  embedding_model: string;
  created_at: string;
  updated_at: string;
}

/**
 * A chunk before it has been embedded or persisted. Used by the ingest script.
 */
export interface DraftChunk {
  source_type: KnowledgeSourceType;
  source_id: string;
  tier: KnowledgeTier;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

// ── Voice ─────────────────────────────────────────────────────

/**
 * Editable voice fragments stored in chat_settings.voice_fragments (jsonb).
 * Phase 7's admin UI lets Faith edit any of these without a code deploy.
 *
 * The non-negotiable rules section is NOT part of this contract — it lives in
 * lib/chat/voice-rules.ts and is compiled into the prompt server-side, in a
 * position that cannot be shadowed by a fragment edit.
 */
export interface VoiceFragments {
  persona_name: string;
  greeting: string;
  recommend_intro: string;
  escalation: string;
  after_hours_suffix: string;
  lead_capture: string;
  /** Use {product} placeholder for the product name. */
  tryon_offer: string;
  dont_know: string;
}

// ── Settings ──────────────────────────────────────────────────

export interface ChatSettings {
  id: string;
  bot_enabled: boolean;
  daily_cap_usd: number;
  voice_fragments: VoiceFragments;
  default_top_k: number;
  embedding_model: string;
  system_prompt_version: string;
  updated_at: string;
  updated_by: string | null;
}

// ── Sessions and messages ─────────────────────────────────────

export type ChatRole = "user" | "assistant" | "system";

/**
 * Per-turn intent label. Populated by the Phase 2 intent classifier; null on
 * messages persisted before classification (e.g. system seed messages).
 */
export type IntentLabel =
  | "product"
  | "tryon"
  | "order"
  | "support"
  | "lead_capture"
  | "other";

export interface ChatSession {
  id: string;
  shopify_customer_id: string | null;
  shop_domain: string | null;
  consent: SessionConsent;
  intent_summary: string | null;
  status: "active" | "archived";
  created_at: string;
  last_active_at: string;
}

export interface SessionConsent {
  cookie?: boolean;
  selfie?: boolean;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: ChatRole;
  content: string;
  intent: IntentLabel | null;
  retrieved_chunk_ids: string[] | null;
  product_card_ids: string[] | null;
  tryon_image_url: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  created_at: string;
}

// ── Cost events ───────────────────────────────────────────────

export type CostPipeline =
  | "chat_completion"
  | "embedding"
  | "tryon_compose"
  | "intent_classify";

export interface ChatCostEvent {
  id: string;
  session_id: string | null;
  pipeline: CostPipeline;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  unit_cost_usd: number | null;
  total_cost_usd: number;
  created_at: string;
}
