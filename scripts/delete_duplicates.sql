-- Milk Records Deduplication
-- Identifier: (contact_id, date)
-- Strategy: Keep the one with the LATEST created_at
DELETE FROM milk_records
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY contact_id, date
      ORDER BY created_at DESC
    ) as row_num
    FROM milk_records
  ) t WHERE t.row_num = 1
);

-- Farm Records Deduplication
-- Identifier: (date)
-- Strategy: Keep the one with the LATEST created_at
DELETE FROM farm_records
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY date
      ORDER BY created_at DESC
    ) as row_num
    FROM farm_records
  ) t WHERE t.row_num = 1
);

-- Payments Deduplication
-- Identifier: (contact_id, date, amount) - strict duplication check
-- Strategy: Keep the one with the LATEST created_at
DELETE FROM payments
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY contact_id, date, amount, description
      ORDER BY created_at DESC
    ) as row_num
    FROM payments
  ) t WHERE t.row_num = 1
);
