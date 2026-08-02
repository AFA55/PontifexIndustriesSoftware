-- Migration: job_crew role widening — allow 'operator' crew members
-- Purpose: one ticket, whole crew. Beyond the LEAD (job_orders.assigned_to),
--   a job can now carry crew members with role 'operator' (full work-performed
--   input, no day-complete/status control) alongside role 'helper' (light
--   helper-work-log form). The original CHECK only allowed ('lead','helper').
-- Additive + idempotent. Safe to re-run.

DO $$ BEGIN
  ALTER TABLE public.job_crew DROP CONSTRAINT IF EXISTS job_crew_role_check;
  ALTER TABLE public.job_crew
    ADD CONSTRAINT job_crew_role_check CHECK (role IN ('lead', 'operator', 'helper'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.job_crew.role IS
  'Crew role on this job: operator = full work-performed input (co-operator, lead still completes the ticket); helper = light work-log form. lead reserved (the lead lives on job_orders.assigned_to).';
