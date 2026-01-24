-- Add 'images' column as a text array
ALTER TABLE milk_records ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';

-- Migrate existing 'image_url' to 'images' array
UPDATE milk_records
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL AND (images IS NULL OR images = '{}');

-- (Optional) We keep image_url for now to avoid breaking running clients, 
-- but future code should read/write to 'images'.

-- Add 'images' column to farm_records as well? 
ALTER TABLE farm_records ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';

UPDATE farm_records
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL AND (images IS NULL OR images = '{}');
