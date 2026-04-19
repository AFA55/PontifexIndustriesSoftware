-- Migration: fix_rls_tenant_isolation
-- Applied: 2026-04-18
-- Description: Fix RLS policies on billing_milestones and notification_recipients
--              to enforce tenant_id isolation in addition to role checks.
--              Previously these policies only checked role, allowing cross-tenant data access.

-- Drop incorrect policies that only check role
DROP POLICY IF EXISTS "tenant_isolation" ON public.billing_milestones;
DROP POLICY IF EXISTS "tenant_isolation" ON public.notification_recipients;

-- Correct policies that enforce BOTH tenant_id AND role
CREATE POLICY "tenant_isolation" ON public.billing_milestones
  USING (
    tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin','admin','operations_manager','salesman')
  );

CREATE POLICY "tenant_isolation" ON public.notification_recipients
  USING (
    tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'user_metadata' ->> 'role') IN ('super_admin','admin','operations_manager','salesman')
  );
