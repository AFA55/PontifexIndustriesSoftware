-- Fix RLS policies for daily_job_logs to include all admin roles
-- BUG: Only 'admin' role could see daily logs, super_admin/operations_manager/salesman were locked out

DROP POLICY IF EXISTS "daily_job_logs_select_admin" ON public.daily_job_logs;
DROP POLICY IF EXISTS "daily_job_logs_update_admin" ON public.daily_job_logs;

-- Admins (all admin-level roles) can view all daily logs
CREATE POLICY "daily_job_logs_select_admin"
  ON public.daily_job_logs
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin', 'operations_manager', 'salesman')
  );

-- Admins can update all daily logs
CREATE POLICY "daily_job_logs_update_admin"
  ON public.daily_job_logs
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin', 'operations_manager')
  );

-- Add day_number column to daily_job_logs for easier tracking
ALTER TABLE public.daily_job_logs ADD COLUMN IF NOT EXISTS day_number INTEGER;

-- Backfill day_number for existing logs
UPDATE public.daily_job_logs djl
SET day_number = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY job_order_id ORDER BY log_date ASC) as rn
  FROM public.daily_job_logs
) sub
WHERE djl.id = sub.id AND djl.day_number IS NULL;
