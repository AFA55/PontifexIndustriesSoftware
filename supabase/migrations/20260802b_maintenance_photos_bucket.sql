-- maintenance-photos storage bucket — IT NEVER EXISTED.
--
-- THE BUG THIS FIXES: three separate flows have been uploading to a bucket that
-- is not in storage.buckets, so every one of those uploads has failed silently:
--
--   app/dashboard/admin/site-visits/new/page.tsx      (supervisor visit photos +
--                                                      equipment-issue photos)
--   app/dashboard/maintenance/new/page.tsx            (maintenance request photos)
--   app/dashboard/_components/MaintenanceRequestCard  (operator-reported issues)
--
-- Each catches the error, console.error()s it and returns null, so the person
-- filing the report sees no error and believes the photo attached. Confirmed
-- empirically: the single supervisor_visits row in production has
-- jsonb_array_length(photo_urls) = 0 despite the wizard offering a camera button.
--
-- ACCESS MODEL — copied deliberately from timecard-photos
-- (20260622_timecard_photos_bucket.sql) and blade-checkout-photos
-- (20260701e_blade_checkout_photos_bucket.sql): PRIVATE, and NO storage RLS
-- policies at all. All access is server-side via supabaseAdmin (service_role
-- bypasses RLS):
--   * uploads  → POST /api/admin/supervisor-visits/photo-upload
--                (requireAuth + resolveTenantScope + <tenantId>/ path prefix)
--   * reads    → short-lived signed URLs minted server-side
--                (lib/storage-url-server.ts, which lists this bucket as private
--                and re-signs both public-style and already-signed URLs)
--
-- We deliberately do NOT add a broad `authenticated` policy. A bucket-only
-- `USING (bucket_id = 'maintenance-photos')` policy is NOT tenant-scoped, so it
-- would let any authenticated user from ANY tenant read, list or delete another
-- tenant's jobsite and equipment photos straight through the Storage API. The
-- API layer gates traffic that goes through it; storage RLS gates direct
-- Storage API traffic — so for a server-only private bucket the correct posture
-- is no policies. Same reasoning, verbatim, as the two precedents above.
--
-- CONSEQUENCE / FOLLOW-UP (not fixed here, tracked separately): the two
-- maintenance flows listed above still upload from the CLIENT with the anon key
-- and will keep failing against a policy-less private bucket. They need the same
-- treatment as the visit wizard — route the upload through a server endpoint.
-- They are no worse off than today (the bucket did not exist at all), but this
-- migration does not by itself make them work.
--
-- Idempotent: ON CONFLICT DO NOTHING. Safe to re-run. NOT YET APPLIED.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'maintenance-photos',
  'maintenance-photos',
  false,
  10485760, -- 10 MB, matching job-photos / timecard-photos / blade-checkout-photos
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;
