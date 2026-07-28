-- Migration: job_helper_reviews
-- Purpose: helper/apprentice rates the operator they worked under, at end of day.
--   Feeds the operator's performance/raise review (management surface only).
-- Additive + idempotent. Safe to re-run.
--
-- Auth model:
--   * Helpers WRITE via supabaseAdmin / service_role (the /api/helper-work-log
--     completion path), which bypasses RLS. Tenant + reviewer identity are set
--     server-side from the authenticated session, never from the client body.
--   * The RLS SELECT policy below is for AUTHENTICATED MANAGEMENT only (reading
--     an operator's crew feedback on the annual report).
--
-- Mirrors customer_comments (20260628) conventions: tenant_id NOT NULL + RLS via
-- the SECURITY DEFINER helpers current_user_has_role() / current_user_tenant_id().

CREATE TABLE IF NOT EXISTS public.job_helper_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_order_id  uuid NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  reviewer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- the helper
  operator_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- job_orders.assigned_to
  rating        int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text CHECK (comment IS NULL OR char_length(comment) <= 2000),
  created_at    timestamptz DEFAULT now()
);

-- One review per helper per job (the completion path upserts on this).
CREATE UNIQUE INDEX IF NOT EXISTS job_helper_reviews_job_reviewer_uniq
  ON public.job_helper_reviews (job_order_id, reviewer_id);

-- Read patterns: "all reviews for this operator" and tenant scoping.
CREATE INDEX IF NOT EXISTS job_helper_reviews_operator_created_idx
  ON public.job_helper_reviews (operator_id, created_at);
CREATE INDEX IF NOT EXISTS job_helper_reviews_tenant_id_idx
  ON public.job_helper_reviews (tenant_id);

-- RLS (management-only reads; writes go through service_role which bypasses RLS)
ALTER TABLE public.job_helper_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "job_helper_reviews_mgmt_select" ON public.job_helper_reviews
    FOR SELECT
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
