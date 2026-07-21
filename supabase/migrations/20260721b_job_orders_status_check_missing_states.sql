-- (Jul 21, 2026) job_orders_status_check was missing three statuses the API
-- treats as valid ('on_site', 'pending_completion', 'archived'). Every
-- transition to on_site failed with a generic 500 — caught by the live
-- workflow E2E (QA-2026-320243: in_route→on_site errored; the flow only
-- survived because in_route→in_progress is also a legal transition, which is
-- why real crews never noticed). Also silently broke any write of
-- 'pending_completion' (completion-request flow) and 'archived'.
-- Same failure family as notifications_notification_type_check (fixed
-- earlier today): DB whitelist drifted behind the API's status list.
--
-- Applied to prod via Supabase MCP on 2026-07-21. Idempotent.
ALTER TABLE public.job_orders DROP CONSTRAINT IF EXISTS job_orders_status_check;
ALTER TABLE public.job_orders ADD CONSTRAINT job_orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending_approval'::text, 'scheduled'::text, 'assigned'::text,
    'in_route'::text, 'on_site'::text, 'in_progress'::text,
    'pending_completion'::text, 'completed'::text,
    'cancelled'::text, 'rejected'::text, 'archived'::text
  ]));
