CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id),
  equipment_id        uuid REFERENCES public.equipment(id) ON DELETE SET NULL,
  equipment_name      text,
  submitted_by        uuid NOT NULL REFERENCES public.profiles(id),
  description         text NOT NULL,
  priority            text NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low','medium','high','critical')),
  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','in_progress','done','cancelled')),
  voice_note_url      text,
  photo_urls          text[] DEFAULT '{}',
  resolved_by         uuid REFERENCES public.profiles(id),
  resolved_at         timestamptz,
  resolution_notes    text,
  supervisor_visit_id uuid REFERENCES public.supervisor_visits(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mr_tenant_status ON public.maintenance_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS mr_submitted     ON public.maintenance_requests (submitted_by);
CREATE INDEX IF NOT EXISTS mr_open          ON public.maintenance_requests (status) WHERE status IN ('open','in_progress');

ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "mr_read_tenant" ON public.maintenance_requests
    FOR SELECT USING (tenant_id = public.current_user_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "mr_insert" ON public.maintenance_requests
    FOR INSERT WITH CHECK (
      submitted_by = auth.uid()
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "mr_manager_update" ON public.maintenance_requests
    FOR UPDATE USING (
      public.current_user_has_role('admin','super_admin','operations_manager','shop_manager')
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE TRIGGER mr_updated_at
  BEFORE UPDATE ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
