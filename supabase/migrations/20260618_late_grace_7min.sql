-- Lateness threshold → 7 minutes (founder spec, was 15).
-- The active settings table is public.timecard_settings_v2 (the one clock-in/out
-- read); column public.timecard_settings_v2.late_grace_minutes (int NOT NULL,
-- added DEFAULT 15 in 20260605_timecard_late_grace_and_noshow.sql).
--
-- Idempotent: changing the column DEFAULT and a value UPDATE are both safe to
-- re-run. We move the default 15 → 7 AND realign existing rows that still hold
-- the old default (15) so absent/unconfigured tenants get the 7-minute grace
-- that matches the code default (clock-in route `?? 7`). Rows where an admin has
-- deliberately set a different value (anything other than 15) are left untouched.

ALTER TABLE public.timecard_settings_v2
  ALTER COLUMN late_grace_minutes SET DEFAULT 7;

UPDATE public.timecard_settings_v2
  SET late_grace_minutes = 7
  WHERE late_grace_minutes = 15;
