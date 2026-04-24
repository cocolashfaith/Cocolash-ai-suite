-- Add column to store real SRT captions generated from ElevenLabs
-- word-level timestamps. This ensures captions match the actual speech.
ALTER TABLE generated_videos
  ADD COLUMN IF NOT EXISTS caption_srt TEXT DEFAULT NULL;
