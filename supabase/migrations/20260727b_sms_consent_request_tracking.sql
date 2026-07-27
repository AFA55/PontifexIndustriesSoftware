-- Opt-in "request sent" tracking so the Send-opt-in button reflects state
-- (Send → Request sent → Opted in). Additive + idempotent. Applied to prod
-- 2026-07-27 via Supabase MCP.

-- 1. When an opt-in REQUEST was last sent (pending state, before acceptance).
ALTER TABLE public.sms_consent
  ADD COLUMN IF NOT EXISTS requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sms_consent_tenant_phone
  ON public.sms_consent(tenant_id, phone);

COMMENT ON COLUMN public.sms_consent.requested_at IS
  'When an opt-in request was last sent to this phone (pending state). consented=true + revoked_at IS NULL = accepted.';

-- 2. Allow consent_method='request_sent' for the pending row (widen the CHECK).
ALTER TABLE public.sms_consent DROP CONSTRAINT IF EXISTS sms_consent_consent_method_check;
ALTER TABLE public.sms_consent ADD CONSTRAINT sms_consent_consent_method_check
  CHECK (consent_method IN ('web_form','verbal','written','imported','request_sent'));
