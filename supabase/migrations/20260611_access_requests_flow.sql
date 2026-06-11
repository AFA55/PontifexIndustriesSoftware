-- =====================================================
-- Migration: Access Requests → Invite Pipeline (Jun 11, 2026)
-- Additive + idempotent. Safe to re-run.
--
-- Context: the public /request-access form writes access_requests rows with
-- tenant_id = NULL (the form has no tenant context), and the legacy approval
-- flow created accounts directly instead of using the invite/setup-account
-- pipeline. The new flow approves a request by creating a user_invitations
-- row (CSPRNG token + setup-link email) and linking it back here.
-- =====================================================

-- 1) Widen the assigned_role CHECK to the full role taxonomy.
--    The original constraint only allowed ('admin','operator') (later
--    'apprentice') — approving as any other role would violate it.
DO $$ BEGIN
  ALTER TABLE public.access_requests
    DROP CONSTRAINT IF EXISTS access_requests_assigned_role_check;
  ALTER TABLE public.access_requests
    ADD CONSTRAINT access_requests_assigned_role_check
    CHECK (
      assigned_role IS NULL OR assigned_role IN (
        'super_admin',
        'operations_manager',
        'admin',
        'supervisor',
        'salesman',
        'shop_manager',
        'inventory_manager',
        'operator',
        'shop_help',
        'apprentice'
      )
    );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 2) Link an approved request to the invitation it produced.
DO $$ BEGIN
  ALTER TABLE public.access_requests
    ADD COLUMN IF NOT EXISTS invitation_id UUID REFERENCES public.user_invitations(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

COMMENT ON COLUMN public.access_requests.invitation_id IS
  'user_invitations row created when this request was approved (invite/setup-account pipeline).';

-- 3) Indexes (FK columns + tenant scoping).
CREATE INDEX IF NOT EXISTS idx_access_requests_tenant_id
  ON public.access_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_invitation_id
  ON public.access_requests(invitation_id);

-- 4) Backfill: claim existing unclaimed rows for the original tenant
--    (Patriot), matching the 20260328 multi-tenant backfill convention.
--    Future rows still arrive with tenant_id = NULL and are claimed by the
--    acting admin's tenant at approve/deny time; admin list queries match
--    (tenant_id = caller's tenant OR tenant_id IS NULL).
UPDATE public.access_requests
SET tenant_id = (SELECT id FROM public.tenants WHERE company_code = 'PATRIOT' LIMIT 1)
WHERE tenant_id IS NULL
  AND EXISTS (SELECT 1 FROM public.tenants WHERE company_code = 'PATRIOT');
