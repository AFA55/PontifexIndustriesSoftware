-- 20260702_ai_usage.sql
-- Cost/usage log for Artifex (Jarvis Command Center Phase 2 — the AI brain).
--
-- Design notes:
--   * Append-only usage ledger — written server-side only (Artifex API route),
--     via supabaseAdmin. No client INSERT path; RLS below is read-only for staff.
--   * Multi-tenant: tenant_id required and tenant-scoped in the read policy.
--   * RLS uses the SECURITY DEFINER helpers (current_user_tenant_id /
--     current_user_has_role) — NEVER auth.jwt() -> 'user_metadata'.
--   * Idempotent: CREATE TABLE / INDEX IF NOT EXISTS; policies guarded with
--     EXCEPTION WHEN duplicate_object so re-runs are no-ops.
--   * This table is what a future per-tenant cost-metering / budget-ceiling
--     feature reads from (docs/plans/ARTIFEX_PLAN.md Phase 5) — keep columns
--     stable once other code depends on them.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model             text NOT NULL,
  input_tokens      integer NOT NULL DEFAULT 0,
  output_tokens     integer NOT NULL DEFAULT 0,
  cached_tokens     integer NOT NULL DEFAULT 0,
  cost_usd          numeric(10, 6) NOT NULL DEFAULT 0,
  source            text NOT NULL DEFAULT 'command_center_assistant',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_created
  ON public.ai_usage (tenant_id, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Staff (admin / super_admin / operations_manager) can read their tenant's usage
-- log (for a future cost-dashboard); no INSERT/UPDATE/DELETE policy — writes are
-- service_role-only (Artifex's API route), by design.
DO $$ BEGIN
  CREATE POLICY "ai_usage_staff_select" ON public.ai_usage
    FOR SELECT
    USING (
      public.current_user_has_role('admin','super_admin','operations_manager')
      AND tenant_id = public.current_user_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
