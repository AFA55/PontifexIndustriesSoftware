-- ════════════════════════════════════════════════════════════════════
-- Migration: 20260521_fix_cross_tenant_policy_and_type_mismatch
-- Purpose:
--   5. Fix job_status_history "always true" policy (cross-tenant leak)
--   6. Fix customer_site_addresses.tenant_id TEXT→UUID type mismatch
--   7. Fix mutable search_path on SECURITY DEFINER functions
-- ════════════════════════════════════════════════════════════════════

-- 5. job_status_history: scoped to caller's tenant via job_orders join
DROP POLICY IF EXISTS "Authenticated users can view job status history"          ON job_status_history;
DROP POLICY IF EXISTS "Authenticated users view own tenant job status history"   ON job_status_history;

CREATE POLICY "Authenticated users view own tenant job status history"
  ON job_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM job_orders jo
      WHERE jo.id = job_status_history.job_id
        AND (
          jo.tenant_id = public.current_user_tenant_id()
          OR public.current_user_has_role('super_admin')
        )
    )
  );

-- 6. customer_site_addresses.tenant_id TEXT → UUID
--    Old policy used (current_user_tenant_id())::text — fix that too.
DROP POLICY IF EXISTS "tenant_isolation" ON customer_site_addresses;

ALTER TABLE customer_site_addresses
  ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid;

CREATE POLICY "tenant_isolation"
  ON customer_site_addresses FOR ALL
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- 7. Fix mutable search_path on SECURITY DEFINER functions
ALTER FUNCTION public.is_admin()                         SET search_path = public;
ALTER FUNCTION public.current_user_role()                SET search_path = public;
ALTER FUNCTION public.current_user_tenant_id()           SET search_path = public;
ALTER FUNCTION public.current_user_has_role(VARIADIC text[]) SET search_path = public;
ALTER FUNCTION public.is_admin_or_ops_manager()          SET search_path = public;
ALTER FUNCTION public.update_updated_at_column()         SET search_path = public;
ALTER FUNCTION public.set_daily_log_day_number()         SET search_path = public;
ALTER FUNCTION public.update_total_days_worked()         SET search_path = public;
ALTER FUNCTION public.set_change_order_number()          SET search_path = public;
ALTER FUNCTION public.calculate_timecard_labor_cost()    SET search_path = public;
ALTER FUNCTION public.auto_expire_badges()               SET search_path = public;
