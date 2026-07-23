-- (Jul 23) Security F3 — blanket TENANT ISOLATION via RESTRICTIVE policies.
--
-- The audit found ~100 role-based policies (is_admin(), current_user_has_role(),
-- "any authenticated") with NO tenant predicate: an admin of tenant A could read
-- or write tenant B's rows via PostgREST with their own token. Rather than
-- rewrite 100 policies, add ONE restrictive policy per tenant-scoped table —
-- Postgres ANDs restrictive policies with every permissive policy, so existing
-- rules keep working WITHIN the tenant while cross-tenant access is blocked.
--
--  * TO authenticated only — anon paths untouched; service_role bypasses RLS so
--    all server API routes are unaffected.
--  * super_admin keeps global access (platform operators manage every tenant).
--  * tenant_id IS NULL allowed: 8 tables hold legacy/global NULL rows
--    (login_attempts, audit_logs, timecard_breaks, operator_skill_categories…).
--    Blocking them would hide existing data. Backfill + strict equality = TODO.
--  * (SELECT fn()) form so SECURITY DEFINER helpers evaluate once per statement.
--
-- Applied to prod via MCP; 141 tables protected. Verified: Patriot operator sees
-- only Patriot rows; super_admin still sees all tenants.
-- Reversible: DROP POLICY tenant_isolation ON <table>. Idempotent.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name AND t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.table_name AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
        'USING (tenant_id IS NULL OR tenant_id = (SELECT public.current_user_tenant_id()) '
        '       OR (SELECT public.current_user_role()) = ''super_admin'') '
        'WITH CHECK (tenant_id IS NULL OR tenant_id = (SELECT public.current_user_tenant_id()) '
        '       OR (SELECT public.current_user_role()) = ''super_admin'')',
        r.table_name);
    END IF;
  END LOOP;
END $$;
