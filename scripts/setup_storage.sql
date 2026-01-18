-- 1. Add image_url to milk_records
ALTER TABLE IF EXISTS milk_records 
ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Create Storage Bucket 'receipts'
-- Note: Creating buckets via SQL often requires specific permissions or extensions.
-- If this fails, the user must create it manually in the dashboard.
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage Policies
-- Allow public access to view
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'receipts' );

-- Allow authenticated users to upload
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'receipts' AND auth.role() = 'authenticated' );

-- Allow users to update their own files (optional)
CREATE POLICY "Owner Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'receipts' AND auth.uid() = owner );

-- Allow users to delete their own files
CREATE POLICY "Owner Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'receipts' AND auth.uid() = owner );
