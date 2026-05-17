-- Change job_daily_assignments FK from CASCADE to RESTRICT.
-- Jobs with assignment history must be soft-deleted (deleted_at) instead of hard-deleted.
-- This prevents accidentally wiping payroll audit records when a job is removed.
ALTER TABLE public.job_daily_assignments
  DROP CONSTRAINT IF EXISTS job_daily_assignments_job_order_id_fkey;

ALTER TABLE public.job_daily_assignments
  ADD CONSTRAINT job_daily_assignments_job_order_id_fkey
  FOREIGN KEY (job_order_id) REFERENCES public.job_orders(id) ON DELETE RESTRICT;
