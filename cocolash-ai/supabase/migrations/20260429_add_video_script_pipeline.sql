-- Separate saved scripts by video pipeline so HeyGen and Seedance libraries do not mix.

ALTER TABLE video_scripts
  ADD COLUMN IF NOT EXISTS pipeline TEXT NOT NULL DEFAULT 'heygen';

UPDATE video_scripts AS scripts
SET pipeline = 'seedance'
WHERE pipeline <> 'seedance'
  AND (
    scripts.title ILIKE 'Seedance —%'
    OR scripts.title ILIKE 'Seedance -%'
    OR EXISTS (
      SELECT 1
      FROM generated_videos AS videos
      WHERE videos.script_id = scripts.id
        AND videos.pipeline = 'seedance'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'video_scripts_pipeline_check'
  ) THEN
    ALTER TABLE video_scripts
      ADD CONSTRAINT video_scripts_pipeline_check
      CHECK (pipeline IN ('heygen', 'seedance'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_video_scripts_pipeline_created
  ON video_scripts(pipeline, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_scripts_pipeline_campaign
  ON video_scripts(pipeline, campaign_type, created_at DESC);
