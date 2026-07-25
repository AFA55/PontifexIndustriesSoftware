-- Re-add 'on_hold' to job_orders.status CHECK. A 2026-07-21 redefinition dropped
-- it, but code still writes status='on_hold' (the hold feature + the operator
-- visibility exemption in app/api/job-orders/route.ts), so those writes were
-- being silently rejected by the constraint. Idempotent; only 'completed' rows
-- exist so no row violates the re-added list.
ALTER TABLE public.job_orders DROP CONSTRAINT IF EXISTS job_orders_status_check;
ALTER TABLE public.job_orders ADD CONSTRAINT job_orders_status_check CHECK (
  status = ANY (ARRAY[
    'pending_approval','scheduled','assigned','in_route','on_site','in_progress',
    'on_hold','pending_completion','completed','cancelled','rejected','archived'
  ]::text[])
);
