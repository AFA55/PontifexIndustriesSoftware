-- (Jul 23) Security F1 — flip job-photos PUBLIC → PRIVATE. Operator work photos,
-- job documents, completion-signature images — all internal (logged-in only).
-- Work photos re-signed at display via lib/storage-url.ts; documents signed
-- server-side in the documents API (lib/storage-url-server.ts). Customer
-- signatures use base64 (not this bucket); completion PDFs embed no job photos.
-- Applied to prod via MCP. Idempotent.
UPDATE storage.buckets SET public = false WHERE id = 'job-photos';
DO $$ BEGIN
  CREATE POLICY "authenticated read job-photos" ON storage.objects FOR SELECT
    TO authenticated USING (bucket_id = 'job-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
