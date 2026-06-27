-- SECURITY FIX (cross-tenant PII leak): the voice-checkouts bucket migration
-- (20260510_voice_checkouts_bucket.sql) created bucket-only `authenticated` storage
-- policies (USING/WITH CHECK bucket_id = 'voice-checkouts'). Those are NOT
-- tenant-scoped, so any authenticated user from any tenant could read/list/delete
-- another tenant's voice-checkout audio recordings directly via the Storage API.
-- All real access is server-side via supabaseAdmin (service_role bypasses RLS) —
-- uploads through /api/admin/equipment-checkouts/voice-note-upload and reads via
-- short-lived signed URLs minted in /api/admin/equipment-checkouts/[id]/voice-note —
-- so the bucket needs no authenticated policies. Drop them (idempotent).
DROP POLICY IF EXISTS "auth_upload_voice_checkouts" ON storage.objects;
DROP POLICY IF EXISTS "auth_read_voice_checkouts"   ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_voice_checkouts" ON storage.objects;
