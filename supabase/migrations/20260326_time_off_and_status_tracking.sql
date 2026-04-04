-- ============================================================================
-- Migration: Operator Time Off + Job Status Tracking Columns
-- Date: 2026-03-26
-- ============================================================================

-- 1. Operator Time Off table
CREATE TABLE IF NOT EXISTS public.operator_time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pto', 'unpaid', 'worked_last_night', 'sick', 'other')),
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(operator_id, date)
);

CREATE INDEX IF NOT EXISTS idx_time_off_operator_date ON public.operator_time_off(operator_id, date);
CREATE INDEX IF NOT EXISTS idx_time_off_date ON public.operator_time_off(date);

ALTER TABLE public.operator_time_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_off_admin_all" ON public.operator_time_off
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin', 'operations_manager', 'admin')
  );

CREATE POLICY "time_off_read_own" ON public.operator_time_off
  FOR SELECT USING (operator_id = auth.uid());

COMMENT ON TABLE public.operator_time_off IS 'Tracks operator time off (PTO, unpaid, sick, worked last night) for schedule board visibility';

-- 2. Job status tracking columns
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS loading_started_at TIMESTAMPTZ;
ALTER TABLE public.job_orders ADD COLUMN IF NOT EXISTS done_for_day_at TIMESTAMPTZ;

COMMENT ON COLUMN public.job_orders.loading_started_at IS 'When operator clocked in and started loading for this job';
COMMENT ON COLUMN public.job_orders.done_for_day_at IS 'When operator marked done for the day (multi-day jobs)';
