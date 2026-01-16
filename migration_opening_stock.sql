-- Run this in your Supabase SQL Editor to enable Manual Opening Balance

ALTER TABLE farm_records 
ADD COLUMN IF NOT EXISTS opening_stock numeric DEFAULT NULL;

-- Note: We use NULL as default to indicate "Automatic Calculation".
-- If a value is set here, it overrides the calculation.
