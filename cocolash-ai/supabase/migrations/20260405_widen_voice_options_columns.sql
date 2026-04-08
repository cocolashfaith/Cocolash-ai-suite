-- Widen voice_options columns to accommodate longer HeyGen voice IDs and language names
ALTER TABLE voice_options ALTER COLUMN id TYPE VARCHAR(255);
ALTER TABLE voice_options ALTER COLUMN name TYPE VARCHAR(255);
ALTER TABLE voice_options ALTER COLUMN accent TYPE VARCHAR(100);
