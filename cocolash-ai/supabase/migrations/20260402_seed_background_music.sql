-- =============================================
-- Seed background_music table with royalty-free tracks
-- Date: 2026-04-02
--
-- Tracks are categorised into 4 groups:
--   • upbeat      — high-energy, social-ready
--   • calm        — luxurious, spa-like
--   • inspirational — motivational, empowering
--   • trendy      — modern, lo-fi / electronic
--
-- file_url values point to Supabase Storage
-- (brand-assets/music/). Upload the actual .mp3
-- files separately via the Supabase dashboard or CLI.
-- =============================================

INSERT INTO background_music (name, category, duration_seconds, file_url, is_active) VALUES
-- Upbeat / Energetic
('Glow Up',           'upbeat', 30, 'brand-assets/music/glow-up.mp3',           true),
('Main Character',    'upbeat', 30, 'brand-assets/music/main-character.mp3',    true),
('That Girl Energy',  'upbeat', 30, 'brand-assets/music/that-girl-energy.mp3',  true),
('Boss Babe',         'upbeat', 15, 'brand-assets/music/boss-babe.mp3',         true),

-- Calm / Luxurious
('Golden Hour',       'calm',   30, 'brand-assets/music/golden-hour.mp3',       true),
('Soft Glow',         'calm',   30, 'brand-assets/music/soft-glow.mp3',         true),
('Velvet Touch',      'calm',   60, 'brand-assets/music/velvet-touch.mp3',      true),

-- Inspirational
('Level Up',          'inspirational', 30, 'brand-assets/music/level-up.mp3',        true),
('New Era',           'inspirational', 30, 'brand-assets/music/new-era.mp3',         true),
('Rise & Shine',      'inspirational', 60, 'brand-assets/music/rise-and-shine.mp3',  true),

-- Trendy / Modern
('Late Night Vibe',   'trendy', 30, 'brand-assets/music/late-night-vibe.mp3',   true),
('Digital Dreams',    'trendy', 30, 'brand-assets/music/digital-dreams.mp3',    true);
