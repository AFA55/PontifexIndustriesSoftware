-- Per-day start-time overrides (e.g. every-other-Monday safety-training day → 6:30 AM
-- for everyone). This is the MIDDLE tier of the effective-start resolution chain:
--   per-job ticket (job_orders.arrival_time/shop_arrival_time)
--     > per-day override (THIS table)
--       > tenant standard (tenants.default_start_time)
-- See docs/plans/START_TIME_LATE_PLAN.md. Additive + idempotent.

CREATE TABLE IF NOT EXISTS public.timecard_day_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  override_date date NOT NULL,
  start_time    time NOT NULL,
  scope         text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','role','operator')),
  role          text,                                       -- when scope='role'
  operator_id   uuid REFERENCES public.profiles(id) ON DELETE CASCADE,  -- when scope='operator'
  note          text,                                       -- "Safety training day"
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- each scope must carry exactly its qualifier
  CONSTRAINT tdo_scope_qualifier CHECK (
    (scope = 'all'      AND role IS NULL     AND operator_id IS NULL) OR
    (scope = 'role'     AND role IS NOT NULL AND operator_id IS NULL) OR
    (scope = 'operator' AND operator_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS tdo_tenant_date_idx
  ON public.timecard_day_overrides (tenant_id, override_date);

-- one row per scope-target per day (most-specific wins at resolution time)
CREATE UNIQUE INDEX IF NOT EXISTS tdo_unique_all
  ON public.timecard_day_overrides (tenant_id, override_date) WHERE scope = 'all';
CREATE UNIQUE INDEX IF NOT EXISTS tdo_unique_role
  ON public.timecard_day_overrides (tenant_id, override_date, role) WHERE scope = 'role';
CREATE UNIQUE INDEX IF NOT EXISTS tdo_unique_operator
  ON public.timecard_day_overrides (tenant_id, override_date, operator_id) WHERE scope = 'operator';

ALTER TABLE public.timecard_day_overrides ENABLE ROW LEVEL SECURITY;

-- read: any authenticated user in the tenant (an operator may want to see the day's start)
DROP POLICY IF EXISTS tdo_tenant_read ON public.timecard_day_overrides;
CREATE POLICY tdo_tenant_read ON public.timecard_day_overrides
  FOR SELECT USING (tenant_id = public.current_user_tenant_id());

-- write: admin / operations_manager / super_admin only, tenant-scoped
DROP POLICY IF EXISTS tdo_admin_insert ON public.timecard_day_overrides;
CREATE POLICY tdo_admin_insert ON public.timecard_day_overrides
  FOR INSERT WITH CHECK (
    public.current_user_has_role('admin','super_admin','operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS tdo_admin_update ON public.timecard_day_overrides;
CREATE POLICY tdo_admin_update ON public.timecard_day_overrides
  FOR UPDATE USING (
    public.current_user_has_role('admin','super_admin','operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  )
  WITH CHECK (
    public.current_user_has_role('admin','super_admin','operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS tdo_admin_delete ON public.timecard_day_overrides;
CREATE POLICY tdo_admin_delete ON public.timecard_day_overrides
  FOR DELETE USING (
    public.current_user_has_role('admin','super_admin','operations_manager')
    AND tenant_id = public.current_user_tenant_id()
  );

-- updated_at trigger (matches the project convention: a table-local set_updated_at fn)
CREATE OR REPLACE FUNCTION public.timecard_day_overrides_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS set_tdo_updated_at ON public.timecard_day_overrides;
CREATE TRIGGER set_tdo_updated_at
  BEFORE UPDATE ON public.timecard_day_overrides
  FOR EACH ROW EXECUTE FUNCTION public.timecard_day_overrides_set_updated_at();

-- audit: record which tier supplied the late baseline (job | day_override | standard)
ALTER TABLE public.timecards ADD COLUMN IF NOT EXISTS late_source text;
