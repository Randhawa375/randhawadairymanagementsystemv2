-- ==========================================
-- 1. Ensure 'opening_balance' column exists
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'opening_balance') THEN
        ALTER TABLE contacts ADD COLUMN opening_balance numeric default 0;
    END IF;
END $$;

-- ==========================================
-- 2. Clean up Duplicates in milk_records
-- ==========================================
-- Identifies duplicates by (contact_id, date) and keeps the one with the latest creation time.
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY contact_id, date
      ORDER BY created_at DESC, id DESC
    ) as row_num
  FROM
    milk_records
)
DELETE FROM milk_records
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);

-- ==========================================
-- 3. Apply Unique Constraint to prevent recurrence
-- ==========================================
-- This ensures that the database will reject any future attempt to insert a duplicate.
ALTER TABLE milk_records
ADD CONSTRAINT unique_milk_record_daily UNIQUE (contact_id, date);
