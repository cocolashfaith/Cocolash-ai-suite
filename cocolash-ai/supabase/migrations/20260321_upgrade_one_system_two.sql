-- =============================================
-- Upgrade 1 — System 2: AI UGC Video Creator
-- Migration: Create tables for video scripts, generated videos, voice options, and background music
-- Date: 2026-03-21
-- =============================================

-- 1. Video scripts (AI-generated UGC scripts)
CREATE TABLE IF NOT EXISTS video_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200),
  campaign_type VARCHAR(30) NOT NULL,
  tone VARCHAR(30) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  script_text TEXT NOT NULL,
  hook_text TEXT,
  cta_text TEXT,
  is_template BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Generated videos (full video pipeline records)
CREATE TABLE IF NOT EXISTS generated_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES video_scripts(id),
  person_image_id UUID REFERENCES generated_images(id),
  person_image_url TEXT,
  product_image_url TEXT NOT NULL,
  composed_image_url TEXT,
  avatar_image_url TEXT,
  heygen_video_id VARCHAR(100),
  heygen_status VARCHAR(30),
  raw_video_url TEXT,
  final_video_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  aspect_ratio VARCHAR(10),
  has_captions BOOLEAN DEFAULT FALSE,
  has_watermark BOOLEAN DEFAULT FALSE,
  has_background_music BOOLEAN DEFAULT FALSE,
  voice_id VARCHAR(50),
  background_type VARCHAR(30),
  background_value TEXT,
  processing_cost DECIMAL(10,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 3. Voice options (cached from HeyGen API)
CREATE TABLE IF NOT EXISTS voice_options (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100),
  gender VARCHAR(20),
  accent VARCHAR(50),
  tone VARCHAR(50),
  preview_url TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

-- 4. Background music library
CREATE TABLE IF NOT EXISTS background_music (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100),
  category VARCHAR(50),
  duration_seconds INTEGER,
  file_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_generated_videos_status ON generated_videos(heygen_status);
CREATE INDEX IF NOT EXISTS idx_generated_videos_created ON generated_videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_videos_script ON generated_videos(script_id);
CREATE INDEX IF NOT EXISTS idx_video_scripts_campaign ON video_scripts(campaign_type);
CREATE INDEX IF NOT EXISTS idx_video_scripts_created ON video_scripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_background_music_category ON background_music(category);
