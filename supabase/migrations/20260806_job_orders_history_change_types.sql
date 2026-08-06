-- Allow every change_type the application actually writes.
--
-- Applied ad-hoc via the Supabase MCP on 6 Aug 2026 while chasing silent audit
-- failures. Captured here because a rebuild from migrations would otherwise
-- reintroduce the original constraint and start dropping audit rows again.
--
-- The original list allowed only created/updated/status_changed/assigned/
-- deleted. Every other value the app wrote was REJECTED — and because those
-- inserts were fire-and-forget, nothing surfaced. Confirmed missing entirely
-- from job_orders_history: day_ticket_reset, office_completed, rejected,
-- approved, duplicated, resubmitted, new_scope_job_created.

ALTER TABLE public.job_orders_history
  DROP CONSTRAINT IF EXISTS job_orders_history_change_type_check;

ALTER TABLE public.job_orders_history
  ADD CONSTRAINT job_orders_history_change_type_check
  CHECK (change_type = ANY (ARRAY[
    'created',
    'updated',
    'status_changed',
    'assigned',
    'deleted',
    'day_ticket_reset',
    'office_completed',
    'office_reopened',
    'rejected',
    'approved',
    'reopened_for_edit',
    'duplicated',
    'resubmitted',
    'new_scope_job_created'
  ]));
