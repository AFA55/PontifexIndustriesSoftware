-- ============================================================================
-- Hiring billing hardening (guardian finding B3 + S1, Jul 3 2026)
--
-- B3: the initial migration's admin-read policies on hiring_billing and
-- hiring_spend_ledger let tenant admins SELECT whole rows from the browser —
-- exposing raw_cost and ad_spend_markup, i.e. our exact cost basis/margin,
-- which the entire billing model depends on hiding. ALL customer-facing reads
-- go through service-role API routes that strip those fields, so the client-
-- side policies are simply dropped (service role bypasses RLS).
--
-- S1: atomic balance increment RPC so concurrent spend entries can't lose
-- updates via read-modify-write races. Service-role only.
-- ============================================================================

DROP POLICY IF EXISTS hiring_billing_admin_read ON public.hiring_billing;
DROP POLICY IF EXISTS hiring_spend_admin_read ON public.hiring_spend_ledger;

-- Atomic, race-safe balance adjustment (positive = add spend, negative = settle).
-- Clamps at zero so a late decrement can't drive the balance negative.
CREATE OR REPLACE FUNCTION public.increment_hiring_balance(p_tenant_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.hiring_billing
  SET balance_owed = GREATEST(0, balance_owed + p_amount),
      updated_at = now()
  WHERE tenant_id = p_tenant_id
  RETURNING balance_owed;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_hiring_balance(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_hiring_balance(uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_hiring_balance(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_hiring_balance(uuid, numeric) TO service_role;

-- Same race-safety for the per-job spend rollup.
CREATE OR REPLACE FUNCTION public.increment_hiring_job_spend(p_job_id uuid, p_amount numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.hiring_jobs
  SET total_spend = GREATEST(0, total_spend + p_amount),
      updated_at = now()
  WHERE id = p_job_id;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_hiring_job_spend(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_hiring_job_spend(uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_hiring_job_spend(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_hiring_job_spend(uuid, numeric) TO service_role;
