-- APPLIED TO PROD 2026-06-05 via Supabase MCP (subsistence_rate_setting_20260605).
-- Per-tenant subsistence pay rate ($/night). 0 = count nights only (no auto pay).
-- Additive; default preserves current behavior.
ALTER TABLE public.timecard_settings_v2
  ADD COLUMN IF NOT EXISTS subsistence_rate numeric NOT NULL DEFAULT 0;
