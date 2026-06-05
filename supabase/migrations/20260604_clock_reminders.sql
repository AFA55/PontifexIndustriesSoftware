-- Smart clock-in/out reminders: support columns (additive + idempotent).
-- APPLIED TO PROD 2026-06-04 via Supabase MCP (apply_migration: clock_reminders_20260604).
--
-- arrival_time (text) already exists on job_orders and is the start-time source —
-- intentionally NOT altered (changing its type would be destructive). This only adds:
--   1) a per-tenant default start time fallback (so a job with no arrival_time
--      still triggers a clock-in reminder), and
--   2) an index for the cron's hot "today's jobs with a start time" query.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_start_time time NOT NULL DEFAULT '07:00';

CREATE INDEX IF NOT EXISTS job_orders_tenant_date_arrival_idx
  ON public.job_orders (tenant_id, scheduled_date)
  WHERE arrival_time IS NOT NULL;
