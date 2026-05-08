-- Per-user default lunch deduction. NULL = use tenant default
-- (timecard_settings.break_duration_minutes, currently 30).
-- Shop manager wants 60 min; everyone else stays on tenant default.
-- Admins can edit this on the team-profile page.
-- Auto-applied at clock-out: if profile has a non-null value, that wins
-- over the tenant default.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_lunch_minutes integer;

COMMENT ON COLUMN public.profiles.default_lunch_minutes IS
  'Per-user default lunch deduction in minutes (auto-applied at clock-out when shift > break_threshold_hours). NULL means use the tenant-level default from timecard_settings. Range 0-480.';

-- Seed: Demo Shop Manager gets 60min lunch per user spec.
UPDATE public.profiles
   SET default_lunch_minutes = 60
 WHERE email = 'shopmanager@pontifex.com'
   AND default_lunch_minutes IS NULL;
