-- Optional display title shown in place of the raw role (e.g. "Ops Dispatch"
-- instead of "operations_manager"). Does NOT affect permissions — role still
-- governs access. Additive + idempotent. Applied to prod 2026-07-27 via MCP.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_title text;
COMMENT ON COLUMN public.profiles.job_title IS
  'Display-only job title shown instead of the role label. Not used for authorization.';
