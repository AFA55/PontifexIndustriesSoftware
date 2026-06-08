-- Migration: Profile setup columns (invite/onboarding flow)
-- Date: 2026-06-08
-- APPLIED TO PROD 2026-06-08
--
-- Guarantees the optional columns the setup-account/complete route writes exist,
-- so a fresh environment (or a not-yet-migrated branch DB) never leaves a newly
-- onboarded user with a login but no profile because of a missing column.
--
-- These columns already exist in the current production DB; the
-- `ADD COLUMN IF NOT EXISTS` form makes this a safe no-op there and a real fix
-- anywhere they're absent. Additive + idempotent only — no drops, no destructive
-- ALTERs.
--
-- NOTE: the route is ALSO defensive at the application layer — it upserts the
-- core profile (id, full_name, role, tenant_id, active) FIRST with only
-- guaranteed columns, then best-effort updates these optional fields with a
-- 42703 fallback. This migration removes the need for that fallback once applied.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS setup_completed      boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_consent boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS waiver_signed_at     timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS waiver_ip            text;
