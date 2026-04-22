-- Per-day assignment overrides for multi-day jobs
-- Preserves full schedule history even after job completion
-- Unassigning on Day N does NOT affect assignments on other days

CREATE TABLE IF NOT EXISTS public.job_daily_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL,
  operator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  helper_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  operator_name TEXT,
  helper_name TEXT,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_order_id, assignment_date)
);

CREATE INDEX IF NOT EXISTS idx_jda_job_date ON public.job_daily_assignments(job_order_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_jda_tenant_date ON public.job_daily_assignments(tenant_id, assignment_date);

ALTER TABLE public.job_daily_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_board_access_daily_assignments"
  ON public.job_daily_assignments
  FOR ALL
  USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN (
      'super_admin','admin','operations_manager','salesman','shop_manager'
    )
  );
