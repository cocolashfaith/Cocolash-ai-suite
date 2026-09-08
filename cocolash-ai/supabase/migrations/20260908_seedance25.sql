-- =====================================================================
--  Seedance 2.5 upgrade — schema additions                 2026-09-08
-- =====================================================================
--
--  HOW TO APPLY (Harry):
--    Supabase Dashboard → SQL Editor → "New query" → paste this ENTIRE
--    file → Run.  It is IDEMPOTENT — safe to run again if unsure.
--
--  WHEN:
--    Before pushing `main` with the 2.5 code. Until this runs, the app
--    returns HTTP 503 { code: "migration_required" } for any Seedance 2.5
--    job (and for PATCH /api/settings/video). Seedance 2.0 and HeyGen keep
--    working either way — nothing here changes existing behaviour.
--
--  WHAT:
--    1. generated_videos  — per-job engine / mode / tier / inputs / cost
--    2. video_settings    — single-row global defaults + editable credit rates
--    3. storage.buckets   — re-asserts the `video-inputs` bucket (no-op if present)
--
--  ROLLBACK (only if something is badly wrong — the columns are nullable and
--  harmless): see the commented block at the bottom.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- 1. generated_videos — Seedance 2.5 job metadata
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE generated_videos
  ADD COLUMN IF NOT EXISTS engine             TEXT NOT NULL DEFAULT '2.0',
  ADD COLUMN IF NOT EXISTS seedance_mode      TEXT,
  ADD COLUMN IF NOT EXISTS quality_tier       TEXT,
  ADD COLUMN IF NOT EXISTS resolution         TEXT,
  ADD COLUMN IF NOT EXISTS requested_duration INTEGER,
  ADD COLUMN IF NOT EXISTS input_urls         JSONB,
  ADD COLUMN IF NOT EXISTS request_payload    JSONB,
  ADD COLUMN IF NOT EXISTS credits_cost       NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS error_message      TEXT,
  ADD COLUMN IF NOT EXISTS rerender_of        UUID REFERENCES generated_videos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS output_format      TEXT,
  ADD COLUMN IF NOT EXISTS bitrate_mode       TEXT,
  ADD COLUMN IF NOT EXISTS is_uncensored      BOOLEAN,
  ADD COLUMN IF NOT EXISTS pass_faces         BOOLEAN;

COMMENT ON COLUMN generated_videos.engine IS
  'Seedance engine that produced the row: ''2.0'' | ''2.5''. Meaningful only when pipeline = ''seedance'' (HeyGen rows carry the default).';
COMMENT ON COLUMN generated_videos.seedance_mode IS
  'Enhancor mode: ugc | text_to_video | multi_reference | first_n_last_frames | multi_frame | edit | extend | lipsyncing | voice_clone.';
COMMENT ON COLUMN generated_videos.quality_tier IS
  'Faith''s tier: draft-480p | draft-720p | final-1080p.';
COMMENT ON COLUMN generated_videos.resolution IS
  'Output resolution requested: 480p | 720p | 1080p.';
COMMENT ON COLUMN generated_videos.requested_duration IS
  'Requested clip seconds; -1 = Auto (Seedance 2.5).';
COMMENT ON COLUMN generated_videos.input_urls IS
  'Every media URL sent to Enhancor: {products,influencers,images,videos,audios,first_frame_image,last_frame_image,lipsyncing_audio}.';
COMMENT ON COLUMN generated_videos.request_payload IS
  'Exact Enhancor /queue body MINUS webhook_url (never store the token). Used by "Re-render as Final".';
COMMENT ON COLUMN generated_videos.credits_cost IS
  'Actual Enhancor credits from the 2.5 webhook/status `cost` (1 credit = video_settings.usd_per_credit). NULL for 2.0.';
COMMENT ON COLUMN generated_videos.error_message IS
  'Provider / validation error text for failed rows.';
COMMENT ON COLUMN generated_videos.rerender_of IS
  'Source generated_videos.id when this row is a "Re-render as Final" of a draft.';

-- Value guards (added once; ADD CONSTRAINT has no IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_videos_engine_check'
  ) THEN
    ALTER TABLE generated_videos
      ADD CONSTRAINT generated_videos_engine_check
      CHECK (engine IN ('2.0', '2.5'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_videos_quality_tier_check'
  ) THEN
    ALTER TABLE generated_videos
      ADD CONSTRAINT generated_videos_quality_tier_check
      CHECK (quality_tier IS NULL OR quality_tier IN ('draft-480p', 'draft-720p', 'final-1080p'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_videos_requested_duration_check'
  ) THEN
    ALTER TABLE generated_videos
      ADD CONSTRAINT generated_videos_requested_duration_check
      CHECK (requested_duration IS NULL OR requested_duration = -1 OR requested_duration BETWEEN 1 AND 30);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_generated_videos_engine
  ON generated_videos (engine);
CREATE INDEX IF NOT EXISTS idx_generated_videos_rerender_of
  ON generated_videos (rerender_of);


-- ─────────────────────────────────────────────────────────────────────
-- 2. video_settings — ONE global row (defaults + editable pricing)
--    Mirrors chat_settings: is_singleton UNIQUE prevents a second row.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS video_settings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  default_engine       TEXT NOT NULL DEFAULT '2.5'
                         CHECK (default_engine IN ('2.0', '2.5')),
  default_quality_tier TEXT NOT NULL DEFAULT 'draft-720p'
                         CHECK (default_quality_tier IN ('draft-480p', 'draft-720p', 'final-1080p')),
  default_duration     INTEGER NOT NULL DEFAULT 8
                         CHECK (default_duration = -1 OR default_duration BETWEEN 4 AND 30),
  default_aspect_ratio TEXT NOT NULL DEFAULT '9:16'
                         CHECK (default_aspect_ratio IN ('21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive')),
  -- 1 credit = $0.001 (Enhancor top-up: $25 = 25,000 credits)
  usd_per_credit       NUMERIC(10,6) NOT NULL DEFAULT 0.001
                         CHECK (usd_per_credit > 0),
  -- Seedance 2.5 credits-per-second tables (standard = no video inputs,
  -- reduced = with video inputs). Seeded from lib/seedance/pricing.ts.
  rates                JSONB NOT NULL DEFAULT $json$
    {
      "standard": {
        "480p":  { "standard": 122.2, "uncensored": 123.422 },
        "720p":  { "standard": 269.3, "uncensored": 271.993 },
        "1080p": { "standard": 487.3, "uncensored": 492.173 }
      },
      "reduced": {
        "480p":  { "standard": 72.9,  "uncensored": 73.629 },
        "720p":  { "standard": 165.5, "uncensored": 167.155 },
        "1080p": { "standard": 292.8, "uncensored": 295.728 }
      }
    }
  $json$::jsonb,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- TEXT (not a FK): the shared access-password admin has no auth.users row.
  updated_by           TEXT,
  is_singleton         BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT video_settings_singleton_unique UNIQUE (is_singleton)
);

COMMENT ON TABLE video_settings IS
  'Single-row global defaults for the video wizard (engine, tier, duration, aspect) + Seedance 2.5 credit pricing. Edited under Settings by admins.';

-- Seed the singleton (fixed id …0002; chat_settings uses …0001). No-op if present.
INSERT INTO video_settings (id)
VALUES ('00000000-0000-0000-0000-000000000002')
ON CONFLICT (is_singleton) DO NOTHING;

ALTER TABLE video_settings ENABLE ROW LEVEL SECURITY;

-- Signed-in users may read (the wizard needs the defaults); writes happen only
-- through the service role in PATCH /api/settings/video (admin-guarded).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'video_settings'
      AND policyname = 'video_settings_read_authenticated'
  ) THEN
    CREATE POLICY video_settings_read_authenticated
      ON video_settings FOR SELECT TO authenticated USING (true);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- 3. storage bucket `video-inputs` (audio + video + image inputs, 50 MB)
--    Already created 2026-09-08 via the service-role API — this is a no-op
--    when the bucket exists and a safety net for a fresh project.
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-inputs',
  'video-inputs',
  TRUE,
  52428800,
  ARRAY[
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
    'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/ogg',
    'audio/webm', 'audio/flac',
    'image/png', 'image/jpeg', 'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual, only if needed) — copy into a new query:
--
-- DROP POLICY IF EXISTS video_settings_read_authenticated ON video_settings;
-- DROP TABLE IF EXISTS video_settings;
-- ALTER TABLE generated_videos
--   DROP CONSTRAINT IF EXISTS generated_videos_engine_check,
--   DROP CONSTRAINT IF EXISTS generated_videos_quality_tier_check,
--   DROP CONSTRAINT IF EXISTS generated_videos_requested_duration_check,
--   DROP COLUMN IF EXISTS engine, DROP COLUMN IF EXISTS seedance_mode,
--   DROP COLUMN IF EXISTS quality_tier, DROP COLUMN IF EXISTS resolution,
--   DROP COLUMN IF EXISTS requested_duration, DROP COLUMN IF EXISTS input_urls,
--   DROP COLUMN IF EXISTS request_payload, DROP COLUMN IF EXISTS credits_cost,
--   DROP COLUMN IF EXISTS error_message, DROP COLUMN IF EXISTS rerender_of,
--   DROP COLUMN IF EXISTS output_format, DROP COLUMN IF EXISTS bitrate_mode,
--   DROP COLUMN IF EXISTS is_uncensored, DROP COLUMN IF EXISTS pass_faces;
-- (The storage bucket is left in place on purpose — it may hold uploads.)
-- ─────────────────────────────────────────────────────────────────────
