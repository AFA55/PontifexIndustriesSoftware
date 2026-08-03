-- Site Visit Reports on the job page (Aug 2026).
--
-- The job detail page now asks "which supervisor walkthroughs happened on THIS
-- job, and what did the shop do about the equipment they flagged?". That second
-- half runs:
--
--   SELECT ... FROM maintenance_requests WHERE supervisor_visit_id IN (…)
--
-- maintenance_requests has indexes on (tenant_id, status), submitted_by, and a
-- partial one on status — but nothing on supervisor_visit_id, so this lookup is
-- a seq scan that grows with every maintenance request ever filed.
--
-- Partial (WHERE NOT NULL): only supervisor-originated rows carry the column,
-- and operator-reported maintenance is the majority of the table.
--
-- Additive + idempotent. Safe to re-run. No data change, no lock of consequence
-- (CREATE INDEX IF NOT EXISTS takes a brief SHARE lock; the table is small).
--
-- NOTE: every OTHER query added alongside this feature is already covered:
--   supervisor_visits(job_order_id)            → idx_supervisor_visits_job
--   supervisor_visits(operator_id, visit_date) → idx_supervisor_visits_operator
--   customer_surveys(operator_id)              → idx_surveys_operator
--   job_helper_reviews(operator_id, created_at)→ job_helper_reviews_operator_created_idx
-- The composite operator rating is computed ON READ (lib/operator-rating.ts),
-- so there is no rollup table to create, backfill, or keep in sync.

CREATE INDEX IF NOT EXISTS maintenance_requests_supervisor_visit_idx
  ON public.maintenance_requests (supervisor_visit_id)
  WHERE supervisor_visit_id IS NOT NULL;

COMMENT ON INDEX public.maintenance_requests_supervisor_visit_idx IS
  'Supports the job page''s Site Visit Reports card: resolving the shop status of equipment a supervisor flagged during a walkthrough.';
