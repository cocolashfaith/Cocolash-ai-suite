-- Add script_text_cache to generated_videos so post-processing always has
-- access to the script text without a join to video_scripts.
ALTER TABLE generated_videos ADD COLUMN IF NOT EXISTS script_text_cache TEXT;
