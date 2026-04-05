-- Storage buckets for file uploads
-- jobsite area photos, scope photos, compliance docs, job photos

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('jobsite-area-docs', 'jobsite-area-docs', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']),
  ('scope-photos', 'scope-photos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']),
  ('site-compliance-docs', 'site-compliance-docs', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']),
  ('job-photos', 'job-photos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage objects
-- jobsite-area-docs
CREATE POLICY IF NOT EXISTS "auth_upload_jobsite_area_docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'jobsite-area-docs');
CREATE POLICY IF NOT EXISTS "public_read_jobsite_area_docs" ON storage.objects FOR SELECT USING (bucket_id = 'jobsite-area-docs');
CREATE POLICY IF NOT EXISTS "auth_delete_jobsite_area_docs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'jobsite-area-docs');

-- scope-photos
CREATE POLICY IF NOT EXISTS "auth_upload_scope_photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'scope-photos');
CREATE POLICY IF NOT EXISTS "public_read_scope_photos" ON storage.objects FOR SELECT USING (bucket_id = 'scope-photos');
CREATE POLICY IF NOT EXISTS "auth_delete_scope_photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'scope-photos');

-- site-compliance-docs
CREATE POLICY IF NOT EXISTS "auth_upload_site_compliance_docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-compliance-docs');
CREATE POLICY IF NOT EXISTS "public_read_site_compliance_docs" ON storage.objects FOR SELECT USING (bucket_id = 'site-compliance-docs');
CREATE POLICY IF NOT EXISTS "auth_delete_site_compliance_docs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'site-compliance-docs');

-- job-photos
CREATE POLICY IF NOT EXISTS "auth_upload_job_photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'job-photos');
CREATE POLICY IF NOT EXISTS "public_read_job_photos" ON storage.objects FOR SELECT USING (bucket_id = 'job-photos');
CREATE POLICY IF NOT EXISTS "auth_delete_job_photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'job-photos');
