-- ============================================================================
-- 20260801_notifications_rls_hardening.sql
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- A live-DB RLS audit (verified against pg_policies on 2026-08-01) found:
--
-- 1. CRITICAL — schedule_notifications had an INSERT policy named
--    "service_role_can_insert_notifications" that was PERMISSIVE, granted to
--    role {public}, with WITH CHECK (true). Despite its name, it did NOT
--    scope to service_role: ANY authenticated user could forge notification
--    rows for any recipient_id in their own tenant — or with tenant_id NULL,
--    which slips past the RESTRICTIVE tenant_isolation policy entirely.
--    service_role bypasses RLS anyway, so the policy protected nothing and
--    only opened a hole. FIX: drop it. All legitimate writers go through
--    bearer-auth API routes using supabaseAdmin (service role).
--
-- 2. schedule_notifications had two byte-identical SELECT policies
--    ("Users can read their own notifications" and
--    "operators_can_read_own_notifications", both recipient_id = auth.uid()).
--    FIX: drop the duplicate, keep "Users can read their own notifications".
--
-- 3. SCHEMA DRIFT — the live policies on notifications, and the remaining
--    policies on schedule_notifications, exist in NO migration file. This
--    migration codifies them (DROP IF EXISTS + CREATE) so a rebuilt
--    environment matches production. Two schedule_notifications policies
--    that used EXISTS(SELECT 1 FROM profiles ...) role subqueries are
--    normalized to the equivalent SECURITY DEFINER helpers
--    (public.current_user_has_role / public.current_user_role) — identical
--    semantics, house convention, no profiles-RLS recursion risk.
--
-- APPLICATION BEHAVIOR: UNCHANGED. All app INSERT/UPDATE/DELETE traffic on
-- both tables goes through server-side supabaseAdmin (service role, bypasses
-- RLS). No client code inserts or updates these tables directly. This
-- migration deliberately adds NO INSERT/UPDATE/DELETE policies for regular
-- users on either table (the schedule_notifications UI "dismiss" path is
-- being moved to an API route, not given an UPDATE policy).
--
-- NO auth.jwt() -> 'user_metadata' anywhere (rls_references_user_metadata).
-- Idempotent and re-runnable: every DROP is IF EXISTS, every CREATE is
-- preceded by a DROP of the same policy name.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- schedule_notifications
-- ----------------------------------------------------------------------------
ALTER TABLE public.schedule_notifications ENABLE ROW LEVEL SECURITY;

-- (1) CRITICAL FIX: drop the misnamed forge-anything INSERT policy.
--     It was TO public WITH CHECK (true) — not service_role-scoped at all.
--     service_role bypasses RLS, so nothing legitimate loses access.
DROP POLICY IF EXISTS "service_role_can_insert_notifications" ON public.schedule_notifications;

-- (2) Drop the exact-duplicate SELECT policy.
--     Identical to "Users can read their own notifications" below.
DROP POLICY IF EXISTS "operators_can_read_own_notifications" ON public.schedule_notifications;

-- (3) Codify the surviving live policies in source control.

-- Recipients read their own notifications.
DROP POLICY IF EXISTS "Users can read their own notifications" ON public.schedule_notifications;
CREATE POLICY "Users can read their own notifications" ON public.schedule_notifications
  FOR SELECT
  USING (recipient_id = auth.uid());

-- Admin / super_admin read all (tenant scope enforced by the RESTRICTIVE
-- tenant_isolation policy below). Normalized from an EXISTS(profiles)
-- subquery to the equivalent SECURITY DEFINER helper.
DROP POLICY IF EXISTS "Admin/Super admin can read all notifications" ON public.schedule_notifications;
CREATE POLICY "Admin/Super admin can read all notifications" ON public.schedule_notifications
  FOR SELECT
  USING (public.current_user_has_role('admin', 'super_admin'));

-- Super admin may insert directly (rarely used — app writes are service
-- role). Normalized from an EXISTS(profiles) subquery to the helper.
DROP POLICY IF EXISTS "Super admin can create notifications" ON public.schedule_notifications;
CREATE POLICY "Super admin can create notifications" ON public.schedule_notifications
  FOR INSERT
  WITH CHECK ((SELECT public.current_user_role()) = 'super_admin');

-- RESTRICTIVE tenant isolation — ANDed with every permissive policy above.
DROP POLICY IF EXISTS "tenant_isolation" ON public.schedule_notifications;
CREATE POLICY "tenant_isolation" ON public.schedule_notifications
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = (SELECT public.current_user_tenant_id())
    OR (SELECT public.current_user_role()) = 'super_admin'
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = (SELECT public.current_user_tenant_id())
    OR (SELECT public.current_user_role()) = 'super_admin'
  );

-- NOTE: deliberately NO client INSERT/UPDATE/DELETE policies here.

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Codify the live policies (drift: they existed in prod but in no migration).

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- Matches prod: USING only, WITH CHECK inherits USING per Postgres semantics.
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tenant_isolation" ON public.notifications;
CREATE POLICY "tenant_isolation" ON public.notifications
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = (SELECT public.current_user_tenant_id())
    OR (SELECT public.current_user_role()) = 'super_admin'
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = (SELECT public.current_user_tenant_id())
    OR (SELECT public.current_user_role()) = 'super_admin'
  );

-- NOTE: deliberately NO client INSERT/DELETE policies here either.
