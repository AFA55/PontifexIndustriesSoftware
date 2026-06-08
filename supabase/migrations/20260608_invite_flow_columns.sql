-- Migration: Invite flow — user_invitations columns + RLS hardening
-- Date: 2026-06-08
-- APPLIED TO PROD 2026-06-08
--
-- Context: the "Invite a team member" flow lets an admin onboard their crew.
-- The invite route already writes invited_name / phone_number / date_of_birth,
-- but those columns were missing from production (the route silently fell back
-- to inserting WITHOUT them, losing the invitee's name). This migration adds the
-- missing columns idempotently and adds a tenant-scoped RLS policy so tenant
-- admins (not just super_admin / operations_manager) can manage their own
-- invitations. The API uses the service-role client, so RLS is defense-in-depth.
--
-- Additive + idempotent only — no drops, no destructive ALTERs.

-- ============================================================
-- 1. Missing columns on user_invitations
-- ============================================================
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS invited_name  text;
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS phone_number  text;
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS date_of_birth date;
-- used_at: explicit single-use marker. accepted_at already exists and is the
-- primary "consumed" signal, but used_at gives a clearer audit field and lets
-- the complete route hard-stop a re-used token even if accepted_at semantics
-- ever change.
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS used_at       timestamptz;
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now();

-- ============================================================
-- 2. Index for token lookups (validate/complete/avatar all query by token).
--    NOTE: a UNIQUE index on token is created in 20260608_invite_token_unique.sql
--    (B3 fix) which ALSO serves token lookups, so we don't add a plain index
--    here to avoid a redundant duplicate index.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_invitations_tenant_email
  ON public.user_invitations (tenant_id, lower(email));

-- ============================================================
-- 3. RLS — let tenant admins manage invitations for their OWN tenant.
--    Uses the SECURITY DEFINER helpers (never auth.jwt() -> user_metadata).
--    The existing super_admin_manage_invitations policy stays in place.
-- ============================================================
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "tenant_admin_manage_invitations" ON public.user_invitations
    FOR ALL
    TO authenticated
    USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin','super_admin','operations_manager')
    )
    WITH CHECK (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin','super_admin','operations_manager')
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
