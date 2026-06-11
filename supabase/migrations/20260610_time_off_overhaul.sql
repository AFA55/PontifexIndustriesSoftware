-- ============================================================================
-- Migration: Time-Off Request Overhaul (additive, idempotent)
-- Date: 2026-06-10
--
-- Adds the columns needed for the full request lifecycle:
--   pay_override — set to 'unpaid' when an approver approves a paid request
--                  but converts it to unpaid (visible to the requester).
--   edited_at    — set when the requester edits a still-pending request;
--                  approvers see an "edited" indicator and the request is
--                  re-reviewed from scratch.
--
-- NOTE: status / request_type / is_callout / pto_days_used / approved_at
-- already exist in production (applied via MCP in an earlier session) even
-- though they are absent from the repo migration files. This migration only
-- adds what is genuinely missing.
-- ============================================================================

-- Approver pay-type override ('unpaid' is the only supported value for now)
ALTER TABLE public.operator_time_off
  ADD COLUMN IF NOT EXISTS pay_override TEXT;

DO $$
BEGIN
  ALTER TABLE public.operator_time_off
    ADD CONSTRAINT operator_time_off_pay_override_check
    CHECK (pay_override IS NULL OR pay_override IN ('unpaid'));
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already exists
END $$;

-- Requester-edit timestamp (request was modified while pending)
ALTER TABLE public.operator_time_off
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Fast pending-queue lookups (admin inbox) and per-operator history
CREATE INDEX IF NOT EXISTS idx_time_off_tenant_status
  ON public.operator_time_off(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_time_off_operator_status
  ON public.operator_time_off(operator_id, status);

COMMENT ON COLUMN public.operator_time_off.pay_override IS
  'Approver override of pay type. ''unpaid'' = approved but converted to unpaid (requester sees the change). NULL = no override.';
COMMENT ON COLUMN public.operator_time_off.edited_at IS
  'Set when the requester edits a pending request; signals approvers the request changed since submission.';
