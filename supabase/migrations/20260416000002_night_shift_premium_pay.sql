-- Add night shift multiplier to settings
ALTER TABLE public.timecard_settings_v2
  ADD COLUMN IF NOT EXISTS night_shift_multiplier NUMERIC DEFAULT 1.25 CHECK (night_shift_multiplier >= 1.0 AND night_shift_multiplier <= 3.0);

-- Add night shift premium hours breakdown to timecards
ALTER TABLE public.timecards
  ADD COLUMN IF NOT EXISTS night_shift_premium_hours DECIMAL(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_type_override TEXT CHECK (pay_type_override IN ('regular', 'night_shift_premium', 'overtime', 'double_time', 'mandatory_overtime'));

-- Comment explaining pay_type_override
COMMENT ON COLUMN public.timecards.pay_type_override IS 'Admin manual override. NULL = auto-calculated from is_night_shift + weekly hours. Set to override.';
COMMENT ON COLUMN public.timecards.night_shift_premium_hours IS 'Hours that qualify for night shift premium rate (after weekly OT check)';
