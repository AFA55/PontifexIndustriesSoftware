-- Migration: Add late tracking columns to timecards
-- Tracks whether an operator clocked in late relative to their scheduled job arrival time

ALTER TABLE public.timecards ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT FALSE;
ALTER TABLE public.timecards ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0;
ALTER TABLE public.timecards ADD COLUMN IF NOT EXISTS scheduled_start_time TIME;
ALTER TABLE public.timecards ADD COLUMN IF NOT EXISTS late_notified_at TIMESTAMPTZ;
