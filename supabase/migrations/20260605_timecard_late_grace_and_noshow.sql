-- APPLIED TO PROD 2026-06-05 via Supabase MCP (timecard_late_grace_and_noshow_20260605).
-- Feature 1: admin-configurable late grace minutes, stored in the ACTIVE settings
-- table (timecard_settings_v2 — the one clock-in/out actually read). DEFAULT 15 =
-- behavior-preserving (matches the previous hardcoded threshold).
ALTER TABLE public.timecard_settings_v2
  ADD COLUMN IF NOT EXISTS late_grace_minutes int NOT NULL DEFAULT 15;

-- Feature 2: one no-show timecard row per operator per day (idempotent). Partial
-- index — does not affect normal multi-entry days. (Verified 0 existing dups.)
CREATE UNIQUE INDEX IF NOT EXISTS timecards_one_no_show_per_day
  ON public.timecards (user_id, date)
  WHERE entry_type = 'no_call_no_show';
