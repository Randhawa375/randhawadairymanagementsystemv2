-- Add image_url column to milk_records table
ALTER TABLE public.milk_records 
ADD COLUMN IF NOT EXISTS image_url text;

-- Verify the column was added (optional, but good for confirmation if running manually)
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'milk_records' AND column_name = 'image_url';
