-- =============================================
-- Milestone v3.0 — Phase 2 — Vector match RPC
-- Date: 2026-05-02
-- =============================================
-- Postgres function consumed by lib/chat/retrieve.ts to perform a cosine
-- distance search on knowledge_chunks. Defined as SECURITY DEFINER + STABLE
-- so it can be called via the service-role client.
-- =============================================

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 6
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id TEXT,
  tier SMALLINT,
  title TEXT,
  content TEXT,
  metadata JSONB,
  content_hash TEXT,
  embedding_model TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  distance FLOAT
)
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT
    kc.id,
    kc.source_type,
    kc.source_id,
    kc.tier,
    kc.title,
    kc.content,
    kc.metadata,
    kc.content_hash,
    kc.embedding_model,
    kc.created_at,
    kc.updated_at,
    (kc.embedding <=> query_embedding)::FLOAT AS distance
  FROM knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION match_knowledge_chunks IS
  'Cosine-distance vector search over knowledge_chunks. Used by lib/chat/retrieve.ts.';

-- Allow the API layer to call this. Service role is allowed implicitly;
-- chat admins should also be able to call it for the Phase 7 admin "test
-- query" feature.
GRANT EXECUTE ON FUNCTION match_knowledge_chunks TO authenticated;
