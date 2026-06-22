-- timecard-photos storage bucket: selfie/arrival photos captured during REMOTE
-- (direct-to-jobsite) clock-in and remote clock-out. These are employee face
-- photos = PII, so the bucket is PRIVATE. Reads happen via short-lived signed
-- URLs generated server-side; uploads happen server-side via supabaseAdmin
-- (see /api/timecard/photo-upload). The bucket NEVER existed before this
-- migration, which is why every prior remote clock-in/out wrote the literal
-- 'photo-upload-failed' sentinel into the *_photo_url columns.
--
-- ACCESS MODEL: this bucket has NO storage RLS policies on purpose. ALL access is
-- server-side via supabaseAdmin (service_role, which bypasses RLS): uploads go
-- through /api/timecard/photo-upload (requireAuth + tenant/user path prefix) and
-- reads are short-lived signed URLs minted server-side after requireAdmin/requireAuth.
-- We deliberately do NOT grant broad `authenticated` policies: a bucket-only
-- `USING (bucket_id = '...')` policy is NOT tenant-scoped, so it would let any
-- authenticated user from ANY tenant read/list/delete another tenant's employee
-- selfie photos (PII) directly via the Storage API. The API layer is the gate for
-- traffic that goes THROUGH it; storage RLS is the gate for direct Storage API
-- traffic — so the correct posture for a server-only private bucket is no policies.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'timecard-photos',
  'timecard-photos',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;
