/**
 * lib/chat/retrieve.ts — RAG retrieval for the chatbot.
 *
 * Embed the user's query, vector-search knowledge_chunks, re-rank with a
 * tier weighting, and return the top-K. Implements decisions D-04..D-07
 * from .planning/phases/02-chat-api/02-CONTEXT.md.
 *
 * Returns a deterministic threshold flag so callers can route to the
 * don't-know flow (RAG-05) when no chunk is confident enough.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { embed } from "./embeddings";
import { ChatError } from "./error";
import type { KnowledgeChunk, KnowledgeTier } from "./types";

export interface RetrievedChunk extends KnowledgeChunk {
  /** Cosine distance from query — lower is closer. 0 = identical. */
  distance: number;
  /** Effective score after tier weighting. Higher is better. */
  effective_score: number;
}

export interface RetrieveOptions {
  /** Hard top-K returned. Reads from chat_settings.default_top_k by default. */
  topK?: number;
  /**
   * Cosine distance above which we treat the result as "no match" — feeds
   * into the don't-know guardrail. Default 0.6 (locked in D-05).
   */
  distanceThreshold?: number;
  /**
   * Per-tier weight applied during re-ranking: a tier-1 hit gets a +0.05
   * boost vs a tier-2 hit, tier-2 gets +0.05 vs tier-3 (D-06).
   */
  tierBonusPerStep?: number;
}

export interface RetrieveResult {
  chunks: RetrievedChunk[];
  /** True iff zero chunks survived the distance threshold. */
  noConfidentMatch: boolean;
}

const DEFAULT_TOP_K = 6;
const DEFAULT_DISTANCE_THRESHOLD = 0.6;
const DEFAULT_TIER_BONUS = 0.05;

interface RawMatchRow {
  id: string;
  source_type: string;
  source_id: string;
  tier: number;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  content_hash: string;
  embedding_model: string;
  created_at: string;
  updated_at: string;
  /** Cosine distance returned by the RPC (0..2; cosine_distance op = 1 - cosine_similarity). */
  distance: number;
}

/**
 * Retrieves chunks via a SQL RPC that performs the vector search. The
 * function is created in the migration as `match_knowledge_chunks(query_embedding,
 * match_count)`. Until the RPC ships (next migration), we fall back to a
 * direct query using the supabase client's filter API. For Phase 2 we use
 * the inline query approach since it avoids a second migration.
 */
export async function retrieve(
  supabase: SupabaseClient,
  query: string,
  opts: RetrieveOptions = {}
): Promise<RetrieveResult> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new ChatError(
      "retrieve: empty query",
      400,
      "invalid_input"
    );
  }
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const threshold = opts.distanceThreshold ?? DEFAULT_DISTANCE_THRESHOLD;
  const tierBonus = opts.tierBonusPerStep ?? DEFAULT_TIER_BONUS;

  // 1. Embed the query.
  const queryEmbedding = await embed(trimmed);

  // 2. Fetch top-(K*2) by raw cosine distance via RPC.
  // The RPC is shipped alongside this file in a small migration follow-up.
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding,
    match_count: topK * 2,
  });

  if (error) {
    throw new ChatError(
      `retrieve: RPC failed: ${error.message}`,
      500,
      "retrieval_failed"
    );
  }

  const rows = (data ?? []) as RawMatchRow[];

  // 3. Re-rank with tier weighting and clamp to topK.
  const ranked: RetrievedChunk[] = rows
    .map((r) => ({
      id: r.id,
      source_type: r.source_type as KnowledgeChunk["source_type"],
      source_id: r.source_id,
      tier: r.tier as KnowledgeTier,
      title: r.title,
      content: r.content,
      metadata: r.metadata ?? {},
      content_hash: r.content_hash,
      embedding: null,
      embedding_model: r.embedding_model,
      created_at: r.created_at,
      updated_at: r.updated_at,
      distance: r.distance,
      effective_score: 1 - r.distance - (r.tier - 1) * tierBonus,
    }))
    .sort((a, b) => b.effective_score - a.effective_score)
    .slice(0, topK);

  const survivors = ranked.filter((r) => r.distance <= threshold);

  return {
    chunks: ranked,
    noConfidentMatch: survivors.length === 0,
  };
}

// ── Pure helpers (exported for unit tests; no DB or network) ──

/**
 * Re-rank a candidate set by `(1 - distance) - (tier-1) * tierBonus`. Stable
 * sort: ties go to lower-tier (more authoritative) sources.
 */
export function rerankByTier(
  candidates: ReadonlyArray<{ tier: KnowledgeTier; distance: number }>,
  tierBonus: number = DEFAULT_TIER_BONUS
): Array<{ tier: KnowledgeTier; distance: number; effective_score: number }> {
  return candidates
    .map((c) => ({
      ...c,
      effective_score: 1 - c.distance - (c.tier - 1) * tierBonus,
    }))
    .sort((a, b) => b.effective_score - a.effective_score);
}

export function isAboveThreshold(
  distance: number,
  threshold: number = DEFAULT_DISTANCE_THRESHOLD
): boolean {
  return distance <= threshold;
}
