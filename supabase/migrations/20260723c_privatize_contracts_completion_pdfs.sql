-- (Jul 23) Security F1 — flip contracts + completion-pdfs PUBLIC → PRIVATE.
-- Customer PII (names, addresses, signatures, pricing). Delivery is 100% via
-- token-gated pages (/contract/[token], /portal/[token]/job/…) + admin views,
-- all now serving short-lived SIGNED urls (signed server-side after token/auth
-- validation, lib/storage-url-server.ts). Customer emails attach the PDF as
-- base64 (not a bucket link). Applied to prod via MCP. Idempotent.
UPDATE storage.buckets SET public = false WHERE id IN ('contracts', 'completion-pdfs');
DO $$ BEGIN
  CREATE POLICY "authenticated read contracts" ON storage.objects FOR SELECT
    TO authenticated USING (bucket_id = 'contracts');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "authenticated read completion-pdfs" ON storage.objects FOR SELECT
    TO authenticated USING (bucket_id = 'completion-pdfs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
