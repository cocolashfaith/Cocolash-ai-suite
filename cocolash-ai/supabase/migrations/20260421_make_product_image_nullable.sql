-- =============================================
-- Make product_image_url nullable
-- Educational / brand-content videos have no product image.
-- Date: 2026-04-21
-- =============================================

ALTER TABLE generated_videos
  ALTER COLUMN product_image_url DROP NOT NULL;
