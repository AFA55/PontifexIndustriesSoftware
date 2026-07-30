-- Migration: job_crew
-- Purpose: support 2+ OPERATORS on one job. The LEAD stays job_orders.assigned_to
--   (does the full completion ticket, unchanged); additional operators are crewed
--   as 'helper' here and get the light helper-work-log flow (clock-in + short
--   description). One full completion per job + N short descriptions.
-- Duplicated jobs do NOT copy job_crew rows → each duplicate runs the full workflow.
-- Additive + idempotent. Safe to re-run.
--
-- Writes go through supabaseAdmin (service_role) from the admin crew endpoint;
-- tenant_id / role are set server-side, never from the client body.
-- Mirrors the tenant + RLS conventions of job_helper_reviews (20260728).

CREATE TABLE IF NOT EXISTS public.job_crew (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_order_id  uuid NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'helper' CHECK (role IN ('lead','helper')),
  added_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

-- One crew row per (job, user).
CREATE UNIQUE INDEX IF NOT EXISTS job_crew_job_user_uniq
  ON public.job_crew (job_order_id, user_id);

-- Read patterns: "jobs this user is crewed on", "crew for this job", tenant scope.
CREATE INDEX IF NOT EXISTS job_crew_user_idx ON public.job_crew (user_id);
CREATE INDEX IF NOT EXISTS job_crew_job_idx ON public.job_crew (job_order_id);
CREATE INDEX IF NOT EXISTS job_crew_tenant_idx ON public.job_crew (tenant_id);

ALTER TABLE public.job_crew ENABLE ROW LEVEL SECURITY;

-- SELECT: a user can see their OWN crew rows; management sees all rows in-tenant.
-- (Server APIs resolve membership via service_role; this policy is defense-in-depth
--  for any direct client read.)
DO $$ BEGIN
  CREATE POLICY "job_crew_select" ON public.job_crew
    FOR SELECT
    USING (
      user_id = (select auth.uid())
      OR (
        public.current_user_has_role('admin','super_admin','operations_manager')
        AND tenant_id = public.current_user_tenant_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
