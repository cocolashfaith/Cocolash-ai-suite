-- =============================================
-- Milestone v3.0 — Phase 1 follow-up — function hardening
-- Date: 2026-05-02
-- =============================================
-- Pins `search_path` on the 3 new functions (Supabase advisor lint
-- function_search_path_mutable) and revokes EXECUTE on the two
-- SECURITY DEFINER functions from the `anon` role (lint
-- anon_security_definer_function_executable).
--
-- Authenticated EXECUTE is preserved intentionally:
--   * is_chat_admin() — used by RLS policies as `auth.uid()` lookup.
--   * match_knowledge_chunks() — Phase 7 admin "test query" feature.
-- =============================================

CREATE OR REPLACE FUNCTION is_chat_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM chat_admin_users WHERE auth_user_id = auth.uid());
$$;

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
SET search_path = public, pg_catalog
AS $$
  SELECT
    kc.id, kc.source_type, kc.source_id, kc.tier, kc.title, kc.content,
    kc.metadata, kc.content_hash, kc.embedding_model, kc.created_at, kc.updated_at,
    (kc.embedding <=> query_embedding)::FLOAT AS distance
  FROM knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION is_chat_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION match_knowledge_chunks(vector(1536), INTEGER) FROM anon, public;
