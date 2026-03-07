-- =============================================
-- Upgrade 1 — System 1: AI Caption & Publishing Engine
-- Migration: Create tables for captions, hashtags, publishing, social accounts, and settings
-- Date: 2026-03-07
-- =============================================

-- 1. Hashtag database (300+ curated tags)
CREATE TABLE IF NOT EXISTS hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL,
  sub_category VARCHAR(50),
  platform VARCHAR(20)[],
  popularity_score INTEGER DEFAULT 50,
  is_branded BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Captions linked to generated images
CREATE TABLE IF NOT EXISTS captions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID REFERENCES generated_images(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL,
  caption_text TEXT NOT NULL,
  caption_style VARCHAR(30) NOT NULL,
  hashtags TEXT[],
  character_count INTEGER,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  is_selected BOOLEAN DEFAULT FALSE
);

-- 3. Scheduled/published posts
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID REFERENCES generated_images(id) ON DELETE CASCADE,
  caption_id UUID REFERENCES captions(id),
  platform VARCHAR(20) NOT NULL,
  blotato_post_id VARCHAR(100),
  blotato_account_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'draft',
  scheduled_time TIMESTAMPTZ,
  published_time TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Blotato connected social accounts cache
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blotato_account_id VARCHAR(100) NOT NULL UNIQUE,
  platform VARCHAR(20) NOT NULL,
  account_name VARCHAR(100),
  account_handle VARCHAR(100),
  profile_image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Caption generation settings (brand voice, preferences)
CREATE TABLE IF NOT EXISTS caption_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_voice_prompt TEXT,
  default_style VARCHAR(30) DEFAULT 'casual',
  always_include_hashtags TEXT[],
  never_include_hashtags TEXT[],
  default_cta TEXT,
  blotato_api_key TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hashtags_category ON hashtags(category);
CREATE INDEX IF NOT EXISTS idx_hashtags_platform ON hashtags USING GIN(platform);
CREATE INDEX IF NOT EXISTS idx_captions_image_id ON captions(image_id);
CREATE INDEX IF NOT EXISTS idx_captions_platform ON captions(platform);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_image ON scheduled_posts(image_id);
