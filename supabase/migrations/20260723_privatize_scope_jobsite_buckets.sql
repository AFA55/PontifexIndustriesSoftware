-- (Jul 23) Security F1 — flip scope-photos + jobsite-area-docs PUBLIC → PRIVATE.
-- Tenant job-site imagery displayed ONLY to logged-in operators/admins (via
-- PhotoViewer/PhotoUploader); never in customer PDFs/portal. Public buckets
-- served /object/public/… with no auth (a leaked URL worked forever). Now
-- authenticated users get a signed URL at display time (lib/storage-url.ts);
-- the public path 404s. Applied to prod via MCP. Idempotent.
UPDATE storage.buckets SET public = false
WHERE id IN ('scope-photos', 'jobsite-area-docs');

-- Private bucket needs an authenticated SELECT policy for client createSignedUrl.
DO $$ BEGIN
  CREATE POLICY "authenticated read scope-photos" ON storage.objects FOR SELECT
    TO authenticated USING (bucket_id = 'scope-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "authenticated read jobsite-area-docs" ON storage.objects FOR SELECT
    TO authenticated USING (bucket_id = 'jobsite-area-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
