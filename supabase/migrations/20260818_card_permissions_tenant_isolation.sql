-- ============================================================================
-- user_card_permissions: close the tenant hole before anyone starts using it
-- ============================================================================
-- Aug 18, 2026. The table has existed since March and was EMPTY — the per-user
-- override it stores was never read (every getCardPermission call site passed
-- null), so nobody ever found the two problems in its RLS:
--
--   1. `Admins can manage card permissions` was `USING (is_admin())` with no
--      tenant predicate at all. Permissive, ALL commands, no WITH CHECK — so any
--      admin of any tenant could read and write another company's grants,
--      provided the row escaped the restrictive tenant policy. Which brings us to
--   2. the restrictive `tenant_isolation` policy allowed `tenant_id IS NULL`,
--      and every writer in the app omitted tenant_id. Every row the product
--      would ever have created was going to be NULL-tenant — i.e. inside the
--      escape hatch, visible and writable cross-tenant.
--
-- A permissions table without tenant isolation is a cross-tenant privilege hole,
-- so this is fixed BEFORE the first rows are inserted. The app-side half (the
-- three routes that upsert here now write tenant_id) ships in the same change.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ── 1. Backfill any pre-existing NULL-tenant rows from the owning profile ────
UPDATE public.user_card_permissions ucp
SET tenant_id = p.tenant_id
FROM public.profiles p
WHERE ucp.user_id = p.id
  AND ucp.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

-- ── 2. Tenant isolation, without the NULL escape hatch ──────────────────────
-- Restrictive: it ANDs with everything else, so no permissive policy can grant
-- around it. A NULL-tenant row is now invisible to every client rather than
-- visible to all of them — the safe direction for a row we cannot attribute.
DROP POLICY IF EXISTS tenant_isolation ON public.user_card_permissions;
CREATE POLICY tenant_isolation ON public.user_card_permissions
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

-- ── 3. Who may WRITE a grant ────────────────────────────────────────────────
-- Mirrors the API, which is `requireOpsManager`: handing out permissions is not
-- something every admin should be able to do, and an admin who could write here
-- could promote themselves past their own preset. Replaces the old
-- `is_admin()`-with-no-tenant-check policy.
DROP POLICY IF EXISTS "Admins can manage card permissions" ON public.user_card_permissions;
DROP POLICY IF EXISTS "Super admins can manage all card permissions" ON public.user_card_permissions;
DROP POLICY IF EXISTS card_permissions_managed_by_ops ON public.user_card_permissions;
CREATE POLICY card_permissions_managed_by_ops ON public.user_card_permissions
  FOR ALL
  TO authenticated
  USING (
    public.current_user_has_role('super_admin', 'operations_manager')
  )
  WITH CHECK (
    public.current_user_has_role('super_admin', 'operations_manager')
  );

-- ── 4. Everyone may read their OWN grants ───────────────────────────────────
-- (Still ANDed with the restrictive tenant policy above.)
DROP POLICY IF EXISTS "Users can read own card permissions" ON public.user_card_permissions;
CREATE POLICY card_permissions_read_own ON public.user_card_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── 5. Index the tenant predicate ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_card_permissions_tenant
  ON public.user_card_permissions(tenant_id);

COMMENT ON TABLE public.user_card_permissions IS
  'Per-user overrides of the role preset in lib/rbac.ts. Priority: bypass role → this table → ROLE_PERMISSION_PRESETS. tenant_id is REQUIRED in practice: a NULL-tenant row is invisible to every client and is ignored by the server loader (lib/card-permissions-server.ts), so it grants nothing.';
