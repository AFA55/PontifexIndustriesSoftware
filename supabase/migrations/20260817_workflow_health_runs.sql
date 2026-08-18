-- WORKFLOW HEALTH — one row per metric per run, so a number has a HISTORY.
--
-- FOUNDER (Aug 17): "Is there a loop function we can create to know when parts
-- of workflow is failing or not working properly? … You see percentage of
-- actual users that get jobs completed and signed."
--
-- WHY A TABLE AND NOT JUST A QUERY. "13% of finished jobs are signed" is close
-- to meaningless on its own — a small shop can produce that number on a slow
-- week and be perfectly healthy. "13%, down from 40% last week" is a signal a
-- person can act on. The comparison is the whole product, and a comparison
-- needs yesterday's number written down. Every other measurement on this
-- platform to date was a human running SQL once, which is why a broken funnel
-- could survive for months.
--
-- WHAT A ROW IS. One metric, one tenant, one measurement instant:
--
--   status = 'ok'       measured, inside its threshold
--   status = 'breach'   measured, outside its threshold
--   status = 'unknown'  NOT measured — value IS NULL, and `unknown_reason`
--                       says whether the query failed or there was simply
--                       nothing in the window.
--
-- THE `unknown` STATUS IS THE POINT OF THIS SCHEMA. A dashboard that renders
-- 0% because a select threw is the exact silent-failure class this platform
-- keeps hitting (a route 404s and merely looks empty; a select names one
-- column that does not exist and PostgREST rejects the whole thing). So the
-- CHECK constraint below makes an invented number unrepresentable: if status
-- is 'unknown' the value MUST be NULL, and if it is not 'unknown' the value
-- MUST be present. There is no way to store a fake zero.
--
-- `unknown_reason` splits the two cases because they need opposite handling:
--   'error'   → a bug. Alerts loudly. Someone must look.
--   'no_data' → an empty window (quiet week, new tenant). Alerts never.
--
-- `alerted_at` is stamped on the rows a Telegram message actually covered, so
-- the next run can answer "have we already said this?" without a second table.
-- A sustained breach re-alerts weekly, not daily — a channel that repeats
-- itself every morning gets muted, and a muted channel is worth nothing. The
-- crew's 16 unread in-app notifications are the proof.
--
-- Additive and idempotent: creates a new table, touches nothing existing.

CREATE TABLE IF NOT EXISTS public.workflow_health_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_key     text NOT NULL,
  status         text NOT NULL CHECK (status IN ('ok', 'breach', 'unknown')),
  -- NULL if and only if status = 'unknown'. See the CHECK below.
  value          numeric,
  numerator      numeric,
  denominator    numeric,
  threshold      numeric,
  -- Supporting facts for the plain-English sentence (e.g. which job numbers).
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  unknown_reason text CHECK (unknown_reason IN ('error', 'no_data')),
  error          text,
  measured_at    timestamptz NOT NULL DEFAULT now(),
  alerted_at     timestamptz,

  -- An invented number must be unrepresentable, not merely discouraged.
  CONSTRAINT workflow_health_runs_value_matches_status CHECK (
    (status = 'unknown' AND value IS NULL AND unknown_reason IS NOT NULL)
    OR (status <> 'unknown' AND value IS NOT NULL AND unknown_reason IS NULL)
  )
);

-- The only two access patterns: "latest per metric for this tenant" and
-- "history of this metric for this tenant". Both are this index.
CREATE INDEX IF NOT EXISTS workflow_health_runs_tenant_metric_time_idx
  ON public.workflow_health_runs (tenant_id, metric_key, measured_at DESC);

ALTER TABLE public.workflow_health_runs ENABLE ROW LEVEL SECURITY;

-- Reads: management only. This is a report card on how the office and the crew
-- are using the system — it is not operator-facing, and showing an operator a
-- metric named "unaccounted completions" would be both confusing and unkind.
--
-- NOTE the role check uses public.current_user_has_role(), which reads
-- public.profiles through a SECURITY DEFINER function. NEVER
-- auth.jwt() -> 'user_metadata' — that is client-writable, so any operator
-- could self-promote with a single updateUser() call.
DROP POLICY IF EXISTS "management_reads_workflow_health" ON public.workflow_health_runs;
CREATE POLICY "management_reads_workflow_health" ON public.workflow_health_runs
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_role('admin', 'super_admin', 'operations_manager'));

-- RESTRICTIVE tenant isolation — ANDed with the permissive policy above, so an
-- admin at tenant A can never read tenant B's numbers no matter what other
-- policy is added later. tenant_id is NOT NULL here, so unlike the older
-- tables there is no `tenant_id IS NULL` escape hatch to allow for.
DROP POLICY IF EXISTS "tenant_isolation" ON public.workflow_health_runs;
CREATE POLICY "tenant_isolation" ON public.workflow_health_runs
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT public.current_user_tenant_id())
    OR (SELECT public.current_user_role()) = 'super_admin'
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_user_tenant_id())
    OR (SELECT public.current_user_role()) = 'super_admin'
  );

-- No INSERT/UPDATE policy for `authenticated` on purpose. The cron writes with
-- the service role, which bypasses RLS; nothing else has any business writing
-- a measurement.

COMMENT ON TABLE public.workflow_health_runs IS
  'One measurement of one workflow-health metric for one tenant. status=unknown means NOT MEASURED (value IS NULL) — never treat it as zero. Written only by /api/cron/workflow-health.';
