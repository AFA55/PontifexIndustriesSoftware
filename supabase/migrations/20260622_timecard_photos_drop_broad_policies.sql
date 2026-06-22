-- SECURITY FIX (cross-tenant PII leak): an earlier iteration of the
-- timecard-photos bucket migration created bucket-only `authenticated` storage
-- policies (USING bucket_id = 'timecard-photos'). Those are NOT tenant-scoped, so
-- any authenticated user from any tenant could read/list/delete another tenant's
-- employee selfie photos directly via the Storage API. All real access is
-- server-side via supabaseAdmin (service_role bypasses RLS), so the bucket needs
-- no authenticated policies. Drop them (idempotent).
DROP POLICY IF EXISTS "auth_upload_timecard_photos" ON storage.objects;
DROP POLICY IF EXISTS "auth_read_timecard_photos"   ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_timecard_photos" ON storage.objects;
