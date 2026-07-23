-- Takeoffs hardening (RLS-audit follow-ups M1+M2, Jul 22, applied via MCP):
-- composite FKs = a child row can NEVER reference another tenant's parent;
-- bucket capped to 100MB PDFs (+ webp/png for future thumbnails). Idempotent.
DO $$ BEGIN
  ALTER TABLE public.takeoff_documents ADD CONSTRAINT takeoff_documents_id_tenant_key UNIQUE (id, tenant_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.takeoff_pages ADD CONSTRAINT takeoff_pages_id_tenant_key UNIQUE (id, tenant_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.takeoff_conditions ADD CONSTRAINT takeoff_conditions_id_tenant_key UNIQUE (id, tenant_id);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.takeoff_pages ADD CONSTRAINT takeoff_pages_doc_tenant_fk
    FOREIGN KEY (document_id, tenant_id) REFERENCES public.takeoff_documents(id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.takeoff_conditions ADD CONSTRAINT takeoff_conditions_doc_tenant_fk
    FOREIGN KEY (document_id, tenant_id) REFERENCES public.takeoff_documents(id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.takeoff_measurements ADD CONSTRAINT takeoff_measurements_cond_tenant_fk
    FOREIGN KEY (condition_id, tenant_id) REFERENCES public.takeoff_conditions(id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.takeoff_measurements ADD CONSTRAINT takeoff_measurements_page_tenant_fk
    FOREIGN KEY (page_id, tenant_id) REFERENCES public.takeoff_pages(id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE storage.buckets
SET file_size_limit = 104857600,
    allowed_mime_types = ARRAY['application/pdf','image/webp','image/png']
WHERE id = 'takeoff-documents';
