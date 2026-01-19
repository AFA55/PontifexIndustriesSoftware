-- ============================================================================
-- STORAGE BUCKET POLICIES FOR job-documents
-- ============================================================================
-- Run these in: Supabase Dashboard → Storage → job-documents → Policies
-- Click "New Policy" and paste each one individually
-- ============================================================================

-- POLICY 1: Allow Authenticated Upload
-- ============================================================================
CREATE POLICY "Allow authenticated users to upload PDFs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-documents' AND
  auth.role() = 'authenticated'
);

-- ============================================================================
-- POLICY 2: Allow Authenticated Read
-- ============================================================================
CREATE POLICY "Allow authenticated users to read PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'job-documents'
);

-- ============================================================================
-- POLICY 3: Allow Authenticated Delete
-- ============================================================================
CREATE POLICY "Allow authenticated users to delete PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-documents'
);

-- ============================================================================
-- POLICY 4 (OPTIONAL): Allow Authenticated Update
-- ============================================================================
CREATE POLICY "Allow authenticated users to update PDFs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'job-documents'
);

-- ============================================================================
-- DONE! Your storage bucket is now properly secured
-- ============================================================================
