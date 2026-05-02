-- =============================================
-- Milestone v3.0 — System 3: AI Sales Assistant + Virtual Try-On
-- Phase 1 — Foundation: schema, RAG corpus table, RLS, pgvector
-- Date: 2026-05-02
-- =============================================
-- Refs: PROJECT.md, REQUIREMENTS.md (CHAT-03, RAG-01, RAG-02, RAG-04, OPS-03, OPS-06)
-- Refs: .planning/phases/01-foundation/01-CONTEXT.md (D-01..D-09, D-21..D-24)

-- ── 0. Extension: pgvector for embeddings ────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================
-- 1. Visitor session (anonymous OR Shopify-customer-linked)
-- =============================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id TEXT,
  shop_domain TEXT,
  consent JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { cookie: bool, selfie: bool }
  intent_summary TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_sessions_last_active_idx
  ON chat_sessions (last_active_at DESC);

CREATE INDEX IF NOT EXISTS chat_sessions_shopify_customer_idx
  ON chat_sessions (shopify_customer_id)
  WHERE shopify_customer_id IS NOT NULL;

COMMENT ON TABLE chat_sessions IS
  'One row per visitor chat session. shopify_customer_id is set when the App Proxy provides a logged-in customer (Phase 8); null for anonymous visitors.';

-- =============================================
-- 2. Append-only message log
-- =============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  intent TEXT,                          -- populated by Phase 2 intent classifier
  retrieved_chunk_ids UUID[],           -- Phase 2: chunks used to ground the response
  product_card_ids TEXT[],              -- Phase 4: Shopify product handles surfaced inline
  tryon_image_url TEXT,                 -- Phase 6: try-on result attached to this turn
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_idx
  ON chat_messages (session_id, created_at);

CREATE INDEX IF NOT EXISTS chat_messages_intent_idx
  ON chat_messages (intent)
  WHERE intent IS NOT NULL;

COMMENT ON TABLE chat_messages IS
  'Append-only conversation log. Intent and retrieved_chunk_ids populated by Phase 2; product/tryon fields by Phases 4 and 6.';

-- =============================================
-- 3. RAG corpus: knowledge_chunks (with vector embedding)
-- =============================================
-- tier ordering (higher authority = lower number):
--   1 = faq_kb (Faith's curated KB) + voice_doc
--   2 = product_csv + product_md + admin_upload
--   3 = storefront_api (live Shopify data, refreshed nightly in Phase 4)
--   4 = generic (Claude fallback, not stored as a chunk; constant)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'faq_kb', 'product_md', 'product_csv', 'voice_doc',
    'storefront_api', 'admin_upload'
  )),
  source_id TEXT NOT NULL,              -- e.g. 'faq:application-care:how-do-i-apply', 'product:dahlia'
  tier SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 3),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT NOT NULL,           -- sha256 of content; used for incremental re-embed
  embedding vector(1536),               -- OpenAI text-embedding-3-small (D-18)
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_type, source_id)
);

-- HNSW vector index for cosine similarity search (D-19)
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw_idx
  ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS knowledge_chunks_tier_idx
  ON knowledge_chunks (tier);

CREATE INDEX IF NOT EXISTS knowledge_chunks_source_type_idx
  ON knowledge_chunks (source_type);

CREATE INDEX IF NOT EXISTS knowledge_chunks_content_hash_idx
  ON knowledge_chunks (content_hash);

COMMENT ON TABLE knowledge_chunks IS
  'RAG corpus. tier enforces authority: 1=FAQ KB / voice_doc, 2=product_csv/md/admin_upload, 3=Storefront API. Higher tier wins on conflict; ties broken by similarity.';

-- =============================================
-- 4. Lead captures (email + intent context)
-- =============================================
CREATE TABLE IF NOT EXISTS lead_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (email ~* '^.+@.+\..+$'),
  consent BOOLEAN NOT NULL DEFAULT FALSE,
  intent_at_capture TEXT,
  discount_offered TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_captures_email_idx
  ON lead_captures (email);

CREATE INDEX IF NOT EXISTS lead_captures_created_idx
  ON lead_captures (created_at DESC);

COMMENT ON TABLE lead_captures IS
  'Captured visitor emails. Phase 5 writes; Phase 7 admin reads + exports.';

-- =============================================
-- 5. Discount rules (admin-configurable, seeded from CSV in Phase 5)
-- =============================================
CREATE TABLE IF NOT EXISTS discount_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  value NUMERIC(10, 4) NOT NULL,            -- absolute or percent depending on value_type
  value_type TEXT NOT NULL CHECK (value_type IN ('percentage', 'fixed_amount')),
  discount_class TEXT NOT NULL CHECK (discount_class IN ('order', 'product', 'shipping')),
  combinability JSONB NOT NULL DEFAULT '{}'::jsonb,  -- mirrors CSV "Combines with *" cols
  customer_selection TEXT NOT NULL DEFAULT 'all',
  intent_triggers TEXT[],                    -- e.g. ['lead_capture', 'product:volume']
  product_line_scope TEXT[],                 -- e.g. ['volume-lashes']
  campaign_window TSTZRANGE,                 -- start/end window
  applies_once_per_customer BOOLEAN,
  usage_limit_per_code INTEGER,
  times_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS discount_rules_status_idx
  ON discount_rules (status);

CREATE INDEX IF NOT EXISTS discount_rules_campaign_window_idx
  ON discount_rules USING gist (campaign_window);

COMMENT ON TABLE discount_rules IS
  'Phase 5 ingest from discounts_export.csv populates initial rows. Phase 7 admin manages.';

-- =============================================
-- 6. Chat admins (Faith + named team members)
-- =============================================
CREATE TABLE IF NOT EXISTS chat_admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'team' CHECK (role IN ('owner', 'team')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE chat_admin_users IS
  'Membership table for /chatbot/admin access. Phase 1 creates; Phase 7 seeds Faith + her team.';

-- =============================================
-- 7. Chat settings (single-row config)
-- =============================================
CREATE TABLE IF NOT EXISTS chat_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  daily_cap_usd NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
  voice_fragments JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_top_k SMALLINT NOT NULL DEFAULT 6,
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  system_prompt_version TEXT NOT NULL DEFAULT 'v1.0.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  -- Single-row enforcement: only one settings row ever exists.
  is_singleton BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chat_settings_singleton_unique UNIQUE (is_singleton)
);

COMMENT ON TABLE chat_settings IS
  'Single-row config for the chatbot. is_singleton=TRUE + UNIQUE constraint prevents accidental multi-row.';

-- Seed the singleton row with Phase 1 voice fragments. Faith can edit later via Phase 7 admin UI.
INSERT INTO chat_settings (
  id, bot_enabled, daily_cap_usd, voice_fragments, default_top_k,
  embedding_model, system_prompt_version, is_singleton
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  TRUE,
  50.00,
  jsonb_build_object(
    'persona_name', 'Coco',
    'greeting', 'Hey gorgeous! I''m Coco — what can I help you find today?',
    'recommend_intro', 'Tell me a little about your look — natural and everyday, or bold for a moment? And are you new to lash extensions or a regular?',
    'escalation', 'Let me get this to Faith''s team — they''ll reach out at the email you give me. What''s the best one to use?',
    'after_hours_suffix', 'They''re online Mon–Fri, 9 AM–5 PM EST and aim to reply within 24h.',
    'lead_capture', 'If you''re not ready to commit, no pressure — drop your email and I''ll send a little something to make your first set easier on the wallet.',
    'tryon_offer', 'Want to see {product} on you? I can put it on a quick selfie if you''d like.',
    'dont_know', 'I want to get this right. Let me check with the team — what email should I send the answer to?'
  ),
  6,
  'text-embedding-3-small',
  'v1.0.0',
  TRUE
)
ON CONFLICT (is_singleton) DO NOTHING;

-- =============================================
-- 8. Selfie uploads metadata (24h TTL — Phase 6 uses; Phase 1 only creates table + cron stub)
-- =============================================
CREATE TABLE IF NOT EXISTS selfie_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  consent_given_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS selfie_uploads_expires_at_idx
  ON selfie_uploads (expires_at)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE selfie_uploads IS
  'Tracks selfie storage objects with expiry. A Phase 6 cron will delete storage objects + flip deleted_at when expires_at < NOW().';

-- =============================================
-- 9. Cost events (per-pipeline spend; Phase 9 reads via lib/chat/preflight.ts)
-- =============================================
CREATE TABLE IF NOT EXISTS chat_cost_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  pipeline TEXT NOT NULL CHECK (pipeline IN ('chat_completion', 'embedding', 'tryon_compose', 'intent_classify')),
  model TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  unit_cost_usd NUMERIC(12, 8),
  total_cost_usd NUMERIC(12, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_cost_events_created_pipeline_idx
  ON chat_cost_events (created_at DESC, pipeline);

COMMENT ON TABLE chat_cost_events IS
  'One row per paid API call. Phase 9 sums the day to enforce the daily kill-switch.';

-- =============================================
-- RLS Policies — enabled from day one (OPS-03)
-- =============================================
-- Strategy:
--   * Service role bypasses RLS implicitly (used by API routes that have already
--     validated the session_id in code) — see lib/supabase/server.ts:createAdminClient.
--   * Anon role gets NO direct access to any of these tables. Visitors hit them
--     through the API route, never the client SDK.
--   * Authenticated users (Faith + team) get access only if they're in chat_admin_users.

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE selfie_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_cost_events ENABLE ROW LEVEL SECURITY;

-- Helper: is the calling auth user an admin?
CREATE OR REPLACE FUNCTION is_chat_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_admin_users
    WHERE auth_user_id = auth.uid()
  );
$$;

-- Anon role: explicitly NO access. (Default-deny since RLS is enabled and no policy grants.)
-- Authenticated chat admins: full read on operational tables, write on management tables.

CREATE POLICY chat_admin_read_sessions
  ON chat_sessions FOR SELECT
  TO authenticated
  USING (is_chat_admin());

CREATE POLICY chat_admin_read_messages
  ON chat_messages FOR SELECT
  TO authenticated
  USING (is_chat_admin());

CREATE POLICY chat_admin_read_leads
  ON lead_captures FOR SELECT
  TO authenticated
  USING (is_chat_admin());

CREATE POLICY chat_admin_manage_discounts
  ON discount_rules FOR ALL
  TO authenticated
  USING (is_chat_admin())
  WITH CHECK (is_chat_admin());

CREATE POLICY chat_admin_manage_settings
  ON chat_settings FOR ALL
  TO authenticated
  USING (is_chat_admin())
  WITH CHECK (is_chat_admin());

CREATE POLICY chat_admin_manage_admins
  ON chat_admin_users FOR ALL
  TO authenticated
  USING (is_chat_admin())
  WITH CHECK (is_chat_admin());

CREATE POLICY chat_admin_manage_kb
  ON knowledge_chunks FOR ALL
  TO authenticated
  USING (is_chat_admin())
  WITH CHECK (is_chat_admin());

CREATE POLICY chat_admin_read_costs
  ON chat_cost_events FOR SELECT
  TO authenticated
  USING (is_chat_admin());

CREATE POLICY chat_admin_read_selfies
  ON selfie_uploads FOR SELECT
  TO authenticated
  USING (is_chat_admin());

-- =============================================
-- Updated_at triggers
-- =============================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_chunks_updated_at ON knowledge_chunks;
CREATE TRIGGER knowledge_chunks_updated_at
  BEFORE UPDATE ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS discount_rules_updated_at ON discount_rules;
CREATE TRIGGER discount_rules_updated_at
  BEFORE UPDATE ON discount_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS chat_settings_updated_at ON chat_settings;
CREATE TRIGGER chat_settings_updated_at
  BEFORE UPDATE ON chat_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- Done. Subsequent migrations will add storage bucket policies (separate
-- migration file once Supabase Storage RLS API is settled in this project)
-- and seed Faith's admin user (Phase 7).
-- =============================================
