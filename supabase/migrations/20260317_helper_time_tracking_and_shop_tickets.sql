-- Extend helper_work_logs with time tracking and shop ticket support
-- For team member smart job transitions and per-job time tracking

-- Add time tracking columns
ALTER TABLE public.helper_work_logs
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hours_worked NUMERIC(5,2);

-- Add shop ticket support
ALTER TABLE public.helper_work_logs
  ADD COLUMN IF NOT EXISTS is_shop_ticket BOOLEAN DEFAULT false;

-- Make job_order_id nullable for shop tickets (no associated job)
ALTER TABLE public.helper_work_logs
  ALTER COLUMN job_order_id DROP NOT NULL;

-- Drop old unique constraint that requires job_order_id
ALTER TABLE public.helper_work_logs
  DROP CONSTRAINT IF EXISTS helper_work_logs_job_order_id_helper_id_log_date_key;

-- Create new partial unique index for field jobs (job_order_id NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS helper_work_logs_job_helper_date_uniq
  ON public.helper_work_logs (job_order_id, helper_id, log_date)
  WHERE job_order_id IS NOT NULL;

-- Create partial unique index for shop tickets (one per helper per date)
CREATE UNIQUE INDEX IF NOT EXISTS helper_work_logs_shop_helper_date_uniq
  ON public.helper_work_logs (helper_id, log_date)
  WHERE is_shop_ticket = true;

-- Comments
COMMENT ON COLUMN public.helper_work_logs.started_at IS 'When helper started working on this job (auto-set from clock-in or job transition)';
COMMENT ON COLUMN public.helper_work_logs.completed_at IS 'When helper completed this job segment (triggers time calc)';
COMMENT ON COLUMN public.helper_work_logs.hours_worked IS 'Calculated: completed_at - started_at in hours';
COMMENT ON COLUMN public.helper_work_logs.is_shop_ticket IS 'True if this is in-shop work, not a field job';
