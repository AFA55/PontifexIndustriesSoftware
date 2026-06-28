-- FIX (live 500): GET /api/admin/jobs/[id]/office-documents returned 500 ("Failed to fetch
-- office documents") on the job-detail page. Root cause: the route's SELECT embeds
-- `uploader:uploaded_by(full_name)`, but `office_documents.uploaded_by` had NO foreign key,
-- so PostgREST could not resolve the relationship and the query errored.
--
-- Fix: add the missing FK to public.profiles(id) (profiles.id = auth uid in this app; uploaded_by
-- is set to auth.userId on insert). Safe: office_documents has 0 rows and 0 orphaned uploaders,
-- uploaded_by and profiles.id are both uuid. ON DELETE SET NULL so removing a user never blocks
-- document reads. Idempotent.
DO $$ BEGIN
  ALTER TABLE public.office_documents
    ADD CONSTRAINT office_documents_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
