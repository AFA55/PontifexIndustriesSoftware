-- 20260628_operator_location_pings.sql
-- Append-only operator GPS pings for the customer "In Route" live tracker.
--
-- Design notes:
--   * Append-only: no updated_at column, no UPDATE/DELETE policies. Rows are
--     written by operators and read by staff only.
--   * Customers have NO RLS path. The public "In Route" portal endpoint reads
--     these pings via supabaseAdmin (service_role), which bypasses RLS. Do NOT
--     add an anon/public SELECT policy here — that would leak operator GPS.
--   * Multi-tenant: tenant_id is required and tenant-scoped in every policy.
--   * RLS uses the SECURITY DEFINER helpers (current_user_tenant_id /
--     current_user_has_role) — NEVER auth.jwt() -> 'user_metadata'.
--   * Idempotent: CREATE TABLE / INDEX IF NOT EXISTS; policies guarded with
--     EXCEPTION WHEN duplicate_object so re-runs are no-ops.

CREATE TABLE IF NOT EXISTS public.operator_location_pings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_order_id uuid NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  operator_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude     double precision NOT NULL,
  longitude    double precision NOT NULL,
  accuracy     double precision,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

-- "Latest ping per job" lookup for the live tracker.
CREATE INDEX IF NOT EXISTS idx_operator_location_pings_job_recorded
  ON public.operator_location_pings (job_order_id, recorded_at DESC);

-- Supporting FK indexes (tenant isolation + operator history).
CREATE INDEX IF NOT EXISTS idx_operator_location_pings_tenant_id
  ON public.operator_location_pings (tenant_id);

CREATE INDEX IF NOT EXISTS idx_operator_location_pings_operator_id
  ON public.operator_location_pings (operator_id);

ALTER TABLE public.operator_location_pings ENABLE ROW LEVEL SECURITY;

-- Operators broadcast their OWN pings, scoped to their own tenant.
DO $$ BEGIN
  CREATE POLICY "operator_location_pings_operator_insert" ON public.operator_location_pings
    FOR INSERT
    WITH CHECK (
      operator_id = auth.uid()
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Staff (admin / super_admin / operations_manager) read tenant-scoped pings.
DO $$ BEGIN
  CREATE POLICY "operator_location_pings_staff_select" ON public.operator_location_pings
    FOR SELECT
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
