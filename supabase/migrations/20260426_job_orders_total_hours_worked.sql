-- Add total_hours_worked to job_orders for multi-day job aggregation
-- Aggregated from daily_job_logs at the time of job completion
ALTER TABLE public.job_orders
  ADD COLUMN IF NOT EXISTS total_hours_worked numeric DEFAULT 0;

COMMENT ON COLUMN public.job_orders.total_hours_worked IS
  'Aggregated hours worked across all daily_job_logs for this job. Set at completion time.';
