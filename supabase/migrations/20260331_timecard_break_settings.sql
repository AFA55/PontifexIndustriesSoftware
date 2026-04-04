-- ============================================================
-- ADD MISSING BREAK SETTINGS COLUMNS TO timecard_settings_v2
-- Applied: 2026-03-31
-- ============================================================

-- break_threshold_hours: only auto-deduct if worked more than X hours
ALTER TABLE timecard_settings_v2
  ADD COLUMN IF NOT EXISTS break_threshold_hours numeric(4,2) DEFAULT 6;

-- break_is_paid: if true, break counts toward paid time (not subtracted)
ALTER TABLE timecard_settings_v2
  ADD COLUMN IF NOT EXISTS break_is_paid boolean DEFAULT false;

-- Remove 'break_start' and 'break_end' from timecard_gps_logs event_type CHECK
-- (breaks are now auto-deducted, not logged as segments)
ALTER TABLE timecard_gps_logs DROP CONSTRAINT IF EXISTS timecard_gps_logs_event_type_check;
ALTER TABLE timecard_gps_logs ADD CONSTRAINT timecard_gps_logs_event_type_check
  CHECK (event_type IN ('clock_in', 'clock_out', 'start_route', 'arrive_site', 'start_work', 'complete', 'periodic'));
