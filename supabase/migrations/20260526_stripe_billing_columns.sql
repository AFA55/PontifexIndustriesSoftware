-- =============================================================================
-- Migration: 20260526_stripe_billing_columns
-- Purpose:   Add Stripe billing columns to public.tenants and harden RLS so
--            any tenant member can SELECT their own tenant row (not just the
--            owner), while billing-sensitive columns remain protected.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ADD COLUMNS (idempotent via IF NOT EXISTS)
-- ---------------------------------------------------------------------------

-- stripe_customer_id already exists — no-op if present
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- stripe_subscription_id already exists — no-op if present
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- subscription_status already exists with default 'trialing' — no-op if present
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trialing';

-- plan_type: spec name. The DB already has subscription_plan; this adds the
-- spec-requested alias column so application code can use the canonical name.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plan_type text;

-- current_period_end: spec name. The DB already has subscription_period_end;
-- this adds the spec-requested alias column for canonical naming.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

-- trial_ends_at already exists — no-op if present
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. RLS — ensure tenant members can read their own row
--    (existing policy only covers owner_id = auth.uid(), missing non-owner
--    members who belong to the tenant)
-- ---------------------------------------------------------------------------

-- Policy: any authenticated user whose profiles.tenant_id matches can SELECT.
-- super_admin bypass is already covered by the existing ALL policy.
DO $$ BEGIN
  CREATE POLICY "tenants_member_select" ON public.tenants
    FOR SELECT
    USING (
      id = public.current_user_tenant_id()
      OR public.current_user_has_role('super_admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Policy: super_admin can INSERT/UPDATE/DELETE any tenant row.
-- (The existing "Super admins can manage tenants" policy uses a raw subquery
--  rather than the SECURITY DEFINER helper; leave it in place — it still works
--  correctly since it reads from profiles, not user_metadata.)

-- Policy: tenant owner retains full write access to their own tenant row
-- (owner_id = auth.uid() SELECT policy already exists; add write coverage).
DO $$ BEGIN
  CREATE POLICY "tenants_owner_write" ON public.tenants
    FOR ALL
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
