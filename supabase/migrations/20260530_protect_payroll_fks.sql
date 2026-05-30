-- Payroll-loss protection: timecards + pay tables CASCADE off the person (auth.users/profiles).
-- An admin offboarding path that deletes a user/profile would silently destroy legally-required
-- payroll. Change those person-referencing FKs to ON DELETE RESTRICT so such a delete FAILS
-- loudly, forcing the correct flow (deactivate / close_account anonymize, which never deletes
-- the row). Parent-child cascades (pay_period->entries, timecard->breaks, job->standby) untouched.
-- Applied to prod 2026-05-30.
ALTER TABLE public.timecards DROP CONSTRAINT timecards_user_id_fkey;
ALTER TABLE public.timecards ADD CONSTRAINT timecards_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.operator_pay_rates DROP CONSTRAINT operator_pay_rates_operator_id_fkey;
ALTER TABLE public.operator_pay_rates ADD CONSTRAINT operator_pay_rates_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.pay_period_entries DROP CONSTRAINT pay_period_entries_operator_id_fkey;
ALTER TABLE public.pay_period_entries ADD CONSTRAINT pay_period_entries_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.standby_logs DROP CONSTRAINT standby_logs_operator_id_fkey;
ALTER TABLE public.standby_logs ADD CONSTRAINT standby_logs_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES profiles(id) ON DELETE RESTRICT;
