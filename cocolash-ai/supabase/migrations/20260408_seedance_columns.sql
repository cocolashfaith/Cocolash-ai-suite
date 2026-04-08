-- Milestone 3: Seedance 2.0 UGC Video Pipeline
-- Add pipeline discrimination columns to generated_videos table

ALTER TABLE generated_videos
  ADD COLUMN IF NOT EXISTS pipeline TEXT DEFAULT 'heygen',
  ADD COLUMN IF NOT EXISTS seedance_task_id TEXT,
  ADD COLUMN IF NOT EXISTS seedance_prompt TEXT,
  ADD COLUMN IF NOT EXISTS audio_mode TEXT,
  ADD COLUMN IF NOT EXISTS audio_url TEXT;

CREATE INDEX IF NOT EXISTS idx_generated_videos_pipeline ON generated_videos(pipeline);
CREATE INDEX IF NOT EXISTS idx_generated_videos_seedance_task ON generated_videos(seedance_task_id);
