-- Office Documents: management-only legal/billing paperwork attached to a job.
-- Contracts, change-order paperwork, signed legal docs, permits, invoice docs.
-- Operators must NEVER see these — RLS limits to management roles only.
-- Files live in the private `office-documents` storage bucket; this table only
-- stores the storage path/metadata + an optional total_cost for project costing.

CREATE TABLE IF NOT EXISTS public.office_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id  uuid NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  tenant_id     uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  file_url      text,
  file_name     text,
  file_size     bigint,
  doc_type      text NOT NULL DEFAULT 'other'
                CHECK (doc_type IN ('contract','change_order','signed_legal','permit','invoice_doc','other')),
  description   text,
  total_cost    numeric,
  uploaded_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_documents_job_order_id ON public.office_documents(job_order_id);
CREATE INDEX IF NOT EXISTS idx_office_documents_tenant_id    ON public.office_documents(tenant_id);

ALTER TABLE public.office_documents ENABLE ROW LEVEL SECURITY;

-- Management roles only; tenant-scoped (super_admin also sees null-tenant rows).
DO $$
BEGIN
  CREATE POLICY "office_documents_management_select" ON public.office_documents
    FOR SELECT TO authenticated
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
      AND (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  CREATE POLICY "office_documents_management_insert" ON public.office_documents
    FOR INSERT TO authenticated
    WITH CHECK (
      public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
      AND (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  CREATE POLICY "office_documents_management_update" ON public.office_documents
    FOR UPDATE TO authenticated
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
      AND (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin')
    )
    WITH CHECK (
      public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
      AND (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  CREATE POLICY "office_documents_management_delete" ON public.office_documents
    FOR DELETE TO authenticated
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
      AND (tenant_id = public.current_user_tenant_id() OR public.current_user_role() = 'super_admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Private storage bucket for the actual files.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('office-documents', 'office-documents', false, 52428800) -- 50 MB
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: restrict the bucket to management roles. Uploads/deletes happen
-- server-side via supabaseAdmin (which bypasses RLS), but these policies are the
-- defense-in-depth gate for any client/direct access. Operators are excluded
-- because current_user_has_role() returns false for them.
DO $$
BEGIN
  CREATE POLICY "office_documents_storage_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'office-documents'
      AND public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  CREATE POLICY "office_documents_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'office-documents'
      AND public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  CREATE POLICY "office_documents_storage_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'office-documents'
      AND public.current_user_has_role('admin','super_admin','operations_manager','supervisor','salesman')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
