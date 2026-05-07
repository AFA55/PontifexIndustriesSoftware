-- Lunch override audit fields. Set when an admin edits the lunch deduction
-- on a timecard (e.g. extending past 30min, or zeroing out for short shifts).
-- The lunch_duration_minutes column already exists; these add the WHO/WHEN/WHY.

ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS lunch_override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS lunch_override_at timestamptz;

ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS lunch_override_reason text;

COMMENT ON COLUMN public.timecards.lunch_override_by IS
  'Admin who manually edited lunch_duration_minutes. NULL means lunch was auto-applied at clock-out per timecard_settings.';
COMMENT ON COLUMN public.timecards.lunch_override_at IS
  'When the admin override happened.';
COMMENT ON COLUMN public.timecards.lunch_override_reason IS
  'Optional admin note explaining the override (e.g. "extended lunch, doctor appt", "short shift, no lunch taken").';
