/**
 * lib/chat/db.ts — Typed Supabase wrappers for the chatbot tables.
 *
 * Mirrors the patterns of lib/supabase/server.ts (createClient,
 * createAdminClient). Visitor-facing reads use the anon-key client (RLS-
 * respecting); admin-side writes use the service-role client.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { ChatError } from "./error";
import type {
  ChatSession,
  ChatMessage,
  ChatSettings,
  KnowledgeChunk,
  DraftChunk,
  VoiceFragments,
  ChatCostEvent,
  CostPipeline,
} from "./types";

// Single-row settings record — fixed UUID matches the migration seed.
export const CHAT_SETTINGS_SINGLETON_ID =
  "00000000-0000-0000-0000-000000000001";

// ── Settings ──────────────────────────────────────────────────

export async function getChatSettings(
  supabase: SupabaseClient
): Promise<ChatSettings> {
  const { data, error } = await supabase
    .from("chat_settings")
    .select("*")
    .eq("id", CHAT_SETTINGS_SINGLETON_ID)
    .single();

  if (error || !data) {
    throw new ChatError(
      `Failed to load chat_settings: ${error?.message ?? "not found"}`,
      500,
      "internal_error"
    );
  }
  return data as ChatSettings;
}

export async function updateVoiceFragments(
  supabase: SupabaseClient,
  fragments: VoiceFragments,
  updatedBy: string | null
): Promise<void> {
  const { error } = await supabase
    .from("chat_settings")
    .update({
      voice_fragments: fragments,
      updated_by: updatedBy,
    })
    .eq("id", CHAT_SETTINGS_SINGLETON_ID);

  if (error) {
    throw new ChatError(
      `Failed to update voice_fragments: ${error.message}`,
      500,
      "internal_error"
    );
  }
}

// ── Sessions ──────────────────────────────────────────────────

export interface CreateSessionInput {
  shopify_customer_id?: string | null;
  shop_domain?: string | null;
  consent?: { cookie?: boolean; selfie?: boolean };
}

export async function createSession(
  supabase: SupabaseClient,
  input: CreateSessionInput
): Promise<ChatSession> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      shopify_customer_id: input.shopify_customer_id ?? null,
      shop_domain: input.shop_domain ?? null,
      consent: input.consent ?? {},
    })
    .select()
    .single();

  if (error || !data) {
    throw new ChatError(
      `Failed to create chat session: ${error?.message ?? "no row returned"}`,
      500,
      "internal_error"
    );
  }
  return data as ChatSession;
}

export async function touchSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  const { error } = await supabase
    .from("chat_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) {
    throw new ChatError(
      `Failed to touch session ${sessionId}: ${error.message}`,
      500,
      "internal_error"
    );
  }
}

// ── Messages ──────────────────────────────────────────────────

export interface AppendMessageInput {
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  intent?: ChatMessage["intent"];
  retrieved_chunk_ids?: string[];
  product_card_ids?: string[];
  tryon_image_url?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  latency_ms?: number | null;
}

export async function appendMessage(
  supabase: SupabaseClient,
  input: AppendMessageInput
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert(input)
    .select()
    .single();

  if (error || !data) {
    throw new ChatError(
      `Failed to append message: ${error?.message ?? "no row returned"}`,
      500,
      "internal_error"
    );
  }
  return data as ChatMessage;
}

export async function listMessagesForSession(
  supabase: SupabaseClient,
  sessionId: string,
  limit: number = 50
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new ChatError(
      `Failed to list messages: ${error.message}`,
      500,
      "internal_error"
    );
  }
  return (data ?? []) as ChatMessage[];
}

// ── Knowledge chunks ──────────────────────────────────────────

export interface UpsertChunkInput extends DraftChunk {
  embedding: number[];
  embedding_model: string;
  content_hash: string;
}

export async function upsertChunk(
  supabase: SupabaseClient,
  input: UpsertChunkInput
): Promise<{ id: string; action: "inserted" | "updated" | "unchanged" }> {
  // Look up existing row by (source_type, source_id) to determine action.
  const { data: existing, error: fetchErr } = await supabase
    .from("knowledge_chunks")
    .select("id, content_hash")
    .eq("source_type", input.source_type)
    .eq("source_id", input.source_id)
    .maybeSingle();

  if (fetchErr) {
    throw new ChatError(
      `Failed to look up chunk ${input.source_type}/${input.source_id}: ${fetchErr.message}`,
      500,
      "internal_error"
    );
  }

  if (existing && existing.content_hash === input.content_hash) {
    return { id: existing.id as string, action: "unchanged" };
  }

  const row = {
    source_type: input.source_type,
    source_id: input.source_id,
    tier: input.tier,
    title: input.title,
    content: input.content,
    metadata: input.metadata,
    content_hash: input.content_hash,
    embedding: input.embedding,
    embedding_model: input.embedding_model,
  };

  if (existing) {
    const { error } = await supabase
      .from("knowledge_chunks")
      .update(row)
      .eq("id", existing.id as string);
    if (error) {
      throw new ChatError(
        `Failed to update chunk ${input.source_type}/${input.source_id}: ${error.message}`,
        500,
        "internal_error"
      );
    }
    return { id: existing.id as string, action: "updated" };
  }

  const { data: inserted, error } = await supabase
    .from("knowledge_chunks")
    .insert(row)
    .select("id")
    .single();

  if (error || !inserted) {
    throw new ChatError(
      `Failed to insert chunk ${input.source_type}/${input.source_id}: ${error?.message ?? "no row returned"}`,
      500,
      "internal_error"
    );
  }
  return { id: inserted.id as string, action: "inserted" };
}

export async function deleteChunkBySource(
  supabase: SupabaseClient,
  source_type: KnowledgeChunk["source_type"],
  source_id: string
): Promise<void> {
  const { error } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("source_type", source_type)
    .eq("source_id", source_id);
  if (error) {
    throw new ChatError(
      `Failed to delete chunk ${source_type}/${source_id}: ${error.message}`,
      500,
      "internal_error"
    );
  }
}

export async function listChunkSources(
  supabase: SupabaseClient
): Promise<Array<{ source_type: string; source_id: string }>> {
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("source_type, source_id");
  if (error) {
    throw new ChatError(
      `Failed to list chunk sources: ${error.message}`,
      500,
      "internal_error"
    );
  }
  return (data ?? []) as Array<{ source_type: string; source_id: string }>;
}

// ── Cost events ───────────────────────────────────────────────

export interface RecordCostInput {
  session_id?: string | null;
  pipeline: CostPipeline;
  model: string;
  tokens_in?: number;
  tokens_out?: number;
  unit_cost_usd?: number;
  total_cost_usd: number;
}

export async function recordCostEvent(
  supabase: SupabaseClient,
  input: RecordCostInput
): Promise<ChatCostEvent> {
  const { data, error } = await supabase
    .from("chat_cost_events")
    .insert(input)
    .select()
    .single();
  if (error || !data) {
    throw new ChatError(
      `Failed to record cost event: ${error?.message ?? "no row returned"}`,
      500,
      "internal_error"
    );
  }
  return data as ChatCostEvent;
}

export async function sumCostsSince(
  supabase: SupabaseClient,
  sinceIso: string
): Promise<number> {
  const { data, error } = await supabase
    .from("chat_cost_events")
    .select("total_cost_usd")
    .gte("created_at", sinceIso);
  if (error) {
    throw new ChatError(
      `Failed to sum costs: ${error.message}`,
      500,
      "internal_error"
    );
  }
  return (data ?? []).reduce(
    (sum, row) => sum + Number((row as { total_cost_usd: number | string }).total_cost_usd),
    0
  );
}
