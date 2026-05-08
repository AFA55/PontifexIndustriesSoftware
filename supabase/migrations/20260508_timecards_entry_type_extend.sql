-- Existing constraint allowed: regular, overtime, double_time, time_off,
-- holiday, no_call_no_show, late. Extend to also allow:
--   pto      (paid time off — friendly synonym for time_off)
--   sick     (sick day)
--   manual   (admin manually entered worked hours, not PTO)
--   admin_adjustment (correction)
-- All existing values preserved → no data migration required.

ALTER TABLE public.timecards DROP CONSTRAINT IF EXISTS timecards_entry_type_check;

ALTER TABLE public.timecards
  ADD CONSTRAINT timecards_entry_type_check
  CHECK (entry_type IN (
    'regular','overtime','double_time','time_off','holiday','no_call_no_show','late',
    'pto','sick','manual','admin_adjustment'
  ));

COMMENT ON COLUMN public.timecards.entry_type IS
  'Categorizes a timecard entry. clock-punch shifts default to regular. Admin manual entries can be: pto/time_off (paid time off), holiday, sick, manual (worked but not clocked in), admin_adjustment (correction).';
