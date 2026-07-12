-- Attendance codes system (founder's paper tracker, digitized — docs/plans/
-- PATRIOT_REPORTS_PLAN.md). One code per employee per day (matches the paper
-- grid cell); code values validated in the API layer (Patriot's EA/UA/NCNS/...
-- set as the default), kept as text for future tenant-custom codes.
-- Applied to prod via Supabase MCP on 2026-07-12.
CREATE TABLE IF NOT EXISTS public.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  code text NOT NULL,
  note text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, date)
);

CREATE INDEX IF NOT EXISTS attendance_events_tenant_date_idx ON public.attendance_events(tenant_id, date);
CREATE INDEX IF NOT EXISTS attendance_events_user_idx ON public.attendance_events(user_id, date);

ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "attendance_office_read" ON public.attendance_events
    FOR SELECT USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin','super_admin','operations_manager','supervisor')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER attendance_events_updated_at BEFORE UPDATE ON public.attendance_events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_function THEN NULL; END $$;
